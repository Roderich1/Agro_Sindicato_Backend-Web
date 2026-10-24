import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { createS3Client, S3BackupStorageSettings, S3Sender } from "../infrastructure/s3-backup-storage";
import { InMemoryS3, s3Error } from "./in-memory-s3";

/**
 * BE #151 §A, items 1–6 (2026-10-19): shared support of the bounded checks
 * against real Backblaze B2 (`tool/f08_b2/b151_b2.cjs` and
 * `b151-b2-real.postgres.spec.ts`). Not production code (test-support is
 * excluded from the build) and not part of the CI.
 *
 * Secrets come only from the environment (`BACKUP_S3_*`, injected by
 * `con_b2.ps1`), are never printed, never written and never passed in argv;
 * every report is scrubbed of them before it is written. Nothing runs
 * outside `<root><subfolder>/`, where the root is the `namePrefix` of the
 * temporary keys: `ensayo-f08/b151-<yyyymmdd>/`, from `F08_B151_RAIZ`
 * (`crear_claves_b151.ps1 -Prefijo`; default `ensayo-f08/b151-20261019/`,
 * the keys of the first preparation).
 */
const B151_ROOT = /^ensayo-f08\/b151-\d{8}\/$/;

/** The trial's root; refuses anything but `ensayo-f08/b151-<yyyymmdd>/`. */
export function b151KeyPrefix(env = process.env): string {
  const root = env["F08_B151_RAIZ"] ?? "ensayo-f08/b151-20261019/";
  if (!B151_ROOT.test(root)) throw new Error("F08_B151_RAIZ must be ensayo-f08/b151-<yyyymmdd>/");
  return root;
}

export const B151_KEY_PREFIX = b151KeyPrefix();
// The root has only [a-z0-9/-], so it can go into the pattern as it is.
export const B151_PREFIX = new RegExp(`^${B151_KEY_PREFIX}[a-z0-9][a-z0-9-]{0,40}/$`);

/**
 * Format of the copies the item-6 suite sends through the API (F08-ADR-003):
 * 1 (the container before client-side encryption, default) or 2 (encrypted
 * on the phone; the suite then also sets `BACKUP_REQUIRE_CLIENT_ENCRYPTION`).
 */
export function b151Format(env = process.env): 1 | 2 {
  const value = env["F08_B151_FORMATO"] ?? "1";
  if (value === "1") return 1;
  if (value === "2") return 2;
  throw new Error("F08_B151_FORMATO must be 1 or 2");
}

/** The three temporary keys of `crear_claves_b151.ps1`. */
export const B151_PROFILES = {
  rw: ["listFiles", "readFiles", "writeFiles", "deleteFiles"],
  ro: ["listFiles", "readFiles"],
  nodel: ["listFiles", "readFiles", "writeFiles"],
} as const;
export type B151Profile = keyof typeof B151_PROFILES;
/** A report row's key: one profile, or rw with the rotation's deletes sent with nodel (T-R5, rotation variant). */
export type B151ReportProfile = B151Profile | "rw+nodel";
/** `b2`: the real provider. `doble`: the in-memory S3 double, never B2. */
export type B151Target = "b2" | "doble";

export function isProfile(value: string | undefined): value is B151Profile {
  return value === "rw" || value === "ro" || value === "nodel";
}

/** Refuses any prefix other than `<root><subfolder>/`. */
export function assertB151Prefix(prefix: string | undefined): string {
  if (!prefix || !B151_PREFIX.test(prefix) || prefix.includes(".."))
    throw new Error(`BACKUP_S3_PREFIX must be ${B151_KEY_PREFIX}<subfolder>/`);
  return prefix;
}

const SETTING_NAMES = [
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_REGION",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY",
] as const;

/** Settings from the environment; null if any is missing. */
export function b2SettingsFromEnv(env = process.env): S3BackupStorageSettings | null {
  if (SETTING_NAMES.some((name) => !env[name])) return null;
  return {
    endpoint: env["BACKUP_S3_ENDPOINT"]!,
    region: env["BACKUP_S3_REGION"]!,
    bucket: env["BACKUP_S3_BUCKET"]!,
    accessKeyId: env["BACKUP_S3_ACCESS_KEY_ID"]!,
    secretAccessKey: env["BACKUP_S3_SECRET_ACCESS_KEY"]!,
    prefix: assertB151Prefix(env["BACKUP_S3_PREFIX"]),
  };
}

