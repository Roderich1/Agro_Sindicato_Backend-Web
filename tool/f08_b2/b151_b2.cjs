// BE #151 §A, ítems 1–5 (sesión C, 2026-10-19): comprobaciones acotadas contra Backblaze B2 real
// con el adaptador real S3BackupStorage (cargado desde el código fuente con ts-node) y llamadas S3
// en crudo con el mismo cliente que la API (createS3Client). El ítem 6 (C2, C5 y T-R5) está en
// Back/src/modules/backups/b151-b2-real.postgres.spec.ts.
//
// Secretos: sólo BACKUP_S3_* del entorno (con_b2.ps1). Nunca se imprimen, ni se escriben, ni pasan
// por argv; el informe se sanea y se rechaza si llevara alguno. Antes de tocar nada pregunta a B2
// (b2_authorize_account) qué puede hacer la clave y se niega si no es exactamente el perfil declarado,
// sólo ese bucket y el namePrefix de la raíz (F08_B151_RAIZ, ensayo-f08/b151-<aaaammdd>/; por defecto
// ensayo-f08/b151-20261019/). Exige BACKUP_S3_PREFIX = <raíz><subcarpeta>/ y no lee ni escribe fuera.
// Datos sintéticos (bytes aleatorios). F08_B151_FORMATO sólo cambia las copias del ítem 6 (c6).
//
//   node b151_b2.cjs b2 <rw|ro|nodel> <paso> <dir-salida> [confirmar]
//     pasos: preparar (rw) · caso1 (ro o nodel) · casos2a5 (rw) · c6 (rw: C2 y C5; nodel: T-R5;
//     rotacion, bajo la clave nodel: T-R5 con la purga de la rotación rechazada por B2; exige
//     F08_BKP_PG_TEST_URL) · inventario (cualquiera) · limpiar (rw, exige «confirmar»)
//   node b151_b2.cjs doble todos <todo|c6> <dir-salida>
//     el ciclo de los ítems 1–5 (todo) o la suite del ítem 6 (c6) contra el doble S3 en memoria
//     (NO es B2; valida la herramienta).
// Entorno opcional: F08_B151_BACK (carpeta Back con src/ y node_modules/), F08_B2_NODE_MODULES.
const crypto = require("node:crypto");
const path = require("node:path");
const { Readable } = require("node:stream");

const ROOT = path.resolve(__dirname, "..", "..");
const BACK = process.env.F08_B151_BACK || path.join(ROOT, "Back");
if (process.env.F08_B2_NODE_MODULES) {
  process.env.NODE_PATH = process.env.F08_B2_NODE_MODULES;
  require("node:module").Module._initPaths();
}
const NM = process.env.F08_B2_NODE_MODULES || path.join(BACK, "node_modules");
require(path.join(NM, "ts-node")).register({
  transpileOnly: true,
  project: path.join(BACK, "tsconfig.json"),
  compilerOptions: { module: "commonjs" },
});
const ADAPTER_DIR = path.join(BACK, "src", "modules", "backups", "infrastructure");
// El mismo módulo del SDK que resuelve el adaptador (una sola instancia de las clases de comando).
const sdk = require(require.resolve("@aws-sdk/client-s3", { paths: [ADAPTER_DIR] }));
const { S3BackupStorage, S3_PART_BYTES } = require(path.join(ADAPTER_DIR, "s3-backup-storage.ts"));
const sup = require(path.join(BACK, "src", "modules", "backups", "test-support", "b151-b2-real.ts"));

const KiB = 1024;
const MiB = 1024 * KiB;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
// Content-MD5: comprobación de transporte del protocolo S3, no un uso criptográfico.
const md5 = (b) => crypto.createHash("md5").update(b).digest("base64"); // NOSONAR
const md5hex = (b) => crypto.createHash("md5").update(b).digest("hex"); // NOSONAR
const uuid = () => crypto.randomUUID();
const stagingName = (key) => `${key}.${crypto.randomBytes(8).toString("hex")}.part`;
const chunked = (buf, size = MiB) => {
  const parts = [];
  for (let i = 0; i < buf.length; i += size) parts.push(buf.subarray(i, i + size));
  return Readable.from(parts);
};
const withInput = (cmd, extra) => new cmd.constructor({ ...cmd.input, ...extra });

