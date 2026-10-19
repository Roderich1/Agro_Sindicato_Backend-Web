// Ensayo B2 (sesión A): inspección de SÓLO LECTURA del prefijo de ensayo en Backblaze B2 por su API S3.
// Se ejecuta bajo con_b2.ps1 (credenciales en el entorno del proceso). Nunca imprime credenciales,
// firmas ni cuerpos. Rechaza cualquier clave fuera de BACKUP_S3_PREFIX.
//   node s3_inspect.cjs versions [subprefijo]   versiones y marcadores (clave relativa, versión corta, tamaño)
//   node s3_inspect.cjs head <clave-relativa>    tamaño, SSE y metadatos agro-*
//   node s3_inspect.cjs sha <clave-relativa>     SHA-256 y tamaño del cuerpo descargado por S3
//   node s3_inspect.cjs uploads                  multipart sin terminar bajo el prefijo
const path = require("node:path");
const crypto = require("node:crypto");
const BE = path.join(__dirname, "..", "..", "Back", "node_modules");
const { S3Client, ListObjectVersionsCommand, HeadObjectCommand, GetObjectCommand, ListMultipartUploadsCommand } =
  require(path.join(BE, "@aws-sdk/client-s3"));
const e = process.env;
for (const k of ["BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET", "BACKUP_S3_PREFIX", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"])
  if (!e[k]) { console.error(`falta ${k}`); process.exit(2); }
const P = e.BACKUP_S3_PREFIX;
if (!/^[a-z0-9][a-z0-9-]{0,62}\/$/.test(P)) { console.error("prefijo inválido"); process.exit(2); }
const s3 = new S3Client({ endpoint: e.BACKUP_S3_ENDPOINT, region: e.BACKUP_S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: e.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: e.BACKUP_S3_SECRET_ACCESS_KEY } });
const Bucket = e.BACKUP_S3_BUCKET;
const full = (rel) => { if (!rel || rel.includes("..") || rel.startsWith("/")) throw new Error("clave inválida"); return P + rel; };

async function versions(sub = "") {
  const out = []; let KeyMarker, VersionIdMarker;
  do {
    const r = await s3.send(new ListObjectVersionsCommand({ Bucket, Prefix: P + sub, KeyMarker, VersionIdMarker }));
    for (const v of r.Versions || []) out.push({ key: v.Key.slice(P.length), version: (v.VersionId || "").slice(0, 10), latest: !!v.IsLatest, size: v.Size, marker: false });
    for (const m of r.DeleteMarkers || []) out.push({ key: m.Key.slice(P.length), version: (m.VersionId || "").slice(0, 10), latest: !!m.IsLatest, size: 0, marker: true });
    KeyMarker = r.IsTruncated ? r.NextKeyMarker : undefined; VersionIdMarker = r.IsTruncated ? r.NextVersionIdMarker : undefined;
  } while (KeyMarker);
  return out;
}
(async () => {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "versions") {
    const v = await versions(arg || "");
    console.log(JSON.stringify({ prefix: P + (arg || ""), count: v.length, markers: v.filter((x) => x.marker).length, items: v }));
  } else if (cmd === "head") {
    const r = await s3.send(new HeadObjectCommand({ Bucket, Key: full(arg) }));
    console.log(JSON.stringify({ key: arg, size: r.ContentLength, sse: r.ServerSideEncryption || null, sha256: r.Metadata?.["agro-sha256"] || null, metaSize: r.Metadata?.["agro-size"] || null, version: (r.VersionId || "").slice(0, 10) }));
  } else if (cmd === "sha") {
    const r = await s3.send(new GetObjectCommand({ Bucket, Key: full(arg) }));
    const h = crypto.createHash("sha256"); let n = 0;
    for await (const chunk of r.Body) { h.update(chunk); n += chunk.length; }
    console.log(JSON.stringify({ key: arg, bytes: n, sha256: h.digest("hex"), sse: r.ServerSideEncryption || null }));
  } else if (cmd === "uploads") {
    const r = await s3.send(new ListMultipartUploadsCommand({ Bucket, Prefix: P }));
    console.log(JSON.stringify({ prefix: P, uploads: (r.Uploads || []).map((u) => ({ key: u.Key.slice(P.length), started: u.Initiated })) }));
  } else { console.error("uso: versions|head|sha|uploads"); process.exit(2); }
})().catch((err) => { console.error(`ERROR ${err.name} ${err.$metadata?.httpStatusCode || ""}`); process.exit(1); });