export interface KeyCheck {
  bucket: string;
  namePrefix: string | null;
  capabilities: string[];
}

/**
 * Asks B2 (`b2_authorize_account`, native API) what the key in the
 * environment may do, and refuses to go on unless it is exactly the declared
 * profile: only the configured bucket, the b151 prefix and the profile's
 * capabilities. Prints and returns nothing secret (the authorization token
 * is discarded).
 */
export async function verifyB2Key(
  settings: S3BackupStorageSettings,
  profile: B151Profile,
): Promise<KeyCheck> {
  const basic = Buffer.from(`${settings.accessKeyId}:${settings.secretAccessKey}`).toString("base64");
  const response = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 200) throw new Error(`b2_authorize_account HTTP ${response.status}`);
  const body = (await response.json()) as {
    apiInfo?: { storageApi?: Record<string, unknown> & { allowed?: Record<string, unknown> } };
  };
  const api = body.apiInfo?.storageApi ?? {};
  const allowed = (api.allowed ?? api) as {
    buckets?: { name?: string }[];
    bucketName?: string;
    capabilities?: string[];
    namePrefix?: string | null;
  };
  const buckets = (allowed.buckets ?? []).map((b) => b.name).filter(Boolean) as string[];
  if (allowed.bucketName) buckets.push(allowed.bucketName);
  const byName = (a: string, b: string) => a.localeCompare(b);
  const capabilities = [...(allowed.capabilities ?? [])].sort(byName);
  const expected = [...B151_PROFILES[profile]].sort(byName);
  const check: KeyCheck = {
    bucket: buckets.join(","),
    namePrefix: allowed.namePrefix ?? null,
    capabilities,
  };
  // The signed requests must go to the endpoint B2 reports for this key, not another host.
  const withoutTrailingSlash = (url: string) => {
    let end = url.length;
    while (end > 0 && url[end - 1] === "/") end--;
    return url.slice(0, end);
  };
  const s3ApiUrl = typeof api["s3ApiUrl"] === "string" ? withoutTrailingSlash(api["s3ApiUrl"]) : null;
  if (s3ApiUrl !== withoutTrailingSlash(settings.endpoint))
    throw new Error("BACKUP_S3_ENDPOINT is not the S3 endpoint that B2 reports for this key");
  if (buckets.length !== 1 || buckets[0] !== settings.bucket)
    throw new Error("the key is not restricted to the configured bucket");
  if (check.namePrefix !== B151_KEY_PREFIX) throw new Error(`the key's namePrefix is not ${B151_KEY_PREFIX}`);
  if (JSON.stringify(capabilities) !== JSON.stringify(expected))
    throw new Error(`the key's capabilities are not those of profile ${profile}: ${capabilities.join(", ")}`);
  return check;
}

/** A closed S3 error: name, code and HTTP status; the message only scrubbed and short. */
export interface ErrorSummary {
  name: string;
  code: string | null;
  status: number | null;
  message: string;
}

export function errorSummary(error: unknown): ErrorSummary {
  const e = error as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  return {
    name: e?.name ?? "Error",
    code: e?.Code ?? null,
    status: e?.$metadata?.httpStatusCode ?? null,
    message: String(e?.message ?? "").slice(0, 160),
  };
}

/** Is it a permission refusal of the provider (or of the double's simulated profile)? */
export function isAccessDenied(error: ErrorSummary | null): boolean {
  return !!error && (error.status === 401 || error.status === 403 || /AccessDenied|Unauthorized/i.test(error.name));
}

export type Verdict = "PASS" | "FAIL" | "NO_CONCLUYENTE";

export interface CaseResult {
  caso: string;
  perfil: B151ReportProfile;
  esperado: string;
  observado: unknown;
  veredicto: Verdict;
  nota?: string;
}

/**
 * Git by absolute path only (never resolved through PATH): F08_B151_GIT, or
 * the standard install locations. Null if none exists.
 */