/** Una ejecución: conexión, perfil (real o simulado), informe y utilidades S3 bajo el prefijo. */
function context(conn, report, profile) {
  const P = conn.settings.prefix;
  const Bucket = conn.settings.bucket;
  const c = { conn, report, profile, P, Bucket };
  c.raw = (cmd) => {
    const key = String(cmd.input.Key ?? cmd.input.Prefix ?? "");
    if (!key.startsWith(P)) throw new Error("clave fuera del prefijo de ensayo: rechazada por la herramienta");
    return conn.sender.send(cmd, { abortSignal: AbortSignal.timeout(120_000) });
  };
  c.attempt = async (fn) => {
    try {
      return { ok: true, value: await fn() };
    } catch (error) {
      return { ok: false, error: sup.errorSummary(error) };
    }
  };
  /** Versiones y marcadores bajo P+sub; con maxKeys, página a página (se registran las páginas). */
  c.versions = async (sub, maxKeys) => {
    const items = [];
    const pages = [];
    let KeyMarker, VersionIdMarker;
    for (let i = 0; i < 100; i++) {
      const r = await c.raw(new sdk.ListObjectVersionsCommand({ Bucket, Prefix: P + sub, KeyMarker, VersionIdMarker, MaxKeys: maxKeys }));
      const v = (r.Versions || []).map((x) => ({ key: x.Key.slice(P.length), versionId: x.VersionId, latest: !!x.IsLatest, size: x.Size, marker: false }));
      const m = (r.DeleteMarkers || []).map((x) => ({ key: x.Key.slice(P.length), versionId: x.VersionId, latest: !!x.IsLatest, size: 0, marker: true }));
      items.push(...v, ...m);
      pages.push({ entradas: v.length + m.length, truncada: !!r.IsTruncated, nextKey: !!r.NextKeyMarker, nextVersion: !!r.NextVersionIdMarker });
      if (!r.IsTruncated) return { items, pages };
      if (!r.NextKeyMarker && !r.NextVersionIdMarker) return { items, pages, estancada: true };
      KeyMarker = r.NextKeyMarker;
      VersionIdMarker = r.NextVersionIdMarker;
    }
    return { items, pages, estancada: true };
  };
  c.uploads = async (sub, maxUploads) => {
    const items = [];
    const pages = [];
    let KeyMarker, UploadIdMarker;
    for (let i = 0; i < 100; i++) {
      const r = await c.raw(new sdk.ListMultipartUploadsCommand({ Bucket, Prefix: P + sub, KeyMarker, UploadIdMarker, MaxUploads: maxUploads }));
      for (const u of r.Uploads || []) items.push({ key: u.Key.slice(P.length), uploadId: u.UploadId });
      pages.push({ entradas: (r.Uploads || []).length, truncada: !!r.IsTruncated, nextKey: !!r.NextKeyMarker, nextUpload: !!r.NextUploadIdMarker });
      if (!r.IsTruncated) return { items, pages };
      if (!r.NextKeyMarker && !r.NextUploadIdMarker) return { items, pages, estancada: true };
      KeyMarker = r.NextKeyMarker;
      UploadIdMarker = r.NextUploadIdMarker;
    }
    return { items, pages, estancada: true };
  };
  c.read = async (rel, VersionId) => {
    const r = await c.raw(new sdk.GetObjectCommand({ Bucket, Key: P + rel, VersionId }));
    const h = crypto.createHash("sha256");
    let n = 0;
    for await (const chunk of r.Body) {
      h.update(chunk);
      n += chunk.length;
    }
    return { sha256: h.digest("hex"), bytes: n };
  };
  c.head = async (rel) => {
    const r = await c.raw(new sdk.HeadObjectCommand({ Bucket, Key: P + rel }));
    return { size: r.ContentLength, sse: r.ServerSideEncryption || null, sha256: r.Metadata?.["agro-sha256"] || null, metaSize: r.Metadata?.["agro-size"] || null, version: sup.shortVersion(r.VersionId) };
  };
  c.put = async (rel, body, extra = {}) =>
    (await c.raw(new sdk.PutObjectCommand({ Bucket, Key: P + rel, Body: body, ContentLength: body.length, ContentMD5: md5(body), ContentType: "application/octet-stream", ServerSideEncryption: "AES256", ...extra }))).VersionId;
  /** Borra por versionId todo lo que haya bajo P+sub y aborta sus multipart; devuelve lo que quede. */
  c.purge = async (sub) => {
    for (const v of (await c.versions(sub)).items) await c.raw(new sdk.DeleteObjectCommand({ Bucket, Key: P + v.key, VersionId: v.versionId }));
    for (const u of (await c.uploads(sub)).items) await c.raw(new sdk.AbortMultipartUploadCommand({ Bucket, Key: P + u.key, UploadId: u.uploadId }));
    return (await c.versions(sub)).items.length + (await c.uploads(sub)).items.length;
  };
  c.storage = (sub, sender = conn.sender) => new S3BackupStorage(sender, { bucket: Bucket, prefix: P + sub });
  c.add = (caso, esperado, observado, ok, nota, veredicto) =>
    report.add({ caso, perfil: profile, esperado, observado, veredicto: veredicto ?? (ok ? "PASS" : "FAIL"), ...(nota ? { nota } : {}) });
  c.short = (v) => sup.shortVersion(v);
  return c;
}

/** Envoltura de sólo herramienta sobre el cliente: modifica o observa comandos sin tocar el adaptador. */
function instrument(inner, hooks = {}) {
  const calls = [];
  return {
    calls,
    send: async (command, options) => {
      const cmd = (hooks.before && (await hooks.before(command))) || command;
      try {
        const out = await inner.send(cmd, options);
        calls.push({ name: cmd.constructor.name, truncada: out?.IsTruncated === true });
        if (hooks.after) await hooks.after(cmd, out);
        return out;
      } catch (error) {
        calls.push({ name: cmd.constructor.name, error: sup.errorSummary(error).name });
        throw error;
      }
    },
  };
}

const denied = (r) => !r.ok && sup.isAccessDenied(r.error);
/**
 * Un caso del adaptador que debe fallar por permisos: PASS sólo con el rechazo del proveedor;
 * un éxito es FAIL; otro error (timeout, fallo de la herramienta) no prueba nada: NO_CONCLUYENTE.
 */
const refusal = (r) => (denied(r) ? "PASS" : r.ok ? "FAIL" : "NO_CONCLUYENTE");
const snapshot = (items) => items.map((v) => `${v.key}|${v.versionId}|${v.marker}|${v.latest}`).sort().join("\n");

// ---------------------------------------------------------------- caso 1: claves sin escritura o sin borrado

