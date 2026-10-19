// Ensayo B2 (sesión A, 2026-10-19), complemento de b2_api_trial.cjs: subida cortada POR ENCIMA del
// umbral multipart (8 MiB), para ejercer UploadPart y AbortMultipartUpload contra B2 real.
// Declara 20 MiB, envía 12 MiB, comprueba en B2 que existe un multipart en curso bajo staging/,
// corta el socket y comprueba que el multipart se abortó, que staging/ queda vacío, que objects/
// no cambia y que las copias anteriores del titular siguen íntegras. Datos sintéticos.
// Entorno: F03_FARMER_D_EMAIL/PASSWORD y BACKUP_S3_* (con_b2.ps1). Nunca imprime secretos.
//   node b2_cut_multipart.cjs <url-api-local>
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const BE = process.env.F08_B2_NODE_MODULES || path.join(__dirname, "..", "..", "Back", "node_modules");
const { S3Client, ListObjectVersionsCommand, ListMultipartUploadsCommand, GetObjectCommand } = require(path.join(BE, "@aws-sdk/client-s3"));
const e = process.env;
for (const k of ["BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET", "BACKUP_S3_PREFIX", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY", "F03_FARMER_D_EMAIL", "F03_FARMER_D_PASSWORD"])
  if (!e[k]) { console.error(`falta ${k}`); process.exit(2); }
const P = e.BACKUP_S3_PREFIX;
if (!/^[a-z0-9][a-z0-9-]{0,62}\/$/.test(P)) { console.error("prefijo inválido"); process.exit(2); }
const api = process.argv[2]; const Bucket = e.BACKUP_S3_BUCKET;
const s3 = new S3Client({ endpoint: e.BACKUP_S3_ENDPOINT, region: e.BACKUP_S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: e.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: e.BACKUP_S3_SECRET_ACCESS_KEY } });
const results = []; const note = (m) => console.log(`${new Date().toISOString()} ${m}`);
const check = (l, ok) => { results.push(ok); note(`${ok ? "PASS" : "FAIL"} ${l}`); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, route, token, json) {
  const r = await fetch(api + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) }, body: json ? JSON.stringify(json) : undefined });
  const bytes = Buffer.from(await r.arrayBuffer()); let j = null; try { j = JSON.parse(bytes.toString("utf8")); } catch {}
  return { status: r.status, bytes, json: j, headers: r.headers };
}
async function versions(sub) {
  const out = []; let KeyMarker, VersionIdMarker;
  do { const r = await s3.send(new ListObjectVersionsCommand({ Bucket, Prefix: P + sub, KeyMarker, VersionIdMarker }));
    for (const v of r.Versions || []) out.push({ key: v.Key, marker: false }); for (const m of r.DeleteMarkers || []) out.push({ key: m.Key, marker: true });
    KeyMarker = r.IsTruncated ? r.NextKeyMarker : undefined; VersionIdMarker = r.IsTruncated ? r.NextVersionIdMarker : undefined; } while (KeyMarker);
  return out;
}
const uploads = async () => ((await s3.send(new ListMultipartUploadsCommand({ Bucket, Prefix: P }))).Uploads || []).map((u) => u.Key.slice(P.length));
(async () => {
  const login = await call("POST", "/api/v1/auth/v2/login", null, { email: e.F03_FARMER_D_EMAIL, password: e.F03_FARMER_D_PASSWORD, refreshTransport: "BODY" });
  const t = login.json.accessToken; const reg = await call("POST", "/api/v1/auth/clients", t, { clientId: crypto.randomUUID() });
  await call("POST", "/api/v1/auth/v2/session/client", t, { registrationId: reg.json.registrationId });
  const before = (await call("GET", "/api/v1/me/backups", t)).json.backups;
  const objBefore = (await versions("objects/")).map((v) => v.key).sort();
  note(`antes: ${before.length} copias del titular; objects/ ${objBefore.length} versiones; multipart sin terminar ${(await uploads()).length}`);
  const total = 20 * 1024 * 1024, sent = 12 * 1024 * 1024, chunk = 512 * 1024;
  let seenUpload = []; let status = "sin respuesta";
  await new Promise((resolve) => {
    const u = new URL(`${api}/api/v1/me/backups`);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: {
      "Content-Type": "application/octet-stream", "X-Content-SHA256": "c".repeat(64), "X-Backup-Format-Version": "1", "X-Backup-Schema-Version": "10",
      Authorization: `Bearer ${t}`, "Content-Length": String(total) } });
    req.on("response", (res) => { status = `HTTP ${res.statusCode}`; res.resume(); });
    req.on("error", () => {});
    let n = 0;
    const pump = async () => {
      while (n < sent) { const ok = req.write(crypto.randomBytes(chunk)); n += chunk; if (!ok) await new Promise((r) => req.once("drain", r)); }
      for (let i = 0; i < 20 && !seenUpload.length; i++) { await sleep(1000); seenUpload = await uploads(); }
      note(`enviados ${n} B de ${total}; multipart en curso en B2 bajo staging/: ${seenUpload.length} (${seenUpload.map((k) => k.split(".")[0].slice(0, 20)).join(", ")})`);
      req.destroy(); resolve();
    };
    pump();
  });
  check("durante el envío existía en B2 un multipart en curso bajo staging/ (UploadPart real)", seenUpload.length === 1 && seenUpload[0].startsWith("staging/"));
  let left = []; for (let i = 0; i < 30; i++) { await sleep(2000); left = await uploads(); if (!left.length) break; }
  const staging = await versions("staging/"); const objAfter = (await versions("objects/")).map((v) => v.key).sort();
  note(`tras el corte (${status}): multipart sin terminar ${left.length}; staging/ ${staging.length}; objects/ ${objAfter.length}`);
  check("tras el corte: multipart abortado (0 sin terminar) y staging/ vacío en B2", left.length === 0 && staging.length === 0);
  check("objects/ no cambia", JSON.stringify(objAfter) === JSON.stringify(objBefore));
  const after = (await call("GET", "/api/v1/me/backups", t)).json.backups;
  let intact = after.length === before.length;
  for (const b of after) { const d = await call("GET", `/api/v1/me/backups/${b.id}/content`, t); intact = intact && d.status === 200 && sha(d.bytes) === b.sha256; }
  check(`las ${after.length} copias anteriores siguen disponibles y sus bytes coinciden con su SHA-256`, intact);
  await call("POST", `/api/v1/auth/clients/${reg.json.registrationId}/revoke`, t, {}); await call("POST", "/api/v1/auth/v2/logout", null, { refreshToken: login.json.refreshToken });
  const failed = results.filter((x) => !x).length;
  note(failed ? `corte multipart: ${failed} FAIL` : `corte multipart: ${results.length}/${results.length} PASS`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => { note(`ERROR ${err.message}`); process.exitCode = 1; });