function gitExecutable(): string | null {
  const candidates = [
    process.env["F08_B151_GIT"],
    String.raw`C:\Program Files\Git\cmd\git.exe`,
    "/usr/bin/git",
    "/usr/local/bin/git",
  ];
  return candidates.find((c): c is string => !!c && isAbsolute(c) && existsSync(c)) ?? null;
}

/** Commit of the tree the tool runs from, and whether its relevant files differ from it. */
export function treeVersion(root: string): { sha: string; cambiosLocales: string[] } {
  const executable = gitExecutable();
  if (!executable) return { sha: "desconocido (git no encontrado por ruta absoluta)", cambiosLocales: [] };
  const git = (...args: string[]) =>
    execFileSync(executable, ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const sha = git("rev-parse", "HEAD");
    const dirty = git("status", "--porcelain", "--", "Back/src/modules/backups", "tool/f08_b2");
    return { sha, cambiosLocales: dirty ? dirty.split("\n").map((l) => l.trim()) : [] };
  } catch {
    return { sha: "desconocido", cambiosLocales: [] };
  }
}

/**
 * Sanitised report: JSON and text, with every secret of the environment
 * replaced before writing, and refused if one would still be there.
 */
export class B151Report {
  readonly cases: CaseResult[] = [];
  readonly log: string[] = [];

  constructor(
    readonly header: {
      herramienta: string;
      destino: B151Target;
      perfil: B151ReportProfile | "varios (doble)";
      paso: string;
      version: { sha: string; cambiosLocales: string[] };
      configuracion: Record<string, unknown>;
    },
  ) {}

  note(message: string): void {
    const line = `${new Date().toISOString()} ${message}`;
    this.log.push(line);
    console.log(scrub(line));
  }

  add(result: CaseResult): void {
    this.cases.push(result);
    this.note(`${result.veredicto} [${result.perfil}] ${result.caso}`);
  }

  get failed(): number {
    return this.cases.filter((c) => c.veredicto === "FAIL").length;
  }

  write(dir: string, base: string): { json: string; text: string } {
    mkdirSync(dir, { recursive: true });
    const counts = {
      PASS: this.cases.filter((c) => c.veredicto === "PASS").length,
      FAIL: this.failed,
      NO_CONCLUYENTE: this.cases.filter((c) => c.veredicto === "NO_CONCLUYENTE").length,
    };
    const document = {
      ...this.header,
      declaracion:
        this.header.destino === "b2"
          ? "Ejecutado contra Backblaze B2 real, bucket privado, prefijo de ensayo; datos sintéticos."
          : "Ejecutado contra el doble S3 en memoria, NO contra Backblaze B2: valida la herramienta, no el proveedor.",
      fin: new Date().toISOString(),
      resumen: counts,
      casos: this.cases,
      registro: this.log,
    };
    const json = scrub(JSON.stringify(document, null, 1));
    const lines = [
      `${this.header.herramienta} · destino ${this.header.destino} · perfil ${this.header.perfil} · paso ${this.header.paso}`,
      document.declaracion,
      versionLine(this.header.version),
      `configuración ${JSON.stringify(this.header.configuracion)}`,
      "",
      ...this.cases.flatMap((c) => [
        `${c.veredicto} [${c.perfil}] ${c.caso}`,
        `  esperado: ${c.esperado}`,
        `  observado: ${JSON.stringify(c.observado)}`,
        ...(c.nota ? [`  nota: ${c.nota}`] : []),
      ]),
      "",
      `resumen: ${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.NO_CONCLUYENTE} NO_CONCLUYENTE`,
    ];
    const text = scrub(lines.join("\n") + "\n");
    for (const out of [json, text]) assertNoSecret(out);
    const jsonPath = join(dir, `${base}.json`);
    const textPath = join(dir, `${base}.txt`);
    writeFileSync(jsonPath, json);
    writeFileSync(textPath, text);
    return { json: jsonPath, text: textPath };
  }
}

function versionLine(version: { sha: string; cambiosLocales: string[] }): string {
  const local = version.cambiosLocales.length ? " + cambios locales: " + version.cambiosLocales.join("; ") : "";
  return `versión ${version.sha}${local}`;
}

