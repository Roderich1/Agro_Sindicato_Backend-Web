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
  BACKUP_MAX_ACTIVE_PER_MEMBER: optionalText(
    z.coerce.number().int().positive().max(100),
  ),
});

export type Env = z.infer<typeof envSchema>;
