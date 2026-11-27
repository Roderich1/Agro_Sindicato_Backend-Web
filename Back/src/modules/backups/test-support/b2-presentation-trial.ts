import { ListMultipartUploadsCommand, ListObjectVersionsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createCipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { createS3Client, S3BackupStorageSettings, S3_PART_BYTES } from "../infrastructure/s3-backup-storage";
import { envelopeHeader } from "./backup-envelope";
import { B151_PROFILES } from "./b151-b2-real";

const scopes = ["respaldos", "fotos"] as const;
type Scope = (typeof scopes)[number];

export function trialConfiguration(run: string, env = process.env) {
  if (!/^\d{8}[a-z0-9]{1,12}$/.test(run)) throw new Error("B2_PRESENTATION_RUN must be a date and a unique suffix.");
  const root = `ensayo-valle-${run}-`;
  const names = ["BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET",
    "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY", "B2_PRESENTATION_LOCAL_PG_URL"] as const;
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing trial settings: ${missing.join(", ")}`);
  const region = env.BACKUP_S3_REGION!;
  const endpoint = env.BACKUP_S3_ENDPOINT!;
  if (!/^[a-z0-9-]+$/.test(region) || endpoint !== `https://s3.${region}.backblazeb2.com`)
    throw new Error("Use the official Backblaze S3 HTTPS endpoint for the configured region.");
  const pg = env.B2_PRESENTATION_LOCAL_PG_URL!;
  const url = URL.canParse(pg) ? new URL(pg) : null;
  if (url?.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.pathname !== "/postgres")
    throw new Error("Use the postgres database on a disposable local PostgreSQL server at 127.0.0.1.");
  const connection = {
    endpoint, region, bucket: env.BACKUP_S3_BUCKET!,
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID!, secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY!,
  };
  const settings = (scope: Scope): S3BackupStorageSettings => ({ ...connection, prefix: `${root}${scope}/` });
  return { root, pg, scopes, settings };
}

export async function verifyTrialKey(settings: S3BackupStorageSettings, root: string) {
  const auth = Buffer.from(`${settings.accessKeyId}:${settings.secretAccessKey}`).toString("base64");
  const response = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: `Basic ${auth}` }, redirect: "error", signal: AbortSignal.timeout(30_000),
  }).catch(() => { throw new Error("b2_authorize_account transport failed."); });
  if (!response.ok) throw new Error(`b2_authorize_account HTTP ${response.status}.`);
  const result = await response.json() as { apiInfo?: { storageApi?: {
    bucketName?: string; namePrefix?: string; capabilities?: string[]; s3ApiUrl?: string;
  } } };
  const api = result.apiInfo?.storageApi;
  if (api?.bucketName !== settings.bucket || api.namePrefix !== root ||
      api.s3ApiUrl?.replace(/\/$/, "") !== settings.endpoint ||
      [...(api.capabilities ?? [])].sort().join() !== [...B151_PROFILES.rw].sort().join()) {
    throw new Error("The B2 key must match the endpoint, one bucket, the exact trial prefix and only listFiles/readFiles/writeFiles/deleteFiles.");
  }
}

async function checked<T>(operation: string, request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    throw new Error(`${operation} failed (${status ? `HTTP ${status}` : "transport or SDK"}).`);
  }
}

export async function trialInventory(client: ReturnType<typeof createS3Client>, settings: S3BackupStorageSettings) {
  const where = { Bucket: settings.bucket, Prefix: settings.prefix };
  const deadline = () => ({ abortSignal: AbortSignal.timeout(30_000) });
  const [objects, versions, uploads] = await Promise.all([
    checked("ListObjectsV2", client.send(new ListObjectsV2Command(where), deadline())),
    checked("ListObjectVersions", client.send(new ListObjectVersionsCommand(where), deadline())),
    checked("ListMultipartUploads", client.send(new ListMultipartUploadsCommand(where), deadline())),
  ]);
  if (objects.IsTruncated || versions.IsTruncated || uploads.IsTruncated)
    throw new Error("Unexpected number of objects in this trial prefix. Use a fresh prefix.");
  return {
    objects: (objects.Contents ?? []).map((entry) => entry.Key!),
    versions: (versions.Versions ?? []).map((entry) => entry.Key!),
    markers: (versions.DeleteMarkers ?? []).map((entry) => entry.Key!),
    multipart: (uploads.Uploads ?? []).map((entry) => entry.Key!),
  };
}

export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A synthetic format-2 envelope with a genuine AEAD tag, large enough for multipart. */
export function encryptedTrialPayload() {
  const plaintext = randomBytes(S3_PART_BYTES + 1024);
  const recovery = randomBytes(32);
  const salt = randomBytes(32);
  const nonce = randomBytes(12);
  const header = envelopeHeader(plaintext.length, (bytes) => {
    Buffer.from(hkdfSync("sha256", recovery, Buffer.alloc(0), "agrocuentas/backup/key-id/v1", 16)).copy(bytes, 12);
    salt.copy(bytes, 28);
    nonce.copy(bytes, 60);
  });
  const fileKey = Buffer.from(hkdfSync("sha256", recovery, salt, "agrocuentas/backup/file-key/v1", 32));
  const cipher = createCipheriv("chacha20-poly1305", fileKey, nonce, { authTagLength: 16 });
  cipher.setAAD(header, { plaintextLength: plaintext.length });
  return Buffer.concat([header, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}
