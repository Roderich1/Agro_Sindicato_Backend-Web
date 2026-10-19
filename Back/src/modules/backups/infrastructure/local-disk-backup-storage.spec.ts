import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { backupStorageContract } from "../test-support/backup-storage.contract";
import { LocalDiskBackupStorage } from "./local-disk-backup-storage";

/** F08-BKP-02 (#38): disk adapter on a real temporary directory. */
backupStorageContract("LocalDiskBackupStorage", async () => {
  const root = await mkdtemp(join(tmpdir(), "f08-bkp-02-"));
  return {
    storage: new LocalDiskBackupStorage(root),
    entries: async (area) => (await readdir(join(root, area)).catch(() => [])).sort(),
    writeForeign: (area, name, content) => writeFile(join(root, area, name), content),
    readForeign: (area, name) => readFile(join(root, area, name), "utf8"),
    isEmpty: async () => (await readdir(root)).length === 0,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
});

describe("LocalDiskBackupStorage directory creation", () => {
  it("does not cache a failed mkdir: a later request retries", async () => {
    const parent = await mkdtemp(join(tmpdir(), "f08-bkp-mkdir-"));
    const blocker = join(parent, "root");
    await writeFile(blocker, "not a directory");
    const storage = new LocalDiskBackupStorage(blocker);
    await expect(storage.stage(randomUUID(), Readable.from([Buffer.from("x")]))).rejects.toBeDefined();
    await rm(blocker);
    const key = randomUUID();
    await (await storage.stage(key, Readable.from([Buffer.from("x")]))).commit();
    expect((await storage.open(key)).sizeBytes).toBe(1);
    await rm(parent, { recursive: true, force: true });
  });

  it("leaves the versioned-store fields of the inventory unset", async () => {
    const root = await mkdtemp(join(tmpdir(), "f08-bkp-fields-"));
    const storage = new LocalDiskBackupStorage(root);
    await (await storage.stage(randomUUID(), Readable.from([Buffer.from("x")]))).commit();
    await storage.stage(randomUUID(), Readable.from([Buffer.from("y")]));
    for (const file of await storage.list()) {
      expect(file.versionId).toBeUndefined();
      expect(file.hidden).toBeUndefined();
      expect(file.deleteMarker).toBeUndefined();
      expect(file.incompleteUpload).toBeUndefined();
    }
    await rm(root, { recursive: true, force: true });
  });
});
