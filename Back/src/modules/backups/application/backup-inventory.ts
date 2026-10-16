import type { BackupStatus, PrismaClient } from "@prisma/client";
import type {
  BackupStorage,
  BackupStorageInventory,
  StoredBackupFile,
} from "../domain/backup-storage.port";
import { BACKUP_UPLOAD_ABANDON_MS } from "./backups-config";

/**
 * Umbral mínimo admitido: el plazo tras el cual el servicio ya considera
 * abandonada una subida. Por debajo, un archivo podría pertenecer a una subida
 * en curso. Es un límite técnico del propio sistema, no un plazo de retención.
 */
export const MIN_CLEANUP_AGE_MINUTES = BACKUP_UPLOAD_ABANDON_MS / 60_000;

/**
 * F10 (#40, BKP-06 acotado): inventario del almacenamiento privado frente a
 * los metadatos, y limpieza **sólo** de restos que ninguna copia válida
 * necesita.
 *
 * Retención y purga de copias siguen diferidas: no hay plazo institucional
 * aprobado. Por eso aquí:
 * - nunca se toca una copia AVAILABLE, ni su objeto ni su fila;
 * - nunca se borra una fila de metadatos (son el rastro de lo ocurrido);
 * - sólo se eliminan, con un umbral de antigüedad que el operador indica de
 *   forma explícita (no hay valor por defecto), objetos de copias DELETED o
 *   FAILED, objetos sin fila y parciales de staging;
 * - cada candidato se vuelve a comprobar justo antes de borrarlo, y repetir la
 *   limpieza no hace nada más (idempotente).
 */
export type InventoryCategory =
  | "availableOk"
  | "availableMissingObject"
  | "availableSizeMismatch"
  | "uploadingWithoutObject"
  | "uploadingWithObject"
  | "failedWithoutObject"
  | "failedWithObject"
  | "deletedWithoutObject"
  | "deletedWithObject"
  | "unreferencedObject"
  | "unexpectedObjectFile"
  | "stagingPart"
  | "unexpectedStagingFile";

export const INVENTORY_CATEGORIES: readonly InventoryCategory[] = [
  "availableOk",
  "availableMissingObject",
  "availableSizeMismatch",
  "uploadingWithoutObject",
  "uploadingWithObject",
  "failedWithoutObject",
  "failedWithObject",
  "deletedWithoutObject",
  "deletedWithObject",
  "unreferencedObject",
  "unexpectedObjectFile",
  "stagingPart",
  "unexpectedStagingFile",
];

/** Lo único que la limpieza puede eliminar: bytes que ninguna copia ofrece. */
export const CLEANUP_CATEGORIES: readonly InventoryCategory[] = [
  "deletedWithObject",
  "failedWithObject",
  "unreferencedObject",
  "stagingPart",
];

/** Requieren atención humana; la herramienta nunca los corrige. */
export const ATTENTION_CATEGORIES: readonly InventoryCategory[] = [
  "availableMissingObject",
  "availableSizeMismatch",
];

export interface InventoryFinding {
  category: InventoryCategory;
  file: StoredBackupFile | null;
  storageKey: string | null;
}

export type InventorySummary = Record<InventoryCategory, { count: number; bytes: number }>;

export interface InventoryReport {
  findings: InventoryFinding[];
  summary: InventorySummary;
}

type MetadataRow = { storageKey: string; status: BackupStatus; sizeBytes: bigint | null };
type Metadata = Pick<PrismaClient, "backupMetadata">;

export function emptySummary(): InventorySummary {
  return Object.fromEntries(
    INVENTORY_CATEGORIES.map((category) => [category, { count: 0, bytes: 0 }]),
  ) as InventorySummary;
}

function summarize(findings: InventoryFinding[]): InventorySummary {
  const summary = emptySummary();
  for (const finding of findings) {
    summary[finding.category].count += 1;
    summary[finding.category].bytes += finding.file?.sizeBytes ?? 0;
  }
  return summary;
}

function classifyRow(row: MetadataRow, object: StoredBackupFile | undefined): InventoryCategory {
  switch (row.status) {
    case "AVAILABLE":
      if (!object) return "availableMissingObject";
      return row.sizeBytes !== null && BigInt(object.sizeBytes) !== row.sizeBytes
        ? "availableSizeMismatch"
        : "availableOk";
    case "UPLOADING":
      return object ? "uploadingWithObject" : "uploadingWithoutObject";
    case "FAILED":
      return object ? "failedWithObject" : "failedWithoutObject";
    case "DELETED":
      return object ? "deletedWithObject" : "deletedWithoutObject";
  }
}