async function preparar(c) {
  const before = await c.versions("c1/");
  if (before.items.length || (await c.uploads("c1/")).items.length) {
    c.add("preparar: c1/ vacío antes de crear la copia válida de referencia", "c1/ vacío", { entradas: before.items.length }, false,
      "Usa otra subcarpeta en BACKUP_S3_PREFIX o ejecuta «limpiar» antes.");
    return;
  }
  const key = uuid();
  const bytes = crypto.randomBytes(64 * KiB);
  const staged = await c.storage("c1/").stage(key, chunked(bytes));
  await staged.commit();
  const vs = (await c.versions("c1/")).items;
  const read = await c.read(`c1/objects/${key}`);
  const head = await c.head(`c1/objects/${key}`);
  c.add("preparar: copia válida de referencia en c1/objects/ por el adaptador (stage + commit)",
    "1 versión, sin staging; bytes y agro-sha256 iguales al SHA-256 enviado",
    { entradas: vs.length, sha256: read.sha256.slice(0, 12), sse: head.sse, agroSha256Igual: head.sha256 === sha(bytes) },
    vs.length === 1 && read.sha256 === sha(bytes) && head.sha256 === sha(bytes));
}

async function caso1(c) {
  const fixture = (await c.versions("c1/objects/")).items;
  if (fixture.length !== 1 || fixture[0].marker) {
    c.add("1: copia válida de referencia presente (de «preparar» con rw)", "exactamente 1 versión en c1/objects/", { entradas: fixture.length }, false);
    return;
  }
  const K = fixture[0].key.slice("c1/objects/".length);
  const vK = fixture[0].versionId;
  const ref = await c.read(`c1/objects/${K}`);
  const before = snapshot((await c.versions("c1/")).items);
  const st = c.storage("c1/");

  if (c.profile === "ro") {
    const a = await c.attempt(() => c.put(`c1/staging/${stagingName(uuid())}`, crypto.randomBytes(KiB)));
    c.add("1-ro: PutObject en crudo", "rechazo de permisos (403), nada escrito", a, denied(a));
    const b = await c.attempt(() => c.raw(new sdk.CreateMultipartUploadCommand({ Bucket: c.Bucket, Key: `${c.P}c1/staging/${stagingName(uuid())}`, ContentType: "application/octet-stream" })));
    c.add("1-ro: CreateMultipartUpload en crudo", "rechazo de permisos (403)", b, denied(b));
    const cp = await c.attempt(() => c.raw(new sdk.CopyObjectCommand({ Bucket: c.Bucket, Key: `${c.P}c1/objects/${uuid()}`, CopySource: `${c.Bucket}/${c.P}c1/objects/${K}?versionId=${encodeURIComponent(vK)}` })));
    c.add("1-ro: CopyObject en crudo", "rechazo de permisos (403)", cp, denied(cp));
    const d = await c.attempt(() => c.raw(new sdk.DeleteObjectCommand({ Bucket: c.Bucket, Key: `${c.P}c1/objects/${K}`, VersionId: vK })));
    c.add("1-ro: DeleteObject por versionId en crudo sobre la copia válida", "rechazo de permisos (403)", d, denied(d));
    const h = await c.attempt(() => c.raw(new sdk.DeleteObjectCommand({ Bucket: c.Bucket, Key: `${c.P}c1/objects/${K}` })));
    c.add("1-ro: DeleteObject sin versionId (marcador) en crudo sobre la copia válida", "rechazo de permisos (403), sin marcador", h, denied(h));
    const s1 = await c.attempt(() => st.stage(uuid(), chunked(crypto.randomBytes(KiB))));
    c.add("1-ro: adaptador stage (PutObject)", "rechazo de permisos del proveedor propagado, sin éxito aparente", { ok: s1.ok, error: s1.error }, null, undefined, refusal(s1));
    const s2 = await c.attempt(() => st.stage(uuid(), chunked(crypto.randomBytes(S3_PART_BYTES + MiB))));
    c.add("1-ro: adaptador stage multipart (> 8 MiB)", "rechazo de permisos del proveedor propagado, sin éxito aparente", { ok: s2.ok, error: s2.error }, null, undefined, refusal(s2));
  } else {
    const d = await c.attempt(() => c.raw(new sdk.DeleteObjectCommand({ Bucket: c.Bucket, Key: `${c.P}c1/objects/${K}`, VersionId: vK })));
    c.add("1-nodel: DeleteObject por versionId en crudo sobre la copia válida", "rechazo de permisos (403)", d, denied(d));
    // Sin versionId B2 puede tratarlo como «ocultar» (writeFiles): se prueba sobre un objeto propio, nunca sobre la copia válida.
    const hidden = `c1-oculto/${uuid()}`;
    const hv = await c.put(hidden, crypto.randomBytes(KiB));
    const h = await c.attempt(() => c.raw(new sdk.DeleteObjectCommand({ Bucket: c.Bucket, Key: c.P + hidden })));
    const hs = (await c.versions(hidden)).items;
    const kept = hs.some((v) => v.versionId === hv && !v.marker);
    c.add("1-nodel: DeleteObject sin versionId (marcador) en crudo, sobre un objeto de prueba propio",
      "rechazo (403); o, si B2 lo admite como «ocultar» con writeFiles, sólo un marcador sin perder bytes (se registra cuál)",
      { resultado: h.ok ? "aceptado" : h.error, marcadores: hs.filter((v) => v.marker).length, versionConservada: kept },
      denied(h) || (h.ok && kept),
      h.ok ? "B2 aceptó el marcador sin deleteFiles: una clave sin borrado puede ocultar un nombre, aunque no borre sus bytes. El adaptador nunca envía un borrado sin versionId." : undefined);
    const rm = await c.attempt(() => st.remove(K));
    c.add("1-nodel: adaptador remove de la copia válida", "rechazo de permisos del proveedor propagado (no resuelve)", rm, null, undefined, refusal(rm));
    const k2 = uuid();
    const staged = await c.attempt(() => st.stage(k2, chunked(crypto.randomBytes(4 * KiB))));
    const commit = staged.ok ? await c.attempt(() => staged.value.commit()) : null;
    const residue = (await c.versions(`c1/objects/${k2}`)).items.length + (await c.versions(`c1/staging/${k2}.`)).items.length;
    c.add("1-nodel: adaptador stage + commit (el commit purga el staging por versionId)",
      "stage aceptado (writeFiles); commit con error cerrado, sin éxito aparente; quedan restos para «limpiar» con rw",
      { stage: staged.ok ? "ok" : staged.error, commit: commit && (commit.ok ? "ok" : commit.error), restosEnB2: residue },
      null, undefined, staged.ok ? refusal(commit) : "FAIL");
    const dis = await c.attempt(() => st.discardStaged(k2));
    c.add("1-nodel: adaptador discardStaged de esos restos", "rechazo de permisos del proveedor propagado (no resuelve)", dis, null, undefined, refusal(dis));
  }

  const after = (await c.versions("c1/")).items;
  const afterRead = await c.read(`c1/objects/${K}`);
  const opened = await c.attempt(async () => {
    const o = await st.open(K);
    const h = crypto.createHash("sha256");
    for await (const chunk of o.stream) h.update(chunk);
    return h.digest("hex");
  });
  const same = after.filter((v) => v.key === `c1/objects/${K}`);
  const intact = same.length === 1 && same[0].versionId === vK && same[0].latest && !same[0].marker && afterRead.sha256 === ref.sha256 && opened.ok && opened.value === ref.sha256;
  c.add(`1-${c.profile}: la copia válida sigue intacta (misma versión, última, sin marcador; bytes iguales; el adaptador la abre)`,
    "ninguna copia válida perdida",
    { versiones: same.length, mismaVersion: same[0]?.versionId === vK, sha256: afterRead.sha256.slice(0, 12), open: opened.ok ? "ok" : opened.error },
    intact);
  if (c.profile === "ro")
    c.add("1-ro: nada cambió bajo c1/", "mismas versiones y marcadores que antes", { igual: snapshot(after) === before }, snapshot(after) === before);
}

