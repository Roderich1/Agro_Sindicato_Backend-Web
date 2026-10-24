// Sonda #151 (sesión C, 2026-10-24, repetición): traza de las llamadas del adaptador (353ad31) contra B2
// real en dos fallos de una subida multiparte, para explicar 5b y el NO_CONCLUYENTE de 1-ro.
//   node b151_sonda_corte.cjs corte   (clave rw)  origen cortado mientras sube la parte 1
//   node b151_sonda_corte.cjs ro      (clave ro)  stage multipart con una clave sin writeFiles
// Sólo bajo <BACKUP_S3_PREFIX>; con rw, aborta y borra todo lo de ese prefijo al terminar.
// Imprime comandos, estados y nombres de error; ningún secreto ni clave de objeto completa.
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const BACK = process.env.F08_B151_BACK;
require(path.join(BACK, "node_modules", "ts-node")).register({ transpileOnly: true, project: path.join(BACK, "tsconfig.json"), compilerOptions: { module: "commonjs" } });
const sup = require(path.join(BACK, "src", "modules", "backups", "test-support", "b151-b2-real.ts"));
const { S3BackupStorage, S3_PART_BYTES } = require(path.join(BACK, "src", "modules", "backups", "infrastructure", "s3-backup-storage.ts"));
const sdk = require(require.resolve("@aws-sdk/client-s3", { paths: [path.join(BACK, "src", "modules", "backups", "infrastructure")] }));

const mode = process.argv[2];
const MiB = 1024 * 1024;
const t0 = Date.now();
const ms = () => Date.now() - t0;

async function main() {
  const settings = sup.b2SettingsFromEnv();
  if (!settings) throw new Error("faltan BACKUP_S3_*");
  await sup.verifyB2Key(settings, mode === "ro" ? "ro" : "rw");
  const conn = sup.B151Connection.b2(settings);
  const Bucket = settings.bucket;
  const P = settings.prefix;
  const trace = [];
  const sender = {
    send: async (cmd, options) => {
      const e = { ms: ms(), cmd: cmd.constructor.name.replace("Command", ""), parte: cmd.input.PartNumber };
      trace.push(e);
      try {
        const out = await conn.sender.send(cmd, options);
        Object.assign(e, { ok: true, finMs: ms() });
        return out;
      } catch (error) {
        Object.assign(e, { ok: false, finMs: ms(), error: sup.errorSummary(error), abortadaPorElAdaptador: options.abortSignal.aborted });
        throw error;
      }
    },
  };
  const storage = new S3BackupStorage(sender, { bucket: Bucket, prefix: P });
  const raw = (cmd) => conn.sender.send(cmd, { abortSignal: AbortSignal.timeout(60_000) });
  const uploads = async () => ((await raw(new sdk.ListMultipartUploadsCommand({ Bucket, Prefix: P }))).Uploads ?? []).length;
  const key = crypto.randomUUID();
  const sourceEvents = [];
  async function* gen() {
    for (let i = 0; i < S3_PART_BYTES / MiB; i++) yield crypto.randomBytes(MiB);
    yield crypto.randomBytes(512 * 1024);
    if (mode === "corte") throw new Error("corte simulado del origen");
    yield crypto.randomBytes(512 * 1024);
  }
  const source = Readable.from(gen());
  source.on("error", (e) => sourceEvents.push({ ms: ms(), evento: "error", name: e.name, code: e.code ?? null, message: String(e.message).slice(0, 80) }));
  source.on("close", () => sourceEvents.push({ ms: ms(), evento: "close" }));
  let stage;
  try {
    await storage.stage(key, source);
    stage = "aceptado";
  } catch (error) {
    stage = sup.errorSummary(error);
  }
  const out = { fecha: new Date().toISOString(), modo: mode, prefijo: P, stage, trazaDelAdaptador: trace, origen: sourceEvents };
  if (mode === "corte") {
    out.multipartTrasStage = await uploads();
    await new Promise((r) => setTimeout(r, 10_000));
    out.multipartTras10s = await uploads();
    try {
      await storage.discardStaged(key);
      out.discardStaged = "ok";
    } catch (error) {
      out.discardStaged = sup.errorSummary(error);
    }
    out.multipartTrasDiscardStaged = await uploads();
    // Limpieza de todo el prefijo de la sonda.
    for (const u of (await raw(new sdk.ListMultipartUploadsCommand({ Bucket, Prefix: P }))).Uploads ?? [])
      await raw(new sdk.AbortMultipartUploadCommand({ Bucket, Key: u.Key, UploadId: u.UploadId })).catch(() => undefined);
    const vs = await raw(new sdk.ListObjectVersionsCommand({ Bucket, Prefix: P }));
    for (const x of [...(vs.Versions ?? []), ...(vs.DeleteMarkers ?? [])]) await raw(new sdk.DeleteObjectCommand({ Bucket, Key: x.Key, VersionId: x.VersionId }));
  }
  const left = await raw(new sdk.ListObjectVersionsCommand({ Bucket, Prefix: P }));
  out.restantes = { versionesYMarcadores: (left.Versions ?? []).length + (left.DeleteMarkers ?? []).length, multipart: await uploads() };
  process.stdout.write(sup.scrub(JSON.stringify(out, null, 1)) + "\n");
}
main().catch((e) => { process.stderr.write(sup.scrub(String((e && e.stack) || e)) + "\n"); process.exit(1); });
