import type { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { envSchema } from "../../../config/env.schema";
import {
  ATTENTION_CATEGORIES,
  cleanupBackupLeftovers,
  InventorySummary,
  inventoryBackups,
  MIN_CLEANUP_AGE_MINUTES,
} from "../application/backup-inventory";
import { BackupsConfig } from "../application/backups-config";
import type { BackupStorage, BackupStorageInventory } from "../domain/backup-storage.port";
import { LocalDiskBackupStorage } from "../infrastructure/local-disk-backup-storage";
import { createS3Client, S3BackupStorage } from "../infrastructure/s3-backup-storage";

/**
 * F10 (#40): inventario del almacenamiento privado de respaldos, para el
 * operador. Lee `DATABASE_URL` y el almacenamiento del entorno: con
 * `BACKUP_STORAGE_PROVIDER` vacío o `disk`, `BACKUP_STORAGE_DIR`; con `b2`, las
 * variables `BACKUP_S3_*` (F08-BKP-07). Se ejecuta desde `dist/`: requiere
 * `npm run build` antes.
 *
 *   npm run backups:inventory
 *       Inventario. No modifica nada.
 *   npm run backups:inventory -- --cleanup --older-than-minutes <N>
 *       Plan de limpieza de restos (dry-run). N >= 60.
 *   npm run backups:inventory -- --cleanup --older-than-minutes <N> --apply
 *       Ejecuta ese plan.
 *
 * Imprime sólo conteos y bytes por categoría: ni claves, ni identificadores de
 * personas, ni contenido. Código de salida 3 si hay copias AVAILABLE sin
 * objeto o con otro tamaño (requieren revisión humana; nunca se corrigen
 * aquí), 2 si los argumentos no son válidos.
 */
const USAGE =
  "uso: backups-inventory [--cleanup --older-than-minutes <N> [--apply]] " +
  `(N entero >= ${MIN_CLEANUP_AGE_MINUTES})`;

export interface InventoryArgs {
  cleanup: boolean;
  olderThanMinutes: number | null;
  apply: boolean;
}

export function parseArgs(argv: string[]): InventoryArgs {
  const args: InventoryArgs = { cleanup: false, olderThanMinutes: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--cleanup") args.cleanup = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--older-than-minutes") {
      const value = argv[++i];
      if (value === undefined || !/^\d+$/.test(value)) throw new Error(USAGE);
      args.olderThanMinutes = Number(value);
    } else throw new Error(USAGE);
  }
  if (args.apply && !args.cleanup) throw new Error(USAGE);
  if (args.cleanup && (args.olderThanMinutes === null || args.olderThanMinutes < MIN_CLEANUP_AGE_MINUTES))
    throw new Error(USAGE);
  if (!args.cleanup && args.olderThanMinutes !== null) throw new Error(USAGE);
  return args;
}

const BACKUP_ENV = envSchema.pick({
  BACKUP_STORAGE_DIR: true,
  BACKUP_STORAGE_PROVIDER: true,
  BACKUP_S3_ENDPOINT: true,
  BACKUP_S3_REGION: true,
  BACKUP_S3_BUCKET: true,
  BACKUP_S3_ACCESS_KEY_ID: true,
  BACKUP_S3_SECRET_ACCESS_KEY: true,
  BACKUP_S3_PREFIX: true,
});

/**
 * El almacenamiento que eligió el entorno, o un error que sólo nombra
 * variables (nunca sus valores). Con `b2` nunca se usa el disco.
 */
export function storageFromEnv(
  env: NodeJS.ProcessEnv,
): { storage: BackupStorage & BackupStorageInventory } | { error: string } {
  const parsed = BACKUP_ENV.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return { error: `Variables con formato inválido: ${names.join(", ")}.` };
  }
  if (!env["DATABASE_URL"]) return { error: "Falta DATABASE_URL en el entorno." };
  // Only the validated values: never a process variable the schema did not check.
  const values = parsed.data as Record<string, unknown>;
  const config = new BackupsConfig({ get: (name: string) => values[name] } as unknown as ConfigService);
  if (config.storageProvider === "b2") {
    const s3 = config.s3Settings;
    if ("missing" in s3) return { error: `Faltan en el entorno: ${s3.missing.join(", ")}.` };
    return { storage: new S3BackupStorage(createS3Client(s3.settings), s3.settings) };
  }
  if (!config.storageDir) return { error: "Faltan BACKUP_STORAGE_DIR o DATABASE_URL en el entorno." };
  return { storage: new LocalDiskBackupStorage(config.storageDir) };
}

function nonZero(summary: InventorySummary) {
  return Object.fromEntries(Object.entries(summary).filter(([, v]) => v.count > 0));
}

export async function main(argv: string[], out: (line: string) => void): Promise<number> {
  let args: InventoryArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    out((error as Error).message);
    return 2;
  }
  const selected = storageFromEnv(process.env);
  if ("error" in selected) {
    out(selected.error);
    return 2;
  }
  const storage = selected.storage;
  const prisma = new PrismaClient();
  try {
    const inventory = await inventoryBackups(prisma, storage);
    out(JSON.stringify({ inventario: nonZero(inventory.summary) }, null, 2));
    if (args.cleanup) {
      const report = await cleanupBackupLeftovers(prisma, storage, {
        olderThanMinutes: args.olderThanMinutes!,
        apply: args.apply,
      });
      out(
        JSON.stringify(
          {
            limpieza: args.apply ? "aplicada" : "dry-run (sin --apply no se elimina nada)",
            antiguedadMinimaMinutos: args.olderThanMinutes,
            plan: nonZero(report.planned),
            eliminados: nonZero(report.removed),
            conservados: nonZero(report.kept),
          },
          null,
          2,
        ),
      );
    }
    const attention = ATTENTION_CATEGORIES.some((c) => inventory.summary[c].count > 0);
    if (attention) out("ATENCIÓN: hay copias AVAILABLE sin objeto o con otro tamaño.");
    return attention ? 3 : 0;
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