// ---------------------------------------------------------------- caso 2: Content-MD5 incorrecto

async function caso2(c) {
  const name = `c2/staging/${stagingName(uuid())}`;
  const body = crypto.randomBytes(KiB);
  const bad = md5(Buffer.concat([body, Buffer.from([1])]));
  const a = await c.attempt(() => c.put(name, body, { ContentMD5: bad }));
  const left = (await c.versions(name)).items.length;
  c.add("2a: PutObject en crudo con Content-MD5 de otros bytes",
    "rechazo 400 (BadDigest o el código real de B2, registrado tal cual); ninguna versión creada",
    { error: a.error ?? "aceptado", versiones: left }, !a.ok && a.error.status === 400 && left === 0);

  const mpName = `c2/staging/${stagingName(uuid())}`;
  const created = await c.raw(new sdk.CreateMultipartUploadCommand({ Bucket: c.Bucket, Key: c.P + mpName, ContentType: "application/octet-stream", ServerSideEncryption: "AES256" }));
  const part = crypto.randomBytes(KiB);
  const b = await c.attempt(() => c.raw(new sdk.UploadPartCommand({ Bucket: c.Bucket, Key: c.P + mpName, UploadId: created.UploadId, PartNumber: 1, Body: part, ContentLength: part.length, ContentMD5: md5(Buffer.concat([part, Buffer.from([1])])) })));
  const parts = await c.attempt(async () => ((await c.raw(new sdk.ListPartsCommand({ Bucket: c.Bucket, Key: c.P + mpName, UploadId: created.UploadId }))).Parts || []).length);
  await c.raw(new sdk.AbortMultipartUploadCommand({ Bucket: c.Bucket, Key: c.P + mpName, UploadId: created.UploadId }));
  c.add("2b: UploadPart en crudo con Content-MD5 de otros bytes",
    "rechazo 400 (código real registrado); ninguna parte registrada",
    { error: b.error ?? "aceptado", partes: parts.ok ? parts.value : parts.error }, !b.ok && b.error.status === 400 && parts.ok && parts.value === 0);

  for (const [label, size, target] of [["2c: adaptador stage simple (PutObject)", 4 * KiB, "PutObjectCommand"], ["2d: adaptador stage multipart (UploadPart 1)", S3_PART_BYTES + MiB, "UploadPartCommand"]]) {
    let corrupted = false;
    const inst = instrument(c.conn.sender, {
      before: (cmd) => {
        if (!corrupted && cmd.constructor.name === target) {
          corrupted = true;
          return withInput(cmd, { ContentMD5: md5(Buffer.from("otros bytes")) });
        }
      },
    });
    const key = uuid();
    const r = await c.attempt(() => c.storage("c2/", inst).stage(key, chunked(crypto.randomBytes(size))));
    const rest = (await c.versions(`c2/staging/${key}.`)).items.length + (await c.uploads(`c2/staging/${key}.`)).items.length;
    c.add(`${label} con Content-MD5 alterado por la herramienta`, "error cerrado del adaptador; sin versiones ni multipart del staging",
      { error: r.ok ? "aceptado" : r.error, restos: rest, llamadas: inst.calls.map((x) => x.name + (x.error ? `!${x.error}` : "")) }, !r.ok && rest === 0);
  }
  const remaining = await c.purge("c2/");
  c.add("2: c2/ limpio al terminar", "0 versiones y 0 multipart", { restantes: remaining }, remaining === 0);
}

// ---------------------------------------------------------------- caso 3: paginación

