import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { BackupObjectMissingError } from "../domain/backup-storage.port";
import { LocalDiskBackupStorage } from "./local-disk-backup-storage";

/** F08-BKP-02 (#38): disk adapter on a real temporary directory. */
describe("LocalDiskBackupStorage", () => {
  let root: string;
  let storage: LocalDiskBackupStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "f08-bkp-02-"));
    storage = new LocalDiskBackupStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const read = async (stream: Readable) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  };

  /** A source that emits some bytes and then fails, like a cut transfer. */
  function failingSource(bytes: Buffer) {
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

  it("a staged object is invisible until committed, then readable under its key", async () => {
    const key = randomUUID();
    const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
    await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
    expect(await readdir(join(root, "staging"))).toHaveLength(1);

    await staged.commit();

    const opened = await storage.open(key);
    expect(opened.sizeBytes).toBe(8);
    expect((await read(opened.stream)).toString()).toBe("respaldo");
    expect(await readdir(join(root, "staging"))).toEqual([]);
    expect(await readdir(join(root, "objects"))).toEqual([key]);
  });

  it("discard leaves nothing behind", async () => {
    const key = randomUUID();
    const staged = await storage.stage(key, Readable.from([Buffer.from("x")]));
    await staged.discard();
    await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
    expect(await readdir(join(root, "staging"))).toEqual([]);
    expect(await readdir(join(root, "objects"))).toEqual([]);
  });

  it("a source that fails mid-transfer leaves no partial file and keeps the previous object", async () => {
    const previous = randomUUID();
    await (await storage.stage(previous, Readable.from([Buffer.from("válida")]))).commit();

    await expect(
      storage.stage(randomUUID(), failingSource(Buffer.alloc(4096, 1))),
    ).rejects.toThrow("transfer cut");

    expect(await readdir(join(root, "staging"))).toEqual([]);
    expect(await readdir(join(root, "objects"))).toEqual([previous]);
    expect((await read((await storage.open(previous)).stream)).toString()).toBe("válida");
  });

  it("only server-generated UUID keys are accepted, never paths", async () => {
    for (const key of ["../escape", "a/b", "C:\\x", "", "not-a-uuid"]) {
      await expect(storage.stage(key, Readable.from([Buffer.from("x")]))).rejects.toThrow(
        "Invalid backup storage key",
      );
      await expect(storage.open(key)).rejects.toThrow("Invalid backup storage key");
      await expect(storage.remove(key)).rejects.toThrow("Invalid backup storage key");
    }
    expect(await readdir(root)).toEqual([]);
  });

  it("remove is idempotent and discardStaged clears an abandoned upload", async () => {
    const key = randomUUID();
    await (await storage.stage(key, Readable.from([Buffer.from("x")]))).commit();
    await storage.remove(key);
    await storage.remove(key);
    await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);

    const abandoned = randomUUID();
    await storage.stage(abandoned, Readable.from([Buffer.from("y")]));
    await writeFile(join(root, "staging", `${randomUUID()}.keep.part`), "other");
    await storage.discardStaged(abandoned);
    const left = await readdir(join(root, "staging"));
    expect(left).toHaveLength(1);
    expect(left[0]).not.toContain(abandoned);
    expect(await readFile(join(root, "staging", left[0]), "utf8")).toBe("other");
  });

  it("a committed object cannot be committed twice", async () => {
    const staged = await storage.stage(randomUUID(), Readable.from([Buffer.from("x")]));
    await staged.commit();
    await expect(staged.commit()).rejects.toThrow("already settled");
  });
});
