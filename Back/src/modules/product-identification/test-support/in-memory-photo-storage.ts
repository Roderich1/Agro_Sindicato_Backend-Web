import { Readable } from "node:stream";
import {
  assertStorageKey,
  BackupObjectMissingError,
  BackupStorage,
  StagedBackupObject,
} from "@/modules/backups/domain/backup-storage.port";

/** `BackupStorage` in memory, for E1 unit tests: committed objects and staging. */
export class InMemoryPhotoStorage implements BackupStorage {
  readonly objects = new Map<string, Buffer>();
  readonly staging = new Map<string, Buffer>();
  removeFailures = 0;

  async stage(key: string, source: Readable): Promise<StagedBackupObject> {
    assertStorageKey(key);
    const chunks: Buffer[] = [];
    for await (const chunk of source) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    this.staging.set(key, bytes);
    return {
      commit: async () => {
        this.objects.set(key, bytes);
        this.staging.delete(key);
      },
      discard: async () => {
        this.staging.delete(key);
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
  }

  async discardStaged(key: string): Promise<void> {
    this.staging.delete(key);
  }
}