async function caso3(c) {
  const kA = uuid(), kB = uuid(), kC = uuid(), kD = uuid();
  await c.put(`c3/objects/${kA}`, crypto.randomBytes(KiB));
  await c.put(`c3/objects/${kA}`, crypto.randomBytes(KiB));
  await c.put(`c3/objects/${kB}`, crypto.randomBytes(KiB));
  await c.raw(new sdk.DeleteObjectCommand({ Bucket: c.Bucket, Key: `${c.P}c3/objects/${kB}` }));
  const nameD = `c3/staging/${stagingName(kD)}`;
  for (const n of [`c3/staging/${stagingName(kC)}`, nameD])
    await c.raw(new sdk.CreateMultipartUploadCommand({ Bucket: c.Bucket, Key: c.P + n, ContentType: "application/octet-stream" }));

  const all = await c.versions("c3/");
  const reference = snapshot(all.items);
  for (const max of [1, 2]) {
    const paged = await c.versions("c3/", max);
    const honoured = paged.pages.length > 1 && paged.pages.every((p) => p.entradas <= max);
    const equal = snapshot(paged.items) === reference;
    c.add(`3a: ListObjectVersions en crudo con MaxKeys=${max} (${all.items.length} entradas: 3 versiones y 1 marcador)`,
      `varias páginas de ≤ ${max} con IsTruncated y marcadores Next*; la unión es igual al listado sin límite`,
      { paginas: paged.pages, unionIgual: equal, estancada: !!paged.estancada },
      equal && !paged.estancada && honoured, honoured ? undefined : "El proveedor no paginó con ese MaxKeys: los bucles no se ejercitaron.",
      equal && !paged.estancada && !honoured ? "NO_CONCLUYENTE" : undefined);
  }
  const allUp = await c.uploads("c3/");
  const pagedUp = await c.uploads("c3/", 1);
  const upHonoured = pagedUp.pages.length > 1 && pagedUp.pages.every((p) => p.entradas <= 1);
  const upEqual = JSON.stringify(pagedUp.items.map((u) => u.uploadId).sort()) === JSON.stringify(allUp.items.map((u) => u.uploadId).sort());
  c.add(`3b: ListMultipartUploads en crudo con MaxUploads=1 (${allUp.items.length} multipart sin terminar)`,
    "2 páginas de 1 con IsTruncated y marcadores Next*; la unión es igual al listado sin límite",
    { paginas: pagedUp.pages, unionIgual: upEqual, estancada: !!pagedUp.estancada },
    upEqual && !pagedUp.estancada && upHonoured, upHonoured ? undefined : "El proveedor no paginó con MaxUploads=1.",
    upEqual && !pagedUp.estancada && !upHonoured ? "NO_CONCLUYENTE" : undefined);

  // Inyección de sólo herramienta: el adaptador no expone el tamaño de página.
  const inst = instrument(c.conn.sender, {
    before: (cmd) => {
      if (cmd.constructor.name === "ListObjectVersionsCommand") return withInput(cmd, { MaxKeys: 1 });
      if (cmd.constructor.name === "ListMultipartUploadsCommand") return withInput(cmd, { MaxUploads: 1 });
    },
  });
  const st = c.storage("c3/", inst);
  const listed = await st.list();
  const truncV = inst.calls.filter((x) => x.name === "ListObjectVersionsCommand" && x.truncada).length;
  const truncU = inst.calls.filter((x) => x.name === "ListMultipartUploadsCommand" && x.truncada).length;
  const objects = listed.filter((f) => f.area === "objects");
  const incomplete = listed.filter((f) => f.incompleteUpload);
  const listOk = objects.length === 4 && objects.filter((f) => f.deleteMarker).length === 1 &&
    objects.filter((f) => !f.hidden).length === 1 && incomplete.length === 2 && incomplete.every((f) => [kC, kD].includes(f.key));
  c.add("3c: adaptador list() (inventario) con MaxKeys=1 y MaxUploads=1 inyectados",
    "4 entradas en objects/ (1 marcador, 1 sola visible) y 2 multipart sin terminar de staging/, recorriendo varias páginas",
    { objetos: objects.length, marcadores: objects.filter((f) => f.deleteMarker).length, multipart: incomplete.length, paginasTruncadasVersiones: truncV, paginasTruncadasUploads: truncU },
    listOk && truncV > 0 && truncU > 0, truncV && truncU ? undefined : "Sin páginas truncadas: el proveedor no paginó y los bucles no se ejercitaron.",
    listOk && !(truncV > 0 && truncU > 0) ? "NO_CONCLUYENTE" : undefined);

  const steps = [];
  const callsBefore3d = inst.calls.length;
  for (const [label, fn] of [["remove A (2 versiones)", () => st.remove(kA)], ["remove B (versión + marcador)", () => st.remove(kB)], ["discardStaged C", () => st.discardStaged(kC)], ["removeStagedFile D", () => st.removeStagedFile(nameD.slice("c3/staging/".length))]]) {
    const r = await c.attempt(fn);
    steps.push({ paso: label, resultado: r.ok ? "ok" : r.error });
  }
  const leftV = (await c.versions("c3/")).items.length;
  const leftU = (await c.uploads("c3/")).items.length;
  const trunc3d = inst.calls.slice(callsBefore3d).filter((x) => x.truncada).length;
  const purged = steps.every((s) => s.resultado === "ok") && leftV === 0 && leftU === 0;
  c.add("3d: purgas del adaptador (remove, discardStaged, removeStagedFile) con la misma paginación inyectada",
    "todas resuelven; c3/ queda sin versiones, marcadores ni multipart",
    { pasos: steps, versiones: leftV, multipart: leftU, paginasTruncadas: trunc3d },
    purged && trunc3d > 0, trunc3d ? undefined : "Sin páginas truncadas durante las purgas: los bucles no se ejercitaron.",
    purged && trunc3d === 0 ? "NO_CONCLUYENTE" : undefined);
}

