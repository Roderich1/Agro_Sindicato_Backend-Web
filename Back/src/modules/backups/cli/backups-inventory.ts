import { PrismaClient } from "@prisma/client";
import {
  ATTENTION_CATEGORIES,
  cleanupBackupLeftovers,
  InventorySummary,
  inventoryBackups,
  MIN_CLEANUP_AGE_MINUTES,
} from "../application/backup-inventory";
import { LocalDiskBackupStorage } from "../infrastructure/local-disk-backup-storage";

/**
 * F10 (#40): inventario del almacenamiento privado de respaldos, para el
 * operador. Lee `DATABASE_URL` y `BACKUP_STORAGE_DIR` del entorno.
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
  const storageDir = process.env["BACKUP_STORAGE_DIR"];
  if (!storageDir || !process.env["DATABASE_URL"]) {
    out("Faltan BACKUP_STORAGE_DIR o DATABASE_URL en el entorno.");
    return 2;
  }
  const prisma = new PrismaClient();
  try {
    const storage = new LocalDiskBackupStorage(storageDir);
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
