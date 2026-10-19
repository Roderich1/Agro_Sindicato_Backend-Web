import { afterEach, beforeEach } from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  BackupObjectMissingError,
  BackupStorage,
  BackupStorageInventory,
} from "../domain/backup-storage.port";

/** What the contract needs to look at a storage from outside the adapter. */
export interface StorageHarness {
  storage: BackupStorage & BackupStorageInventory;
  /** Every stored entry of an area: for a versioned store, all versions, markers and uploads. */
  entries(area: "objects" | "staging"): Promise<string[]>;
  /** Writes a file the adapter did not write (a third party). */
  writeForeign(area: "objects" | "staging", name: string, content: string): Promise<void>;
  readForeign(area: "objects" | "staging", name: string): Promise<string>;
  /** Nothing at all was written. */
  isEmpty(): Promise<boolean>;
  dispose(): Promise<void>;
}

/**
 * Code-unit order for keys and names: deterministic and locale independent,
 * unlike `localeCompare` or a `sort()` without a compare function.
 */
export const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** A source that emits some bytes and then fails, like a cut transfer. */
export function failingSource(bytes: Buffer) {
  let sent = false;
  return new Readable({
    read() {
      if (!sent) {
        sent = true;
        this.push(bytes);
      } else {
        this.destroy(new Error("transfer cut"));
      }
    },
  });
}

/**
 * F08-BKP-02/07: the behaviour every `BackupStorage` adapter must show, run
 * on the disk adapter and on the S3 adapter over the in-memory S3 double.
 */
export function backupStorageContract(label: string, create: () => Promise<StorageHarness>) {
  describe(`BackupStorage contract: ${label}`, () => {
    let h: StorageHarness;
    let storage: BackupStorage & BackupStorageInventory;

    beforeEach(async () => {
      h = await create();
      storage = h.storage;
    });

    afterEach(async () => {
      await h.dispose();
    });

    it("a staged object is invisible until committed, then readable under its key", async () => {
      const key = randomUUID();
      const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
      await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
      expect(await h.entries("staging")).toHaveLength(1);

      await staged.commit();

      const opened = await storage.open(key);
      expect(opened.sizeBytes).toBe(8);
      expect((await readAll(opened.stream)).toString()).toBe("respaldo");
      expect(await h.entries("staging")).toEqual([]);
      expect(await h.entries("objects")).toEqual([key]);
    });

    it("a copy of 1 MiB (S1 of the evaluation) round-trips and is removed", async () => {
      const key = randomUUID();
      const bytes = randomBytes(1024 * 1024);
      await (await storage.stage(key, Readable.from([bytes]))).commit();
      const opened = await storage.open(key);
      expect(opened.sizeBytes).toBe(bytes.length);
      expect((await readAll(opened.stream)).equals(bytes)).toBe(true);
      await storage.remove(key);
      await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
      expect(await h.entries("objects")).toEqual([]);
      expect(await h.entries("staging")).toEqual([]);
    });

    it("discard leaves nothing behind", async () => {
      const key = randomUUID();
      const staged = await storage.stage(key, Readable.from([Buffer.from("x")]));
      await staged.discard();
      await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
      expect(await h.entries("staging")).toEqual([]);
      expect(await h.entries("objects")).toEqual([]);
    });

    it("a source that fails mid-transfer leaves no partial file and keeps the previous object", async () => {
      const previous = randomUUID();
      await (await storage.stage(previous, Readable.from([Buffer.from("válida")]))).commit();

      await expect(
        storage.stage(randomUUID(), failingSource(Buffer.alloc(4096, 1))),
      ).rejects.toThrow("transfer cut");

      expect(await h.entries("staging")).toEqual([]);
      expect(await h.entries("objects")).toEqual([previous]);
      expect((await readAll((await storage.open(previous)).stream)).toString()).toBe("válida");
    });

    it("only server-generated UUID keys are accepted, never paths", async () => {
      for (const key of ["../escape", "a/b", "C:\\x", "", "not-a-uuid"]) {
        await expect(storage.stage(key, Readable.from([Buffer.from("x")]))).rejects.toThrow(
          "Invalid backup storage key",
        );
        await expect(storage.open(key)).rejects.toThrow("Invalid backup storage key");
        await expect(storage.remove(key)).rejects.toThrow("Invalid backup storage key");
        await expect(storage.discardStaged(key)).rejects.toThrow("Invalid backup storage key");
      }
      expect(await h.isEmpty()).toBe(true);
    });

    it("remove is idempotent and discardStaged clears an abandoned upload", async () => {
      const key = randomUUID();
      await (await storage.stage(key, Readable.from([Buffer.from("x")]))).commit();
      await storage.remove(key);
      await storage.remove(key);
      await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);

      const abandoned = randomUUID();
      await storage.stage(abandoned, Readable.from([Buffer.from("y")]));
      const other = `${randomUUID()}.0123456789abcdef.part`;
      await h.writeForeign("staging", other, "other");
      await storage.discardStaged(abandoned);
      await storage.discardStaged(abandoned);
      expect(await h.entries("staging")).toEqual([other]);
      expect(await h.readForeign("staging", other)).toBe("other");
    });

    it("a committed object cannot be committed twice", async () => {
      const staged = await storage.stage(randomUUID(), Readable.from([Buffer.from("x")]));
      await staged.commit();
      await expect(staged.commit()).rejects.toThrow("already settled");
    });

    it("F10 inventory: lists objects and staging with their keys; removes only staging files", async () => {
      const key = randomUUID();
      const staged = await storage.stage(key, Readable.from([Buffer.from("x".repeat(10))]));
      const pending = randomUUID();
      await storage.stage(pending, Readable.from([Buffer.from("yy")]));
      await staged.commit();
      await h.writeForeign("objects", "notas.txt", "z");

      const listed = await storage.list();
      const order = (a: { area: string; key: string | null }, b: { area: string; key: string | null }) =>
        byCode(`${a.area}${a.key}`, `${b.area}${b.key}`);
      expect(listed.map(({ area, key: k, sizeBytes }) => ({ area, key: k, sizeBytes })).sort(order)).toEqual(
        [
          { area: "objects", key, sizeBytes: 10 },
          { area: "objects", key: null, sizeBytes: 1 },
          { area: "staging", key: pending, sizeBytes: 2 },
        ].sort(order),
      );

      const part = listed.find((f) => f.area === "staging")!.name;
      for (const bad of ["notas.txt", "../objects/" + key, key, `${key}.part`])
        await expect(storage.removeStagedFile(bad)).rejects.toThrow("Not a backup staging file");
      await storage.removeStagedFile(part);
      await storage.removeStagedFile(part);
      expect((await storage.list()).filter((f) => f.area === "staging")).toEqual([]);
      expect(await h.entries("staging")).toEqual([]);
      expect((await h.entries("objects")).sort(byCode)).toEqual([key, "notas.txt"].sort(byCode));
    });
  });
}