// ---------------------------------------------------------------- caso 4: CopyObject con versionId fijado

async function caso4(c) {
  const kR = uuid();
  const S = `c4/staging/${stagingName(kR)}`;
  const X = crypto.randomBytes(4 * KiB);
  const Y = crypto.randomBytes(4 * KiB);
  const v1 = await c.put(S, X);
  const v2 = await c.put(S, Y);
  await c.raw(new sdk.CopyObjectCommand({
    Bucket: c.Bucket, Key: `${c.P}c4/objects/${kR}`,
    CopySource: `${c.Bucket}/${c.P}${S}?versionId=${encodeURIComponent(v1)}`,
    MetadataDirective: "REPLACE", Metadata: { "agro-sha256": sha(X), "agro-size": String(X.length) },
    ContentType: "application/octet-stream", ServerSideEncryption: "AES256",
  }));
  const got = await c.read(`c4/objects/${kR}`);
  const head = await c.head(`c4/objects/${kR}`);
  c.add("4a: CopyObject en crudo de la primera de dos versiones de staging (versionId fijado), con metadatos REPLACE",
    "el destino tiene los bytes de la primera versión (sha256 X ≠ Y) y agro-sha256/agro-size de X",
    { versionesStaging: [c.short(v1), c.short(v2)], sha256Destino: got.sha256.slice(0, 12), esX: got.sha256 === sha(X), esY: got.sha256 === sha(Y), agroSha256EsX: head.sha256 === sha(X), agroSize: head.metaSize, sse: head.sse },
    got.sha256 === sha(X) && head.sha256 === sha(X) && head.metaSize === String(X.length) && got.bytes === X.length);

  if (c.conn.target === "b2") {
    const kC = uuid();
    const ctl = await c.attempt(async () => {
      await c.raw(new sdk.CopyObjectCommand({ Bucket: c.Bucket, Key: `${c.P}c4/objects/${kC}`, CopySource: `${c.Bucket}/${c.P}${S}` }));
      return (await c.read(`c4/objects/${kC}`)).sha256;
    });
    c.add("4b: control, CopyObject en crudo SIN versionId del mismo staging", "copia la versión más reciente (Y): fijar el versionId es lo que decide",
      { esY: ctl.ok && ctl.value === sha(Y), error: ctl.error }, ctl.ok && ctl.value === sha(Y));
  }

  // Adaptador: un tercero escribe una versión nueva del mismo staging entre stage y commit.
  const key = uuid();
  const X2 = crypto.randomBytes(4 * KiB);
  const Y2 = crypto.randomBytes(4 * KiB);
  let intruder;
  const inst = instrument(c.conn.sender, {
    after: async (cmd) => {
      if (!intruder && cmd.constructor.name === "PutObjectCommand" && cmd.input.Key.includes("/staging/"))
        intruder = await c.raw(new sdk.PutObjectCommand({ Bucket: c.Bucket, Key: cmd.input.Key, Body: Y2, ContentLength: Y2.length, ContentMD5: md5(Y2), ContentType: "application/octet-stream" }));
    },
  });
  const st = c.storage("c4/", inst);
  const staged = await st.stage(key, chunked(X2));
  const stagingBefore = (await c.versions(`c4/staging/${key}.`)).items.length;
  const commit = await c.attempt(() => staged.commit());
  const final = await c.read(`c4/objects/${key}`);
  const fHead = await c.head(`c4/objects/${key}`);
  const fVers = (await c.versions(`c4/objects/${key}`)).items.length;
  const stagingAfter = (await c.versions(`c4/staging/${key}.`)).items.length;
  c.add("4c: adaptador commit con una versión más reciente de un tercero en el mismo staging",
    "commit copia la versión fijada (X), no la del tercero (Y); 1 versión final; staging purgado (ambas versiones)",
    { stagingAntesDelCommit: stagingBefore, commit: commit.ok ? "ok" : commit.error, esX: final.sha256 === sha(X2), esY: final.sha256 === sha(Y2), agroSha256EsX: fHead.sha256 === sha(X2), versionesFinales: fVers, stagingDespues: stagingAfter },
    stagingBefore === 2 && commit.ok && final.sha256 === sha(X2) && fHead.sha256 === sha(X2) && fVers === 1 && stagingAfter === 0);
  const remaining = await c.purge("c4/");
  c.add("4: c4/ limpio al terminar", "0 versiones y 0 multipart", { restantes: remaining }, remaining === 0);
}

// ---------------------------------------------------------------- caso 5: UploadPart observado con ListParts