/** Lee metadatos y almacenamiento y clasifica todo. No modifica nada. */
export async function inventoryBackups(
  prisma: Metadata,
  storage: BackupStorageInventory,
): Promise<InventoryReport> {
  const rows: MetadataRow[] = await prisma.backupMetadata.findMany({
    select: { storageKey: true, status: true, sizeBytes: true },
  });
  const files = await storage.list();
  const objects = new Map<string, StoredBackupFile>();
  const findings: InventoryFinding[] = [];
  for (const file of files) {
    if (file.area === "staging") {
      findings.push({
        category: file.key ? "stagingPart" : "unexpectedStagingFile",
        file,
        storageKey: file.key,
      });
    } else if (file.key) {
      objects.set(file.key, file);
    } else {
      findings.push({ category: "unexpectedObjectFile", file, storageKey: null });
    }
  }
  const referenced = new Set<string>();
  for (const row of rows) {
    referenced.add(row.storageKey);
    const object = objects.get(row.storageKey);
    findings.push({
      category: classifyRow(row, object),
      file: object ?? null,
      storageKey: row.storageKey,
    });
  }
  for (const [key, file] of objects) {
    if (!referenced.has(key))
      findings.push({ category: "unreferencedObject", file, storageKey: key });
  }
  return { findings, summary: summarize(findings) };
}

export interface CleanupOptions {
  /**
   * Antigüedad mínima de un archivo para eliminarlo. Obligatoria y, como
   * mínimo, [MIN_CLEANUP_AGE_MINUTES].
   */
  olderThanMinutes: number;
  /** Sin `apply` sólo se calcula el plan. */
  apply: boolean;
  now?: Date;
}

export interface CleanupReport {
  /** Candidatos con la antigüedad exigida (eliminados si `apply`). */
  planned: InventorySummary;
  /** Eliminados de verdad. Siempre vacío sin `apply`. */
  removed: InventorySummary;
  /** Candidatos que se dejaron: demasiado recientes o cambiaron al recomprobar. */
  kept: InventorySummary;
}

/**
 * Plan (y, con `apply`, ejecución) de la limpieza de restos. Ver la
 * descripción del módulo para lo que nunca se toca.
 */
export async function cleanupBackupLeftovers(
  prisma: Metadata,
  storage: BackupStorage & BackupStorageInventory,
  options: CleanupOptions,
): Promise<CleanupReport> {
  if (
    !Number.isInteger(options.olderThanMinutes) ||
    options.olderThanMinutes < MIN_CLEANUP_AGE_MINUTES
  )
    throw new Error(`olderThanMinutes must be an integer >= ${MIN_CLEANUP_AGE_MINUTES}`);
  const cutoff = (options.now ?? new Date()).getTime() - options.olderThanMinutes * 60_000;
  const report = await inventoryBackups(prisma, storage);
  const planned: InventoryFinding[] = [];
  const kept: InventoryFinding[] = [];
  for (const finding of report.findings) {
    if (!CLEANUP_CATEGORIES.includes(finding.category) || !finding.file) continue;
    (finding.file.modifiedAt.getTime() <= cutoff ? planned : kept).push(finding);
  }
  const removed: InventoryFinding[] = [];
  if (options.apply) {
    for (const finding of planned) {
      if (await stillCandidate(prisma, storage, finding, cutoff)) {
        await remove(storage, finding);
        removed.push(finding);
      } else {
        kept.push(finding);
      }
    }
  }
  return { planned: summarize(planned), removed: summarize(removed), kept: summarize(kept) };
}

/** Vuelve a leer la fila y el archivo justo antes de borrar. */
async function stillCandidate(
  prisma: Metadata,
  storage: BackupStorageInventory,
  finding: InventoryFinding,
  cutoff: number,
): Promise<boolean> {
  const file = (await storage.list()).find(
    (f) => f.area === finding.file!.area && f.name === finding.file!.name,
  );
  if (!file || file.modifiedAt.getTime() > cutoff) return false;
  if (finding.category === "stagingPart") return true;
  const row = await prisma.backupMetadata.findUnique({
    where: { storageKey: finding.storageKey! },
    select: { storageKey: true, status: true, sizeBytes: true },
  });
  const category = row ? classifyRow(row, file) : "unreferencedObject";
  return category === finding.category;
}

async function remove(storage: BackupStorage & BackupStorageInventory, finding: InventoryFinding) {
  if (finding.file!.area === "staging") await storage.removeStagedFile(finding.file!.name);
  else await storage.remove(finding.storageKey!);
}
