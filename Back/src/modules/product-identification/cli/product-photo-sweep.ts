import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { envSchema } from "../../../config/env.schema";
import { ProductPhotoConfig } from "../application/product-photo-config";
import { PhotoSweepReport, sweepProductPhotos } from "../application/product-photo-sweep";
import {
  createProductPhotoStorage,
  photoStorageInventory,
  ProductPhotoStorage,
} from "../infrastructure/product-photo-storage";

/**
 * E1 §10: barrido del almacenamiento privado de fotos de etiqueta, para el
 * operador. Lee `DATABASE_URL` y el almacenamiento de fotos del entorno
 * (`PRODUCT_PHOTO_STORAGE_DIR`, o `PRODUCT_PHOTO_STORAGE_PROVIDER=b2` con
 * `BACKUP_S3_*` y `PRODUCT_PHOTO_S3_PREFIX`) y la retención
 * `PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK` (vacía = 90). Se ejecuta desde
 * `dist/`: requiere `npm run build` antes.
 *
 *   npm run product-photos:sweep
 *       Plan (dry-run): cuenta huérfanos y restos de staging de más de 24 h y
 *       fotos de solicitudes vinculadas con la retención vencida. No modifica nada.
 *   npm run product-photos:sweep -- --apply
 *       Ejecuta ese plan.
 *
 * Nunca toca un objeto que una fila referencia ni archivos fuera del formato
 * del almacenamiento. Imprime sólo conteos: ni claves, ni nombres, ni
 * contenido. Código de salida 3 si alguna eliminación falló (se reintenta en
 * la siguiente ejecución), 2 si los argumentos o el entorno no son válidos.
 */
const USAGE = "uso: product-photo-sweep [--apply]";

export function parseArgs(argv: string[]): { apply: boolean } {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error(USAGE);
}

const PHOTO_ENV = envSchema.pick({
  BACKUP_STORAGE_DIR: true,
  BACKUP_S3_ENDPOINT: true,
  BACKUP_S3_REGION: true,
  BACKUP_S3_BUCKET: true,
  BACKUP_S3_ACCESS_KEY_ID: true,
  BACKUP_S3_SECRET_ACCESS_KEY: true,
  BACKUP_S3_PREFIX: true,
  PRODUCT_PHOTO_STORAGE_DIR: true,
  PRODUCT_PHOTO_STORAGE_PROVIDER: true,
  PRODUCT_PHOTO_S3_PREFIX: true,
  PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK: true,
});

/**
 * El almacenamiento de fotos y la configuración que eligió el entorno, o un
 * error que sólo nombra variables (nunca sus valores).
 */
export function photoStorageFromEnv(
  env: Record<string, string | undefined>,
): { storage: ProductPhotoStorage; config: ProductPhotoConfig } | { error: string } {
  const parsed = PHOTO_ENV.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return { error: `Variables con formato inválido: ${names.join(", ")}.` };
  }
  if (!env["DATABASE_URL"]) return { error: "Falta DATABASE_URL en el entorno." };
  // Only the validated values: never a process variable the schema did not check.
  const values = parsed.data as Record<string, unknown>;
  const config = new ProductPhotoConfig({ get: (name: string) => values[name] } as unknown as ConfigService);
  const problems: string[] = [];
  const storage = photoStorageInventory(
    createProductPhotoStorage(config, { error: (line: string) => problems.push(line), warn: () => undefined } as Pick<
      Logger,
      "error" | "warn"
    >),
  );
  if (!storage) {
    return {
      error: problems[0] ?? "Falta PRODUCT_PHOTO_STORAGE_DIR (o PRODUCT_PHOTO_STORAGE_PROVIDER=b2) en el entorno.",
    };
  }
  return { storage, config };
}

function summary(report: PhotoSweepReport) {
  return {
    barrido: report.apply ? "aplicado" : "dry-run (sin --apply no se elimina nada)",
    retencionVencida: report.retention,
    huerfanos: report.orphans,
    staging: report.staging,
    recientesConservados: report.recent,
    referenciados: report.referenced,
    ajenosAlFormato: report.foreign,
  };
}

export async function main(argv: string[], out: (line: string) => void): Promise<number> {
  let args: { apply: boolean };
  try {
    args = parseArgs(argv);
  } catch (error) {
    out((error as Error).message);
    return 2;
  }
  const selected = photoStorageFromEnv(process.env);
  if ("error" in selected) {
    out(selected.error);
    return 2;
  }
  const prisma = new PrismaClient();
  try {
    const report = await sweepProductPhotos(prisma, selected.storage, {
      apply: args.apply,
      retentionDaysAfterLink: selected.config.retentionDaysAfterLink,
    });
    out(JSON.stringify(summary(report), null, 2));
    const failed = report.retention.failed + report.orphans.failed + report.staging.failed;
    return failed > 0 ? 3 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main(process.argv.slice(2), (line) => console.log(line)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`Error: ${(error as Error).name}`);
      process.exit(1);
    },
  );
}