function secrets(env = process.env): string[] {
  return [
    "BACKUP_S3_ACCESS_KEY_ID",
    "BACKUP_S3_SECRET_ACCESS_KEY",
    "B2_APPLICATION_KEY_ID",
    "B2_APPLICATION_KEY",
    "F08_B151_NODEL_ACCESS_KEY_ID",
    "F08_B151_NODEL_SECRET_ACCESS_KEY",
  ]
    .map((name) => env[name])
    .filter((v): v is string => !!v && v.length >= 6);
}

export function scrub(text: string): string {
  let out = text;
  for (const secret of secrets()) out = out.split(secret).join("[redactado]");
  return out;
}

function assertNoSecret(text: string): void {
  if (secrets().some((s) => text.includes(s))) throw new Error("a secret would be written: report refused");
}

/** Short, non-identifying form of a version id. */
export const shortVersion = (versionId: string | undefined) => (versionId ?? "").slice(0, 10);

/**
 * The SDK client for B2 (same construction as the API: `createS3Client`), or
 * the in-memory double with the profile's refusals simulated. The double
 * honours `MaxKeys`/`MaxUploads` through its page size and does not return
 * ETags in `ListParts`, server-side encryption headers or copies without a
 * pinned version: those observations do not apply to it.
 */
export class B151Connection {
  private constructor(
    readonly target: B151Target,
    readonly sender: S3Sender,
    readonly settings: S3BackupStorageSettings,
    readonly double: InMemoryS3 | null,
  ) {}

  /** Profile simulated by the double (on B2 the key itself decides). */
  simulated: B151Profile = "rw";

  static b2(settings: S3BackupStorageSettings): B151Connection {
    return new B151Connection("b2", createS3Client(settings), settings, null);
  }

  static doble(prefix: string): B151Connection {
    const settings: S3BackupStorageSettings = {
      // Never contacted: the double answers in memory.
      endpoint: "https://doble.invalid",
      region: "doble",
      bucket: "bucket-sintetico-b151",
      accessKeyId: "doble",
      secretAccessKey: "doble",
      prefix: assertB151Prefix(prefix),
    };
    const s3 = new InMemoryS3(settings.bucket);
    const target = new B151Connection("doble", s3, settings, s3);
    const writes = new Set([
      "PutObjectCommand",
      "CreateMultipartUploadCommand",
      "UploadPartCommand",
      "CompleteMultipartUploadCommand",
      "CopyObjectCommand",
      "DeleteObjectCommand",
      "AbortMultipartUploadCommand",
    ]);
    s3.before = (command) => {
      const input = command.input;
      const named = input["Key"] ?? input["Prefix"];
      const key = typeof named === "string" ? named : "";
      if (!key.startsWith(B151_KEY_PREFIX)) throw s3Error("AccessDenied", 403);
      if (target.simulated === "ro" && writes.has(command.name)) throw s3Error("AccessDenied", 403);
      if (
        target.simulated === "nodel" &&
        command.name === "DeleteObjectCommand"
      )
        throw s3Error("AccessDenied", 403);
      const page = (input["MaxKeys"] ?? input["MaxUploads"]) as number | undefined;
      s3.pageSize = page ?? 1000;
    };
    return target;
  }
}

/**
 * Settings of the second key (nodel) for the rotation variant of T-R5: the
 * same endpoint, bucket and prefix as `base`, with the credentials in
 * F08_B151_NODEL_ACCESS_KEY_ID / F08_B151_NODEL_SECRET_ACCESS_KEY (copied
 * from `con_b2.ps1` by `b151_b2.cjs`, never in argv). Null if missing.
 */
export function nodelSettingsFromEnv(
  base: S3BackupStorageSettings,
  env = process.env,
): S3BackupStorageSettings | null {
  const accessKeyId = env["F08_B151_NODEL_ACCESS_KEY_ID"];
  const secretAccessKey = env["F08_B151_NODEL_SECRET_ACCESS_KEY"];
  if (!accessKeyId || !secretAccessKey) return null;
  return { ...base, accessKeyId, secretAccessKey };
}
