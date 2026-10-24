import { z } from "zod";
import { DURATION_PATTERN } from "./duration";

const duration = z
  .string()
  .regex(
    DURATION_PATTERN,
    "must be a positive integer followed by s, m, h, or d",
  );

/** An empty value (as in `.env.example`) means "not configured". */
const optionalText = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  JWT_EXPIRES_IN: duration.default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: duration.default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  // Sync v1 fingerprint HMAC (base64, >= 32 bytes) and its internal version.
  // Without a key, Sync v1 writes answer 503 (admission closed).
  SYNC_V1_FINGERPRINT_KEY: optionalText(z.string()),
  SYNC_V1_FINGERPRINT_KEY_VERSION: optionalText(
    z.coerce.number().int().positive(),
  ),
  // Keys of earlier versions, `version=base64` comma separated, for replays.
  SYNC_V1_FINGERPRINT_PREVIOUS_KEYS: optionalText(z.string()),
  // Production admission stays closed until retention/disclosure policies.
  SYNC_V1_PRODUCTION_ADMISSION: optionalText(z.enum(["enabled", "disabled"])),
  // F06 #21 / F07-POL-01 (#107): no collective figures until the policy is
  // approved. `provisional-synthetic` (k=3) only outside production, for
  // synthetic data; production always behaves as `disabled`.
  COLLECTIVE_DISCLOSURE_MODE: optionalText(
    z.enum(["disabled", "provisional-synthetic"]),
  ),
  // F08 private backups: development disk adapter directory. Without it the
  // `/me/backups` routes answer 503. Not encrypted at rest (declared limit).
  BACKUP_STORAGE_DIR: optionalText(z.string()),
  BACKUP_MAX_BYTES: optionalText(
    z.coerce.number().int().positive().max(1024 * 1024 * 1024),
  ),
  // Production stays closed unless explicitly admitted (not authorised yet).
  BACKUP_PRODUCTION_ADMISSION: optionalText(z.enum(["enabled", "disabled"])),
  // F08-ADR-003: `true` rejects new uploads that are not encrypted on the
  // phone (format 1). Default `false` keeps the synthetic B2 tool working; it
  // is a condition before admitting real data, not an admission.
  BACKUP_REQUIRE_CLIENT_ENCRYPTION: optionalText(z.enum(["true", "false"])),
  BACKUP_MAX_ACTIVE_PER_MEMBER: optionalText(
    z.coerce.number().int().positive().max(100),
  ),
  // F08-BKP-06 (#40): deadline of one upload. Must stay below the abandon
  // window (BACKUP_UPLOAD_ABANDON_MS, 60 min), so an UPLOADING row older than
  // that has no transfer in progress.
  BACKUP_UPLOAD_DEADLINE_MS: optionalText(
    z.coerce.number().int().min(60_000).max(3_599_999),
  ),
  // F08-BKP-07: storage provider. Empty or `disk` = BACKUP_STORAGE_DIR (as
  // before); `b2` = the S3 variables below, and never the disk. An
  // incomplete `b2` configuration leaves the routes at 503.
  BACKUP_STORAGE_PROVIDER: optionalText(z.enum(["disk", "b2"])),
  BACKUP_S3_ENDPOINT: optionalText(
    z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          (url.pathname === "/" || url.pathname === "") &&
          !url.search &&
          !url.hash
        );
      }, "must be an https origin without path, query or credentials"),
  ),
  BACKUP_S3_REGION: optionalText(z.string().regex(/^[a-z0-9-]{1,32}$/)),
  BACKUP_S3_BUCKET: optionalText(z.string().regex(/^[A-Za-z0-9-]{6,63}$/)),
  // Secrets: length and pattern checks only, so a validation error never
  // carries the value.
  BACKUP_S3_ACCESS_KEY_ID: optionalText(z.string().regex(/^\S{1,128}$/)),
  BACKUP_S3_SECRET_ACCESS_KEY: optionalText(z.string().regex(/^\S{1,256}$/)),
  // One segment ending in "/" (e.g. `ensayo-f08/`): never the bucket root.
  BACKUP_S3_PREFIX: optionalText(z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}\/$/)),
  // #81 PHASE 6: the farmer's legacy private writes are closed (403
  // LEGACY_ROUTE_CLOSED). `enabled` is an operational rollback of this
  // server only, never the normal path; it authorises nothing.
  LEGACY_PRIVATE_WRITES_ROLLBACK: optionalText(z.enum(["enabled", "disabled"])),
});

export type Env = z.infer<typeof envSchema>;
