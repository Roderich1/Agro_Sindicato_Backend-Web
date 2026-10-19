// Ensayo real F08-BKP-07 / #40 (sesión A, 2026-10-19): API compilada (main f0b55ee) con
// BACKUP_STORAGE_PROVIDER=b2 contra Backblaze B2, bucket privado, prefijo ensayo-f08/.
// Datos SINTÉTICOS (bytes aleatorios). Imprime sólo códigos, tamaños, hashes de contenido sintético,
// claves relativas cortas y PASS/FAIL. Nunca tokens, contraseñas, credenciales ni URLs firmadas.
// Entorno: F03_FARMER_D_*, F03_FARMER_E2_*, F03_ADMIN_*, F08_X01_EMAIL/PASSWORD (otro tenant),
// BACKUP_S3_* (con_b2.ps1). Uso: node b2_api_trial.cjs <url-api-local> <salida.json>
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const BE = process.env.F08_B2_NODE_MODULES || path.join(__dirname, "..", "..", "Back", "node_modules");
const { S3Client, ListObjectVersionsCommand, HeadObjectCommand, GetObjectCommand, ListMultipartUploadsCommand } =
  require(path.join(BE, "@aws-sdk/client-s3"));
const api = process.argv[2]; const outFile = process.argv[3];
const e = process.env; const P = e.BACKUP_S3_PREFIX; const Bucket = e.BACKUP_S3_BUCKET;
for (const k of ["BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET", "BACKUP_S3_PREFIX", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"])
  if (!e[k]) { console.error(`falta ${k}`); process.exit(2); }
if (!/^[a-z0-9][a-z0-9-]{0,62}\/$/.test(P)) { console.error("prefijo inválido"); process.exit(2); }
const s3 = new S3Client({ endpoint: e.BACKUP_S3_ENDPOINT, region: e.BACKUP_S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: e.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: e.BACKUP_S3_SECRET_ACCESS_KEY } });
const log = []; const results = [];
const now = () => new Date().toISOString();
const note = (msg) => { const l = `${now()} ${msg}`; console.log(l); log.push(l); };
const check = (label, ok, extra) => { results.push({ label, ok, ...(extra ? { extra } : {}) }); note(`${ok ? "PASS" : "FAIL"} ${label}`); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const short = (s) => (s || "").slice(0, 8);

async function call(method, route, { token, json, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers }, redirect: "manual" };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(json); }
  else if (body !== undefined) init.body = body;
  const r = await fetch(`${api}${route}`, init);
  const bytes = Buffer.from(await r.arrayBuffer()); let parsed = null;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch {}
  return { status: r.status, headers: r.headers, bytes, json: parsed };
}
async function session(email, password) {
  const login = await call("POST", "/api/v1/auth/v2/login", { json: { email, password, refreshTransport: "BODY" } });
  if (login.status !== 200) throw new Error(`login HTTP ${login.status}`);
  const token = login.json.accessToken;
  const reg = await call("POST", "/api/v1/auth/clients", { token, json: { clientId: crypto.randomUUID() } });
  const bind = await call("POST", "/api/v1/auth/v2/session/client", { token, json: { registrationId: reg.json.registrationId } });
  if (![200, 201].includes(bind.status)) throw new Error(`bind HTTP ${bind.status}`);
  return token;
}
const hdr = (digest) => ({ "Content-Type": "application/octet-stream", "X-Content-SHA256": digest, "X-Backup-Format-Version": "1", "X-Backup-Schema-Version": "10" });
const upload = (token, bytes, digest = sha(bytes)) => call("POST", "/api/v1/me/backups", { token, body: bytes, headers: hdr(digest) });
const list = async (token) => (await call("GET", "/api/v1/me/backups", { token })).json?.backups || [];

