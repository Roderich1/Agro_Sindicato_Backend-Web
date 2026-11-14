import { Readable } from "node:stream";
import {
  assertStorageKey,
  BackupObjectMissingError,
  BackupStorage,
  BackupStorageInventory,
  StagedBackupObject,
  stagingKey,
  StoredBackupFile,
} from "@/modules/backups/domain/backup-storage.port";

/**
 * `BackupStorage` in memory, for E1 unit tests: committed objects and
 * staging, with the inventory listing of the F08 adapters. Staging files are
 * named as on disk (`<key>.<16 hex>.part`); `modifiedAt` comes from `clock`
 * at each write and can be set per key to simulate old files.
 */
export class InMemoryPhotoStorage implements BackupStorage, BackupStorageInventory {
  readonly objects = new Map<string, Buffer>();
  readonly staging = new Map<string, Buffer>();
  /** Last write time of each object / staging file, by key. */
  readonly objectTimes = new Map<string, Date>();
  readonly stagingTimes = new Map<string, Date>();
  /** Files outside the layout, listed as they are. */
  readonly foreignFiles: StoredBackupFile[] = [];
  removeFailures = 0;
  clock: () => Date = () => new Date();

  async stage(key: string, source: Readable): Promise<StagedBackupObject> {
    assertStorageKey(key);
    const chunks: Buffer[] = [];
    for await (const chunk of source) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    this.staging.set(key, bytes);
    this.stagingTimes.set(key, this.clock());
    return {
      commit: async () => {
        this.objects.set(key, bytes);
        this.objectTimes.set(key, this.clock());
        this.staging.delete(key);
        this.stagingTimes.delete(key);
      },
      discard: async () => {
        this.staging.delete(key);
        this.stagingTimes.delete(key);
      },
    };
  }

  async open(key: string): Promise<{ sizeBytes: number; stream: Readable }> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new BackupObjectMissingError();
    return { sizeBytes: bytes.length, stream: Readable.from([bytes]) };
  }

  async remove(key: string): Promise<void> {
    if (this.removeFailures > 0) {
      this.removeFailures -= 1;
      throw new Error("synthetic remove failure");
    }
    this.objects.delete(key);
    this.objectTimes.delete(key);
  }

  async discardStaged(key: string): Promise<void> {
    this.staging.delete(key);
    this.stagingTimes.delete(key);
  }

  async list(): Promise<StoredBackupFile[]> {
    const files: StoredBackupFile[] = [];
    for (const [key, bytes] of this.objects) {
      files.push({ area: "objects", name: key, key, sizeBytes: bytes.length, modifiedAt: this.objectTimes.get(key)! });
    }
    for (const [key, bytes] of this.staging) {
      files.push({
        area: "staging",
        name: `${key}.0123456789abcdef.part`,
        key,
        sizeBytes: bytes.length,
        modifiedAt: this.stagingTimes.get(key)!,
      });
    }
    return [...files, ...this.foreignFiles];
  }

  async removeStagedFile(name: string): Promise<void> {
    const key = stagingKey(name);
    if (key === null) throw new Error("Not a staging file");
    if (this.removeFailures > 0) {
      this.removeFailures -= 1;
      throw new Error("synthetic remove failure");
    }
    await this.discardStaged(key);
  }

  /** Plants a file as if written at `at` (orphans, leftovers). */
  plant(area: "objects" | "staging", key: string, at: Date, bytes = Buffer.from("x")): void {
    if (area === "objects") {
      this.objects.set(key, bytes);
      this.objectTimes.set(key, at);
    } else {
      this.staging.set(key, bytes);
      this.stagingTimes.set(key, at);
    }
  }
}
