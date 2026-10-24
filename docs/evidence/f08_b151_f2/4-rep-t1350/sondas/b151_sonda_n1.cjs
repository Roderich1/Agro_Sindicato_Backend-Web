// Sonda #151 n1 (sesión C, 2026-10-24, repetición): forma de las respuestas de B2 real que el adaptador
// de 353ad31 exige y que, si faltan, lo hacen fallar cerrado: IsTruncated booleano en cada página de
// ListObjectVersions, ListMultipartUploads y ListParts; Initiated, LastModified y Size válidos.
// Sólo bajo <BACKUP_S3_PREFIX>sonda-n1/, que borra y aborta al terminar. Imprime tipos, cuentas y
// banderas; ningún secreto, ninguna clave de objeto completa.
const path = require("node:path");
const crypto = require("node:crypto");
const BACK = process.env.F08_B151_BACK;
require(path.join(BACK, "node_modules", "ts-node")).register({ transpileOnly: true, project: path.join(BACK, "tsconfig.json"), compilerOptions: { module: "commonjs" } });
const sup = require(path.join(BACK, "src", "modules", "backups", "test-support", "b151-b2-real.ts"));
const sdk = require(require.resolve("@aws-sdk/client-s3", { paths: [path.join(BACK, "src", "modules", "backups", "infrastructure")] }));

const kind = (x) => (x === undefined ? "ausente" : x === null ? "null" : x instanceof Date ? (Number.isNaN(x.getTime()) ? "Date inválida" : "Date") : typeof x);