async function versions(sub) {
  const out = []; let KeyMarker, VersionIdMarker;
  do {
    const r = await s3.send(new ListObjectVersionsCommand({ Bucket, Prefix: P + sub, KeyMarker, VersionIdMarker }));
    for (const v of r.Versions || []) out.push({ key: v.Key.slice(P.length), size: v.Size, marker: false });
    for (const m of r.DeleteMarkers || []) out.push({ key: m.Key.slice(P.length), size: 0, marker: true });
    KeyMarker = r.IsTruncated ? r.NextKeyMarker : undefined; VersionIdMarker = r.IsTruncated ? r.NextVersionIdMarker : undefined;
  } while (KeyMarker);
  return out;
}
async function uploads() { return ((await s3.send(new ListMultipartUploadsCommand({ Bucket, Prefix: P }))).Uploads || []).length; }
async function s3sha(rel) {
  const r = await s3.send(new GetObjectCommand({ Bucket, Key: P + rel })); const h = crypto.createHash("sha256"); let n = 0;
  for await (const c of r.Body) { h.update(c); n += c.length; } return { sha256: h.digest("hex"), bytes: n };
}
async function head(rel) {
  const r = await s3.send(new HeadObjectCommand({ Bucket, Key: P + rel }));
  return { size: r.ContentLength, sse: r.ServerSideEncryption || null, sha256: r.Metadata?.["agro-sha256"] || null, metaSize: r.Metadata?.["agro-size"] || null };
}
const objKeys = async () => (await versions("objects/")).filter((v) => !v.marker).map((v) => v.key);
async function storageState(label) {
  const o = await versions("objects/"); const s = await versions("staging/"); const u = await uploads();
  note(`B2 ${label}: objects/ ${o.filter((x) => !x.marker).length} versiones, ${o.filter((x) => x.marker).length} marcadores; staging/ ${s.length}; multipart sin terminar ${u}`);
  return { objects: o, staging: s, uploads: u };
}
// Sube y localiza su objeto en B2 (clave nueva bajo objects/), verifica todo lo verificable.
async function uploadVerified(tag, token, size) {
  const before = new Set(await objKeys()); const bytes = crypto.randomBytes(size); const digest = sha(bytes);
  const t0 = Date.now(); const r = await upload(token, bytes); const ms = Date.now() - t0;
  check(`${tag}: subida de ${size} B → HTTP ${r.status} en ${ms} ms, SHA-256 confirmado`, r.status === 201 && r.json?.sha256 === digest);
  const fresh = (await objKeys()).filter((k) => !before.has(k));
  check(`${tag}: exactamente 1 objeto nuevo en B2 bajo objects/`, fresh.length === 1, { key: short(fresh[0]?.slice(8)) });
  const key = fresh[0]; const vs = (await versions(key)).filter((v) => v.key === key);
  check(`${tag}: el objeto final tiene 1 versión y ningún marcador`, vs.length === 1 && !vs[0].marker);
  const h = await head(key);
  check(`${tag}: HeadObject tamaño ${h.size}, SSE ${h.sse}, agro-sha256 y agro-size iguales`, h.size === size && h.sse === "AES256" && h.sha256 === digest && h.metaSize === String(size));
  const g = await s3sha(key);
  check(`${tag}: GetObject directo de B2 da los mismos bytes (SHA-256 ${short(g.sha256)}…)`, g.sha256 === digest && g.bytes === size);
  const d = await call("GET", `/api/v1/me/backups/${r.json.id}/content`, { token });
  check(`${tag}: descarga por la API HTTP ${d.status}, bytes, tamaño y cabecera SHA-256 iguales`, d.status === 200 && sha(d.bytes) === digest && d.bytes.length === size && d.headers.get("x-content-sha256") === digest);
  const st = await storageState(`tras ${tag}`);
  check(`${tag}: staging vacío y sin multipart pendiente`, st.staging.length === 0 && st.uploads === 0);
  return { tag, id: r.json.id, key, size, sha256: digest, ms };
}
// Subida cortada a mitad: Content-Length declarado mayor que lo enviado y socket destruido.
function cutUpload(token, total, sent) {
  return new Promise((resolve) => {
    const u = new URL(`${api}/api/v1/me/backups`);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
      headers: { ...hdr("b".repeat(64)), Authorization: `Bearer ${token}`, "Content-Length": String(total) } });
    req.on("error", () => resolve("cortada"));
    req.on("response", (res) => { res.resume(); resolve(`HTTP ${res.statusCode}`); });
    req.write(crypto.randomBytes(sent), () => setTimeout(() => { req.destroy(); resolve("cortada"); }, 1500));
  });
}
// Subida lenta (para la concurrencia): stream que tarda ~ms.
function slowUpload(token, bytes, ms) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${api}/api/v1/me/backups`); const chunk = 256 * 1024; const steps = Math.ceil(bytes.length / chunk);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
      headers: { ...hdr(sha(bytes)), Authorization: `Bearer ${token}`, "Content-Length": String(bytes.length) } }, (res) => {
      const parts = []; res.on("data", (c) => parts.push(c)); res.on("end", () => { let j = null; try { j = JSON.parse(Buffer.concat(parts)); } catch {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on("error", reject); let i = 0;
    const tick = () => { if (i >= steps) return req.end(); req.write(bytes.subarray(i * chunk, (i + 1) * chunk)); i++; setTimeout(tick, ms / steps); };
    tick();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  note(`inicio; API ${api}; bucket ${Bucket}; prefijo ${P}`);
  const D = await session(e.F03_FARMER_D_EMAIL, e.F03_FARMER_D_PASSWORD);
  const E2 = await session(e.F03_FARMER_E2_EMAIL, e.F03_FARMER_E2_PASSWORD);
  const ADMIN = await session(e.F03_ADMIN_EMAIL, e.F03_ADMIN_PASSWORD);
  const X01 = await session(e.F08_X01_EMAIL, e.F08_X01_PASSWORD);
  const st0 = await storageState("inicial");
  check("estado inicial: titular sin copias y prefijo vacío", (await list(D)).length === 0 && st0.objects.length === 0 && st0.staging.length === 0 && st0.uploads === 0);

  // 1. Subida simple (≤ 8 MiB, PutObject) y multipart (> 8 MiB).
  const A = await uploadVerified("A (1 MiB)", D, 1024 * 1024);
  const B = await uploadVerified("B (20 MiB, multipart)", D, 20 * 1024 * 1024);

  // 2. Aislamiento por propietario, rol y tenant, por la API real.
  const missing = await call("GET", `/api/v1/me/backups/${crypto.randomUUID()}/content`, { token: D });
  const e2c = await call("GET", `/api/v1/me/backups/${A.id}/content`, { token: E2 });
  check(`otro agricultor del mismo tenant: HTTP ${e2c.status}, indistinguible de una copia inexistente`, e2c.status === 404 && e2c.bytes.equals(missing.bytes));
  check("otro agricultor no ve las copias en su lista", !(await list(E2)).some((b) => [A.id, B.id].includes(b.id)));
  const e2d = await call("DELETE", `/api/v1/me/backups/${A.id}`, { token: E2 });
  check(`otro agricultor no puede borrar: HTTP ${e2d.status}`, e2d.status === 404);
  const adm = await call("GET", "/api/v1/me/backups", { token: ADMIN });
  const admc = await call("GET", `/api/v1/me/backups/${A.id}/content`, { token: ADMIN });
  check(`Administrador del mismo tenant: lista HTTP ${adm.status}, contenido HTTP ${admc.status}`, adm.status === 403 && admc.status === 403);
  const xc = await call("GET", `/api/v1/me/backups/${A.id}/content`, { token: X01 });
  check(`agricultor de otro tenant: HTTP ${xc.status}, indistinguible`, xc.status === 404 && xc.bytes.equals(missing.bytes));
  const anon = await call("GET", "/api/v1/me/backups");
  check(`sin sesión: HTTP ${anon.status}`, anon.status === 401);

  // 3. SHA-256 incorrecto: 422 sin objeto ni staging.
  const k3 = (await objKeys()).length;
  const bad = await upload(D, crypto.randomBytes(512 * 1024), "a".repeat(64));
  await sleep(1500); const st3 = await storageState("tras el SHA-256 incorrecto");
  check(`SHA-256 incorrecto: HTTP ${bad.status}; ningún objeto nuevo; staging vacío`, bad.status === 422 && (await objKeys()).length === k3 && st3.staging.length === 0 && st3.uploads === 0);

  // 4. Subida cortada a mitad: no se pierde ninguna copia anterior.
  const cut = await cutUpload(D, 12 * 1024 * 1024, 3 * 1024 * 1024);
  await sleep(4000); const after4 = await list(D); const st4 = await storageState("tras la subida cortada");
  const aOk = sha((await call("GET", `/api/v1/me/backups/${A.id}/content`, { token: D })).bytes) === A.sha256;
  const bOk = sha((await call("GET", `/api/v1/me/backups/${B.id}/content`, { token: D })).bytes) === B.sha256;
  check(`subida cortada (${cut}): las 2 copias anteriores siguen disponibles e íntegras; sin objeto nuevo; staging vacío`,
    after4.length === 2 && aOk && bOk && (await objKeys()).length === 2 && st4.staging.length === 0 && st4.uploads === 0);

  // 5. Concurrencia: una segunda subida mientras otra está en curso → 409.
  const slowBytes = crypto.randomBytes(3 * 1024 * 1024);
  const slow = slowUpload(D, slowBytes, 6000); await sleep(1500);
  const second = await upload(D, crypto.randomBytes(256 * 1024));
  const C = await slow;
  check(`concurrencia: la segunda subida → HTTP ${second.status} ${second.json?.errorCode || ""}; la primera → HTTP ${C.status}`,
    second.status === 409 && second.json?.errorCode === "BACKUP_UPLOAD_IN_PROGRESS" && C.status === 201 && C.json?.sha256 === sha(slowBytes));
  const keysC = await objKeys();
  const cKey = keysC.find((k) => k !== A.key && k !== B.key);
  const Cc = { tag: "C (3 MiB, lenta)", id: C.json.id, key: cKey, size: slowBytes.length, sha256: sha(slowBytes) };

  // 6. Rotación: con 5 copias, la sexta retira la más antigua (A) sólo tras quedar AVAILABLE.
  const D4 = await uploadVerified("D (2 MiB)", D, 2 * 1024 * 1024);
  const E5 = await uploadVerified("E (2 MiB)", D, 2 * 1024 * 1024);
  const pre = (await list(D)).map((b) => b.id);
  check(`antes de rotar: 5 copias disponibles`, pre.length === 5);
  note(`lista previa exacta de lo que se retirará: copia ${short(A.id)} (la más antigua), objeto objects/${short(A.key.slice(8))}… y todas sus versiones`);
  const F6 = await uploadVerified("F (1 MiB, sexta)", D, 1024 * 1024);
  await sleep(2000); const post = (await list(D)).map((b) => b.id);
  const expect = [B.id, Cc.id, D4.id, E5.id, F6.id].sort();
  check("tras rotar: quedan exactamente B, C, D, E y F; A ya no está en la lista", JSON.stringify(post.slice().sort()) === JSON.stringify(expect));
  const aGone = await call("GET", `/api/v1/me/backups/${A.id}/content`, { token: D });
  const aVers = (await versions(A.key)).filter((v) => v.key === A.key);
  check(`A retirada: contenido HTTP ${aGone.status}; versiones físicas en B2 ${aVers.length} (marcadores incluidos)`, aGone.status === 404 && aVers.length === 0);
  for (const x of [B, Cc, D4, E5, F6]) {
    const vs = (await versions(x.key)).filter((v) => v.key === x.key);
    check(`${x.tag.split(" ")[0]} sigue en B2 con 1 versión e íntegra`, vs.length === 1 && !vs[0].marker && (await s3sha(x.key)).sha256 === x.sha256);
  }

  // 7. Borrado del propietario: efecto físico sobre las versiones.
  const del = await call("DELETE", `/api/v1/me/backups/${B.id}`, { token: D });
  const bVers = (await versions(B.key)).filter((v) => v.key === B.key);
  check(`borrado de B por el propietario: HTTP ${del.status}; versiones físicas en B2 ${bVers.length}`, del.status === 204 && bVers.length === 0);

  // 8. Conciliación final: objetos en B2 = copias AVAILABLE; staging y multipart vacíos.
  const fin = await storageState("final");
  const avail = (await list(D)).map((b) => b.id).sort();
  const keysFin = fin.objects.filter((v) => !v.marker).map((v) => v.key).sort();
  const expKeys = [Cc.key, D4.key, E5.key, F6.key].sort();
  check(`final: ${avail.length} copias disponibles = ${keysFin.length} objetos en B2 (1 versión cada uno), 0 marcadores, staging y multipart vacíos`,
    avail.length === 4 && JSON.stringify(keysFin) === JSON.stringify(expKeys) && fin.objects.every((v) => !v.marker) && fin.staging.length === 0 && fin.uploads === 0);

  const failed = results.filter((r) => !r.ok).length;
  note(failed === 0 ? `Ensayo de API contra B2: ${results.length}/${results.length} PASS` : `Ensayo de API contra B2: ${failed} FAIL de ${results.length}`);
  fs.writeFileSync(outFile, JSON.stringify({ results, copies: [A, B, Cc, D4, E5, F6].map((x) => ({ tag: x.tag, id: short(x.id), key: short(x.key?.slice(8)), size: x.size, sha256: x.sha256 })), log }, null, 1));
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((err) => { note(`ERROR ${err.message}`); fs.writeFileSync(outFile, JSON.stringify({ results, log, error: err.message }, null, 1)); process.exitCode = 1; });