async function caso5(c) {
  const observe = (seen) => instrument(c.conn.sender, {
    after: async (cmd, out) => {
      if (cmd.constructor.name !== "UploadPartCommand") return;
      const r = await c.raw(new sdk.ListPartsCommand({ Bucket: c.Bucket, Key: cmd.input.Key, UploadId: cmd.input.UploadId }));
      seen.push({
        trasParte: cmd.input.PartNumber,
        etagDevuelto: out.ETag || null,
        md5Parte: md5hex(cmd.input.Body),
        partes: (r.Parts || []).map((p) => ({ n: p.PartNumber, size: p.Size, etag: p.ETag || null })),
        uploadId: cmd.input.UploadId,
        key: cmd.input.Key,
      });
    },
  });
  const etags = c.conn.target === "b2";
  const key = uuid();
  const bytes = crypto.randomBytes(S3_PART_BYTES + MiB);
  const seen = [];
  const st = c.storage("c5/", observe(seen));
  const staged = await st.stage(key, chunked(bytes));
  const sizesOk = seen.length === 2 &&
    JSON.stringify(seen[0].partes.map((p) => [p.n, p.size])) === JSON.stringify([[1, S3_PART_BYTES]]) &&
    JSON.stringify(seen[1].partes.map((p) => [p.n, p.size])) === JSON.stringify([[1, S3_PART_BYTES], [2, MiB]]);
  const etagOk = seen.length === 2 && seen.every((s) => s.partes.at(-1)?.etag === s.etagDevuelto);
  const etagMd5 = seen.map((s) => (s.etagDevuelto || "").replace(/"/g, "") === s.md5Parte);
  const pending = (await c.uploads("c5/")).items.length;
  await staged.commit();
  const final = await c.read(`c5/objects/${key}`);
  c.add("5a: adaptador stage multipart de 9 MiB observado con ListParts tras cada UploadPart, y completado",
    `tras la parte 1: 1 parte de ${S3_PART_BYTES} B; tras la 2: 2 partes (${S3_PART_BYTES} y ${MiB} B); ETag de ListParts = ETag de UploadPart; sin multipart pendiente; objeto final íntegro`,
    { observaciones: seen.map(({ uploadId, key, md5Parte, ...s }) => s), etagEsMd5DeLaParte: etagMd5, multipartPendientes: pending, sha256Final: final.sha256 === sha(bytes) },
    sizesOk && (!etags || etagOk) && pending === 0 && final.sha256 === sha(bytes),
    etags ? undefined : "El doble no devuelve ETag en ListParts: esa comparación no se aplica al doble.");

  // Corte del origen tras la primera parte: el adaptador debe abortar el multipart.
  const cutKey = uuid();
  const seen2 = [];
  async function* cut() {
    for (let i = 0; i < S3_PART_BYTES / MiB; i++) yield crypto.randomBytes(MiB);
    yield crypto.randomBytes(512 * KiB);
    throw new Error("corte simulado del origen");
  }
  const r = await c.attempt(() => c.storage("c5/", observe(seen2)).stage(cutKey, Readable.from(cut())));
  const left = (await c.uploads("c5/")).items.length;
  const afterAbort = seen2[0] ? await c.attempt(() => c.conn.sender.send(new sdk.ListPartsCommand({ Bucket: c.Bucket, Key: seen2[0].key, UploadId: seen2[0].uploadId }), { abortSignal: AbortSignal.timeout(120_000) })) : null;
  c.add("5b: adaptador stage multipart cortado tras la primera parte, observado con ListParts antes del aborto",
    `antes del aborto: 1 parte de ${S3_PART_BYTES} B; después: error cerrado, 0 multipart sin terminar y nada en staging`,
    { partesAntesDelAborto: seen2.map((s) => s.partes.map((p) => [p.n, p.size])), stage: r.ok ? "aceptado" : r.error, multipartPendientes: left, listPartsTrasAbortar: afterAbort && (afterAbort.ok ? "aceptado" : afterAbort.error), staging: (await c.versions(`c5/staging/${cutKey}.`)).items.length },
    !r.ok && seen2.length === 1 && JSON.stringify(seen2[0].partes.map((p) => [p.n, p.size])) === JSON.stringify([[1, S3_PART_BYTES]]) && left === 0);
  const remaining = await c.purge("c5/");
  c.add("5: c5/ limpio al terminar", "0 versiones y 0 multipart", { restantes: remaining }, remaining === 0);
}

// ---------------------------------------------------------------- inventario y limpieza

async function inventario(c) {
  const vs = (await c.versions("")).items;
  const ups = (await c.uploads("")).items;
  const bySub = {};
  for (const v of vs) {
    const sub = v.key.split("/")[0];
    bySub[sub] ??= { versiones: 0, marcadores: 0 };
    bySub[sub][v.marker ? "marcadores" : "versiones"] += 1;
  }
  c.add("inventario del prefijo (sólo lectura)", "lectura completada", { porSubcarpeta: bySub, multipartSinTerminar: ups.length }, true);
}

async function limpiar(c) {
  const remaining = await c.purge("");
  c.add("limpiar: todas las versiones, marcadores y multipart del prefijo de ensayo, por versionId", "0 restantes", { restantes: remaining }, remaining === 0);
}

// ---------------------------------------------------------------- principal

const STEPS = { preparar: ["rw"], caso1: ["ro", "nodel"], casos2a5: ["rw"], c6: ["rw", "nodel", "rotacion"], inventario: ["rw", "ro", "nodel"], limpiar: ["rw"] };

/**
 * Ítem 6: lanza la suite con PostgreSQL (C2 y C5 con rw; T-R5 con nodel) con este mismo entorno.
 * Sin argumentos con guion en la orden de con_b2.ps1: las opciones de Jest van aquí.
 */
function c6(destino, perfil, outDir) {
  if (!process.env.F08_BKP_PG_TEST_URL) throw new Error("c6 necesita F08_BKP_PG_TEST_URL (PostgreSQL desechable)");
  const jest = require.resolve("jest/bin/jest", { paths: [BACK] });
  const r = require("node:child_process").spawnSync(process.execPath, [jest, "src/modules/backups/b151-b2-real.postgres.spec.ts", "--runInBand"], {
    cwd: BACK,
    stdio: "inherit",
    env: { ...process.env, F08_B151_DESTINO: destino, F08_B151_PERFIL: perfil, F08_B151_SALIDA: path.resolve(outDir) },
  });
  return r.status === 0 ? 0 : 1;
}

/**
 * T-R5, variante de la rotación: necesita dos claves en un proceso. Se lanza bajo con_b2.ps1 con la
 * clave nodel; este proceso la comprueba, la copia a F08_B151_NODEL_* (sólo en el entorno del hijo) y
 * vuelve a lanzarse bajo con_b2.ps1 con la clave rw (F08_B151_CON_B2 y F08_B151_RW_CLIXML, rutas
 * absolutas). El hijo, que ya tiene las dos, ejecuta la suite.
 */
async function rotacion(outDir) {
  if (process.env.F08_B151_NODEL_ACCESS_KEY_ID) return c6("b2", "rotacion", outDir);
  const settings = sup.b2SettingsFromEnv();
  if (!settings) throw new Error("faltan variables BACKUP_S3_* (ejecútalo bajo con_b2.ps1 con la clave nodel) o BACKUP_S3_PREFIX");
  await sup.verifyB2Key(settings, "nodel");
  const conB2 = process.env.F08_B151_CON_B2;
  const rwKey = process.env.F08_B151_RW_CLIXML;
  const fs = require("node:fs");
  for (const p of [conB2, rwKey]) if (!p || !path.isAbsolute(p) || !fs.existsSync(p)) throw new Error("rotacion necesita F08_B151_CON_B2 y F08_B151_RW_CLIXML (rutas absolutas existentes)");
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const r = require("node:child_process").spawnSync(powershell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", conB2, "-Ruta", rwKey, process.execPath, __filename, "b2", "rotacion", "c6", outDir], {
      stdio: "inherit",
      env: { ...process.env, F08_B151_NODEL_ACCESS_KEY_ID: settings.accessKeyId, F08_B151_NODEL_SECRET_ACCESS_KEY: settings.secretAccessKey },
    });
  return r.status === 0 ? 0 : 1;
}

async function main() {
  const [destino, perfil, paso, outDir, confirm] = process.argv.slice(2);
  const usage = "uso: node b151_b2.cjs b2 <rw|ro|nodel> <preparar|caso1|casos2a5|c6|inventario|limpiar> <dir-salida> [confirmar] · node b151_b2.cjs doble todos <todo|c6> <dir-salida>";
  if (!outDir || !["b2", "doble"].includes(destino)) throw new Error(usage);
  const version = sup.treeVersion(ROOT);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (destino === "doble") {
    if (perfil !== "todos" || !["todo", "c6"].includes(paso)) throw new Error(usage);
    if (paso === "c6") return c6("doble", "", outDir);
    const conn = sup.B151Connection.doble(`${sup.B151_KEY_PREFIX}doble/`);
    const report = new sup.B151Report({ herramienta: "tool/f08_b2/b151_b2.cjs", destino, perfil: "varios (doble)", paso, version, configuracion: { prefijo: conn.settings.prefix, bucket: conn.settings.bucket, parteMultipart: S3_PART_BYTES } });
    report.note("destino: doble S3 en memoria (NO es Backblaze B2); perfiles simulados por el doble");
    for (const [profile, fn] of [["rw", preparar], ["ro", caso1], ["nodel", caso1], ["rw", caso2], ["rw", caso3], ["rw", caso4], ["rw", caso5], ["rw", inventario], ["rw", limpiar]]) {
      conn.simulated = profile;
      await fn(context(conn, report, profile));
    }
    const files = report.write(outDir, `b151-doble-${stamp}`);
    report.note(`informe: ${files.json} y ${files.text}`);
    return report.failed;
  }
  if (paso === "c6" && perfil === "rotacion") return rotacion(outDir);
  if (!sup.isProfile(perfil) || !STEPS[paso]?.includes(perfil)) throw new Error(`${usage}\n(el paso ${paso} admite: ${STEPS[paso]?.join(", ") ?? "—"})`);
  if (paso === "limpiar" && confirm !== "confirmar") throw new Error("limpiar borra todo el prefijo de ensayo: añade «confirmar»");
  if (paso === "c6") return c6("b2", perfil, outDir);
  const settings = sup.b2SettingsFromEnv();
  if (!settings) throw new Error("faltan variables BACKUP_S3_* (ejecútalo bajo con_b2.ps1) o BACKUP_S3_PREFIX");
  const key = await sup.verifyB2Key(settings, perfil);
  const conn = sup.B151Connection.b2(settings);
  const report = new sup.B151Report({
    herramienta: "tool/f08_b2/b151_b2.cjs", destino, perfil, paso, version,
    configuracion: { prefijo: settings.prefix, bucket: settings.bucket, region: settings.region, clave: { capacidades: key.capabilities, namePrefix: key.namePrefix }, parteMultipart: S3_PART_BYTES },
  });
  report.note(`destino: Backblaze B2 real; clave verificada (${key.capabilities.join(", ")}; namePrefix ${key.namePrefix})`);
  const c = context(conn, report, perfil);
  // Un error no previsto en un caso queda en el informe como FAIL (y el informe se escribe igual);
  // en casos2a5, los casos siguientes se ejecutan.
  const run = async (fn) => {
    try {
      await fn(c);
    } catch (error) {
      c.add(`${paso}: ${fn.name} abortado por un error no previsto`, "sin errores no previstos", { error: sup.errorSummary(error) }, false);
    }
  };
  if (paso === "preparar") await run(preparar);
  if (paso === "caso1") await run(caso1);
  if (paso === "casos2a5") for (const fn of [caso2, caso3, caso4, caso5]) await run(fn);
  if (paso === "inventario") await run(inventario);
  if (paso === "limpiar") await run(limpiar);
  const files = report.write(outDir, `b151-b2-${perfil}-${paso}-${stamp}`);
  report.note(`informe: ${files.json} y ${files.text}`);
  return report.failed;
}

main().then(
  (failed) => { process.exitCode = failed ? 1 : 0; },
  (error) => { console.error(sup.scrub(`ERROR ${sup.errorSummary(error).name}: ${sup.errorSummary(error).message}`)); process.exitCode = 2; },
);
