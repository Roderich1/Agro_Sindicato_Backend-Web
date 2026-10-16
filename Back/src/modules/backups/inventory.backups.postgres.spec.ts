import { afterAll, beforeAll } from "@jest/globals";
import { BackupStatus, PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  cleanupBackupLeftovers,
  emptySummary,
  InventoryCategory,
  inventoryBackups,
} from "./application/backup-inventory";
import { main } from "./cli/backups-inventory";
import { LocalDiskBackupStorage } from "./infrastructure/local-disk-backup-storage";
import { createIsolatedDatabase, Fixture, seedFixture } from "../sync-v1/test-support/sync-v1-test-app";

/**
 * F10 (#40, BKP-06 acotado): inventario y limpieza de restos sobre un
 * PostgreSQL desechable y una carpeta real. Opt-in: F08_BKP_PG_TEST_URL (el
 * nombre del archivo coincide con el patrón que ya ejecuta la CI). Todo es
 * sintético.
 */
const postgresUrl = process.env["F08_BKP_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const HOUR = 60 * 60 * 1000;

describePostgres("F10 backup inventory and leftover cleanup on PostgreSQL and disk", () => {
  let prisma: PrismaClient;
  let databaseUrl: string;
  let f: Fixture;
  let root: string;
  let storage: LocalDiskBackupStorage;
  const keys: Record<string, string> = {};
  const now = new Date();
  const old = new Date(now.getTime() - 3 * HOUR);

  const object = (key: string) => join(root, "objects", key);
  const staged = (name: string) => join(root, "staging", name);

  async function file(path: string, bytes: number, at: Date) {
    await writeFile(path, randomBytes(bytes));
    await utimes(path, at, at);
  }

  async function row(name: string, status: BackupStatus, sizeBytes: number | null) {
    keys[name] = randomUUID();
    await prisma.backupMetadata.create({
      data: {
        id: randomUUID(),
        tenantId: f.tenantA,
        memberId: f.members.farmerA,
        status,
        storageKey: keys[name],
        contentType: "application/vnd.agrocuentas.backup+zip",
        formatVersion: 1,
        schemaVersion: 9,
        sha256: "0".repeat(64),
        sizeBytes: sizeBytes === null ? null : BigInt(sizeBytes),
        deletedAt: status === "DELETED" ? old : null,
      },
    });
    return keys[name];
  }

  const files = async () => ({
    objects: (await readdir(join(root, "objects"))).sort(),
    staging: (await readdir(join(root, "staging"))).sort(),
  });
  const rows = () => prisma.backupMetadata.findMany({ orderBy: { storageKey: "asc" } });

  beforeAll(async () => {
    databaseUrl = await createIsolatedDatabase(postgresUrl!, "f10_bkp_inv");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    f = await seedFixture(prisma as unknown as PrismaService);
    root = await mkdtemp(join(tmpdir(), "f10-bkp-inventory-"));
    await mkdir(join(root, "objects"), { recursive: true });
    await mkdir(join(root, "staging"), { recursive: true });
    storage = new LocalDiskBackupStorage(root);

    await file(object(await row("availableOk", "AVAILABLE", 64)), 64, old);
    await row("availableMissing", "AVAILABLE", 64);
    await file(object(await row("availableSize", "AVAILABLE", 999)), 64, old);
    await file(object(await row("uploadingWithObject", "UPLOADING", null)), 64, old);
    await row("uploadingWithout", "UPLOADING", null);
    await file(object(await row("failedOld", "FAILED", null)), 32, old);
    await file(object(await row("failedYoung", "FAILED", null)), 32, now);
    await row("failedWithout", "FAILED", null);
    await file(object(await row("deletedOld", "DELETED", 64)), 64, old);
    await row("deletedWithout", "DELETED", 64);
    keys["orphanOld"] = randomUUID();
    await file(object(keys["orphanOld"]), 16, old);
    keys["orphanYoung"] = randomUUID();
    await file(object(keys["orphanYoung"]), 16, now);
    await file(object("notas.txt"), 8, old);
    keys["stagingOld"] = `${randomUUID()}.${randomBytes(8).toString("hex")}.part`;
    await file(staged(keys["stagingOld"]), 8, old);
    keys["stagingYoung"] = `${randomUUID()}.${randomBytes(8).toString("hex")}.part`;
    await file(staged(keys["stagingYoung"]), 8, now);
    await file(staged("otra.tmp"), 8, old);
  }, 180000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (root) await rm(root, { recursive: true, force: true });
  });

  const expected = (counts: Partial<Record<InventoryCategory, number>>) => {
    const summary = emptySummary();
    for (const [category, count] of Object.entries(counts))
      summary[category as InventoryCategory].count = count;
    return summary;
  };
  const counts = (summary: ReturnType<typeof emptySummary>) =>
    Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.count]));

  it("classifies every row and file without modifying anything", async () => {
    const filesBefore = await files();
    const rowsBefore = await rows();
    const report = await inventoryBackups(prisma, storage);
    expect(counts(report.summary)).toEqual(
      counts(
        expected({
          availableOk: 1,
          availableMissingObject: 1,
          availableSizeMismatch: 1,
          uploadingWithObject: 1,
          uploadingWithoutObject: 1,
          failedWithObject: 2,
          failedWithoutObject: 1,
          deletedWithObject: 1,
          deletedWithoutObject: 1,
          unreferencedObject: 2,
          unexpectedObjectFile: 1,
          stagingPart: 2,
          unexpectedStagingFile: 1,
        }),
      ),
    );
    expect(await files()).toEqual(filesBefore);
    expect(await rows()).toEqual(rowsBefore);
  });

  it("refuses a missing or too short age threshold", async () => {
    for (const olderThanMinutes of [0, 1, 59, 60.5])
      await expect(
        cleanupBackupLeftovers(prisma, storage, { olderThanMinutes, apply: true }),
      ).rejects.toThrow("olderThanMinutes");
  });

  it("dry-run plans only old leftovers and removes nothing", async () => {
    const filesBefore = await files();
    const report = await cleanupBackupLeftovers(prisma, storage, {
      olderThanMinutes: 60,
      apply: false,
      now,
    });
    expect(counts(report.planned)).toEqual(
      counts(expected({ failedWithObject: 1, deletedWithObject: 1, unreferencedObject: 1, stagingPart: 1 })),
    );
    expect(counts(report.kept)).toEqual(
      counts(expected({ failedWithObject: 1, unreferencedObject: 1, stagingPart: 1 })),
    );
    expect(counts(report.removed)).toEqual(counts(emptySummary()));
    expect(await files()).toEqual(filesBefore);
  });

  it("a candidate that changes before removal is kept (re-checked right before deleting)", async () => {
    // Otro proceso vuelve a escribir el objeto de la copia DELETED entre el
    // plan y el borrado: deja de ser antiguo y no se toca.
    let calls = 0;
    const racing = Object.create(storage) as LocalDiskBackupStorage;
    racing.list = async () => {
      calls += 1;
      if (calls === 2) await utimes(object(keys["deletedOld"]), now, now);
      return storage.list();
    };
    const report = await cleanupBackupLeftovers(prisma, racing, {
      olderThanMinutes: 60,
      apply: true,
      now,
    });
    expect(report.removed.deletedWithObject.count).toBe(0);
    expect(report.kept.deletedWithObject.count).toBe(1);
    expect((await files()).objects).toContain(keys["deletedOld"]);
    // Los demás candidatos antiguos sí se eliminaron.
    expect(counts(report.removed)).toEqual(
      counts(expected({ failedWithObject: 1, unreferencedObject: 1, stagingPart: 1 })),
    );
    await utimes(object(keys["deletedOld"]), old, old);
  });

  it("apply removes only leftovers, never an AVAILABLE copy or a metadata row, and is idempotent", async () => {
    const rowsBefore = await rows();
    const first = await cleanupBackupLeftovers(prisma, storage, {
      olderThanMinutes: 60,
      apply: true,
      now,
    });
    expect(counts(first.removed)).toEqual(counts(expected({ deletedWithObject: 1 })));
    const left = await files();
    for (const kept of [
      keys["availableOk"],
      keys["availableSize"],
      keys["uploadingWithObject"],
      keys["failedYoung"],
      keys["orphanYoung"],
      "notas.txt",
    ])
      expect(left.objects).toContain(kept);
    for (const gone of [keys["failedOld"], keys["deletedOld"], keys["orphanOld"]])
      expect(left.objects).not.toContain(gone);
    expect(left.staging.sort()).toEqual([keys["stagingYoung"], "otra.tmp"].sort());
    expect(await rows()).toEqual(rowsBefore);

    const again = await cleanupBackupLeftovers(prisma, storage, {
      olderThanMinutes: 60,
      apply: true,
      now,
    });
    expect(counts(again.planned)).toEqual(counts(emptySummary()));
    expect(counts(again.removed)).toEqual(counts(emptySummary()));
    expect(await files()).toEqual(left);
  });

  it("a candidate whose metadata row changes before removal is kept (row re-checked)", async () => {
    // Un objeto sin fila, antiguo: candidato. Entre el plan y el borrado
    // aparece su fila (UPLOADING): deja de ser un resto y no se toca.
    const key = randomUUID();
    await file(object(key), 16, old);
    let calls = 0;
    const racing = Object.create(storage) as LocalDiskBackupStorage;
    racing.list = async () => {
      calls += 1;
      if (calls === 2)
        await prisma.backupMetadata.create({
          data: {
            id: randomUUID(),
            tenantId: f.tenantA,
            memberId: f.members.farmerA,
            status: "UPLOADING",
            storageKey: key,
            contentType: "application/vnd.agrocuentas.backup+zip",
            formatVersion: 1,
            schemaVersion: 9,
            sha256: "0".repeat(64),
          },
        });
      return storage.list();
    };
    const report = await cleanupBackupLeftovers(prisma, racing, {
      olderThanMinutes: 60,
      apply: true,
      now,
    });
    expect(report.planned.unreferencedObject.count).toBe(1);
    expect(report.removed.unreferencedObject.count).toBe(0);
    // El que cambió y el reciente del principio (orphanYoung).
    expect(report.kept.unreferencedObject.count).toBe(2);
    expect((await files()).objects).toContain(key);
  });

  it("the CLI prints only counts, flags AVAILABLE anomalies with exit 3 and validates arguments", async () => {
    const previous = { db: process.env["DATABASE_URL"], dir: process.env["BACKUP_STORAGE_DIR"] };
    process.env["DATABASE_URL"] = databaseUrl;
    process.env["BACKUP_STORAGE_DIR"] = root;
    try {
      const lines: string[] = [];
      const code = await main(["--cleanup", "--older-than-minutes", "60"], (l) => lines.push(l));
      const output = lines.join("\n");
      expect(code).toBe(3);
      expect(output).toContain("dry-run");
      expect(output).toContain("availableMissingObject");
      const identifiers = [
        f.tenantA,
        f.members.farmerA,
        ...Object.values(keys).map((k) => k.slice(0, 36)),
      ];
      for (const id of identifiers) expect(output).not.toContain(id);
      expect(output).not.toContain(root);

      for (const bad of [
        ["--apply"],
        ["--cleanup"],
        ["--cleanup", "--older-than-minutes", "30"],
        ["--older-than-minutes", "120"],
        ["--cleanup", "--older-than-minutes", "-5"],
        ["--borrar-todo"],
      ]) {
        const out: string[] = [];
        expect(await main(bad, (l) => out.push(l))).toBe(2);
      }
    } finally {
      if (previous.db === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = previous.db;
      if (previous.dir === undefined) delete process.env["BACKUP_STORAGE_DIR"];
      else process.env["BACKUP_STORAGE_DIR"] = previous.dir;
    }
  });
});
