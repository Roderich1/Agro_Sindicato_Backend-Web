import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  assertStorageKey,
  BackupObjectMissingError,
  BackupStorage,
  StagedBackupObject,
} from "../domain/backup-storage.port";

/**
 * Development adapter of `BackupStorage` (F08 brief): one file per object in
 * `BACKUP_STORAGE_DIR`, a private directory separate from PostgreSQL.
 *
 * Layout: `objects/<key>` (committed) and `staging/<key>.<random>.part`.
 * Staging and objects share a filesystem, so `commit` is an atomic rename.
 * Files are created with mode 0600 and directories 0700 (where the platform
 * honours POSIX modes). No encryption at rest: declared limitation of F08.
 */
export class LocalDiskBackupStorage implements BackupStorage {
  private readonly objects: string;
  private readonly staging: string;
  private ready?: Promise<void>;

  constructor(root: string) {
    const base = resolve(root);
    this.objects = join(base, "objects");
    this.staging = join(base, "staging");
  }

  private ensureDirectories(): Promise<void> {
    this.ready ??= (async () => {
      await mkdir(this.objects, { recursive: true, mode: 0o700 });
      await mkdir(this.staging, { recursive: true, mode: 0o700 });
    })();
    return this.ready;
  }

  private objectPath(key: string): string {
    assertStorageKey(key);
    return join(this.objects, key);
  }

  async stage(key: string, source: Readable): Promise<StagedBackupObject> {
    const target = this.objectPath(key);
    await this.ensureDirectories();
    const partial = join(this.staging, `${key}.${randomBytes(8).toString("hex")}.part`);
    try {
      await pipeline(source, createWriteStream(partial, { flags: "wx", mode: 0o600 }));
      // Durable before it can be committed.
      const handle = await open(partial, "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    let settled = false;
    return {
      commit: async () => {
        if (settled) throw new Error("Staged backup object already settled");
        settled = true;
        try {
          await rename(partial, target);
        } catch (error) {
          await rm(partial, { force: true });
          throw error;
        }
      },
      discard: async () => {
        settled = true;
        await rm(partial, { force: true });
      },
    };
  }

  async open(key: string): Promise<{ sizeBytes: number; stream: Readable }> {
    const path = this.objectPath(key);
    let size: number;
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new BackupObjectMissingError();
      size = info.size;
    } catch (error) {
      if (error instanceof BackupObjectMissingError) throw error;
      if ((error as { code?: string }).code === "ENOENT")
        throw new BackupObjectMissingError();
      throw error;
    }
    return { sizeBytes: size, stream: createReadStream(path) };
  }

  async remove(key: string): Promise<void> {
    await rm(this.objectPath(key), { force: true });
  }

  async discardStaged(key: string): Promise<void> {
    assertStorageKey(key);
    await this.ensureDirectories();
    for (const name of await readdir(this.staging)) {
      if (name.startsWith(`${key}.`) && name.endsWith(".part"))
        await rm(join(this.staging, name), { force: true });
    }
  }
}