async function main() {
  const settings = sup.b2SettingsFromEnv();
  if (!settings) throw new Error("faltan BACKUP_S3_*");
  await sup.verifyB2Key(settings, "rw");
  const conn = sup.B151Connection.b2(settings);
  const Bucket = settings.bucket;
  const P = settings.prefix + "sonda-n1/";
  const send = (cmd) => conn.sender.send(cmd, { abortSignal: AbortSignal.timeout(60_000) });
  const put = async (rel) => {
    const b = crypto.randomBytes(256);
    const md5 = crypto.createHash("md5").update(b).digest("base64"); // NOSONAR: Content-MD5 de transporte
    await send(new sdk.PutObjectCommand({ Bucket, Key: P + rel, Body: b, ContentLength: b.length, ContentMD5: md5 }));
  };
  // Versiones: a con 2, b con 1 y un marcador encima.
  await put("objects/a");
  await put("objects/a");
  await put("objects/b");
  await send(new sdk.DeleteObjectCommand({ Bucket, Key: P + "objects/b" }));
  // Dos multipart sin terminar; el primero con 2 partes pequeñas (no se completa).
  const uploads = [];
  for (const rel of ["staging/u1", "staging/u2"]) {
    const c = await send(new sdk.CreateMultipartUploadCommand({ Bucket, Key: P + rel, ContentType: "application/octet-stream" }));
    uploads.push({ Key: P + rel, UploadId: c.UploadId });
  }
  for (const n of [1, 2]) {
    const b = crypto.randomBytes(1024);
    const md5 = crypto.createHash("md5").update(b).digest("base64"); // NOSONAR: Content-MD5 de transporte
    await send(new sdk.UploadPartCommand({ Bucket, Key: uploads[0].Key, UploadId: uploads[0].UploadId, PartNumber: n, Body: b, ContentLength: b.length, ContentMD5: md5 }));
  }

  const out = { fecha: new Date().toISOString(), prefijo: P, ListObjectVersions: {}, ListMultipartUploads: {}, ListParts: {} };
  for (const max of [undefined, 1]) {
    const pages = [];
    let KeyMarker, VersionIdMarker;
    for (let i = 0; i < 10; i++) {
      const r = await send(new sdk.ListObjectVersionsCommand({ Bucket, Prefix: P, MaxKeys: max, KeyMarker, VersionIdMarker }));
      pages.push({
        IsTruncated: kind(r.IsTruncated), truncada: r.IsTruncated === true,
        versiones: (r.Versions ?? []).length, marcadores: (r.DeleteMarkers ?? []).length,
        LastModified: [...new Set([...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])].map((e) => kind(e.LastModified)))],
        Size: [...new Set((r.Versions ?? []).map((e) => kind(e.Size)))],
        VersionId: [...new Set([...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])].map((e) => kind(e.VersionId)))],
        IsLatest: [...new Set([...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])].map((e) => kind(e.IsLatest)))],
        NextKeyMarker: kind(r.NextKeyMarker), NextVersionIdMarker: kind(r.NextVersionIdMarker),
      });
      if (r.IsTruncated !== true) break;
      KeyMarker = r.NextKeyMarker;
      VersionIdMarker = r.NextVersionIdMarker;
    }
    out.ListObjectVersions[max === undefined ? "sinLimite" : `MaxKeys${max}`] = pages;
  }
  for (const max of [undefined, 1]) {
    const pages = [];
    let KeyMarker, UploadIdMarker;
    for (let i = 0; i < 10; i++) {
      const r = await send(new sdk.ListMultipartUploadsCommand({ Bucket, Prefix: P, MaxUploads: max, KeyMarker, UploadIdMarker }));
      pages.push({
        IsTruncated: kind(r.IsTruncated), truncada: r.IsTruncated === true, subidas: (r.Uploads ?? []).length,
        Initiated: [...new Set((r.Uploads ?? []).map((u) => kind(u.Initiated)))],
        UploadId: [...new Set((r.Uploads ?? []).map((u) => kind(u.UploadId)))],
        NextKeyMarker: kind(r.NextKeyMarker), NextUploadIdMarker: kind(r.NextUploadIdMarker),
      });
      if (r.IsTruncated !== true) break;
      KeyMarker = r.NextKeyMarker;
      UploadIdMarker = r.NextUploadIdMarker;
    }
    out.ListMultipartUploads[max === undefined ? "sinLimite" : `MaxUploads${max}`] = pages;
  }
  for (const max of [undefined, 1]) {
    const pages = [];
    let PartNumberMarker;
    for (let i = 0; i < 10; i++) {
      const r = await send(new sdk.ListPartsCommand({ Bucket, Key: uploads[0].Key, UploadId: uploads[0].UploadId, MaxParts: max, PartNumberMarker }));
      pages.push({
        IsTruncated: kind(r.IsTruncated), truncada: r.IsTruncated === true, partes: (r.Parts ?? []).length,
        Size: [...new Set((r.Parts ?? []).map((p) => kind(p.Size)))], NextPartNumberMarker: kind(r.NextPartNumberMarker),
      });
      if (r.IsTruncated !== true) break;
      PartNumberMarker = r.NextPartNumberMarker;
    }
    out.ListParts[max === undefined ? "sinLimite" : `MaxParts${max}`] = pages;
  }

  // Limpieza: abortar las multipart y borrar por versionId todo lo de sonda-n1/.
  for (const u of uploads) await send(new sdk.AbortMultipartUploadCommand({ Bucket, Key: u.Key, UploadId: u.UploadId })).catch(() => undefined);
  for (let i = 0; i < 3; i++) {
    const r = await send(new sdk.ListObjectVersionsCommand({ Bucket, Prefix: P }));
    for (const x of [...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])]) await send(new sdk.DeleteObjectCommand({ Bucket, Key: x.Key, VersionId: x.VersionId }));
  }
  const left = await send(new sdk.ListObjectVersionsCommand({ Bucket, Prefix: P }));
  const leftUp = await send(new sdk.ListMultipartUploadsCommand({ Bucket, Prefix: P }));
  out.restantesTrasLimpiar = { versionesYMarcadores: (left.Versions ?? []).length + (left.DeleteMarkers ?? []).length, multipart: (leftUp.Uploads ?? []).length };
  process.stdout.write(sup.scrub(JSON.stringify(out, null, 1)) + "\n");
}
main().catch((e) => { process.stderr.write(sup.scrub(String((e && e.stack) || e)) + "\n"); process.exit(1); });
