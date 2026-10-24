import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { BackupObjectMissingError } from "../domain/backup-storage.port";
import { cleanupBackupLeftovers, inventoryBackups, MIN_CLEANUP_AGE_MINUTES } from "../application/backup-inventory";
import { BackupTooLargeError, BackupTransferIncompleteError, Sha256Meter } from "../application/sha256-meter";
import {
  backupStorageContract,
  byCode,
  failingSource,
  readAll,
} from "../test-support/backup-storage.contract";
import { hang, InMemoryS3, MIN_PART_BYTES, s3Error } from "../test-support/in-memory-s3";
import {
  S3_LIMITS,
  S3_PART_BYTES,
  S3BackupStorage,
  S3Limits,
  S3StagingCleanupReport,
} from "./s3-backup-storage";

/**
 * F08-BKP-07: the S3 adapter over the «doble S3 en memoria». The double is
 * not Backblaze B2: these tests prove the adapter's logic against the S3 API
 * semantics it relies on, not the real provider.
 */
const BUCKET = "agro-test-bucket";
const PREFIX = "ensayo-f08/";

function setup(limits: S3Limits = S3_LIMITS) {
  const s3 = new InMemoryS3(BUCKET);
  const storage = new S3BackupStorage(s3, { bucket: BUCKET, prefix: PREFIX }, limits);
  return { s3, storage };
}

/** Local name of every version, marker and upload of an area. */
function entriesOf(s3: InMemoryS3, area: "objects" | "staging"): string[] {
  const base = `${PREFIX}${area}/`;
  const names: string[] = [];
  for (const name of s3.names(base))
    for (const _ of s3.versionsOf(name)) names.push(name.slice(base.length));
  for (const upload of s3.uploads.values())
    if (upload.key.startsWith(base)) names.push(upload.key.slice(base.length));
  return names.sort(byCode);
}

backupStorageContract("S3BackupStorage over the in-memory S3 double", async () => {
  const { s3, storage } = setup();
  return {
    storage,
    entries: async (area) => entriesOf(s3, area),
    writeForeign: async (area, name, content) => {
      s3.putDirect(`${PREFIX}${area}/${name}`, Buffer.from(content));
    },
    readForeign: async (area, name) => {
      const versions = s3.versionsOf(`${PREFIX}${area}/${name}`);
      return versions[versions.length - 1].body.toString();
    },
    isEmpty: async () => s3.totalEntries() === 0,
    dispose: async () => undefined,
  };
});

const names = (s3: InMemoryS3, name: string) => s3.sent.filter((c) => c.name === name);

describe("S3BackupStorage (B2 by its S3 API) over the in-memory S3 double", () => {
  it("everything lives under the prefix; the final copy carries its SHA-256 and size", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const bytes = Buffer.from("respaldo sintético");
    await (await storage.stage(key, Readable.from([bytes]))).commit();
    expect(s3.names()).toEqual([`${PREFIX}objects/${key}`]);
    const [version] = s3.versionsOf(`${PREFIX}objects/${key}`);
    expect(version.metadata).toEqual({
      "agro-sha256": createHash("sha256").update(bytes).digest("hex"),
      "agro-size": String(bytes.length),
    });
    for (const command of s3.sent) {
      const name = command.input["Key"] ?? command.input["Prefix"];
      expect(String(name).startsWith(PREFIX)).toBe(true);
    }
    const copy = names(s3, "CopyObjectCommand")[0].input;
    expect(copy["MetadataDirective"]).toBe("REPLACE");
    expect(copy["CopySource"]).toMatch(new RegExp(`^${BUCKET}/${PREFIX}staging/${key}\\.[0-9a-f]{16}\\.part\\?versionId=`));
  });

  it.each([
    ["1 MiB", 1024 * 1024, 0],
    ["exactly 8 MiB", S3_PART_BYTES, 0],
    ["8 MiB + 1 byte", S3_PART_BYTES + 1, 2],
    ["20 MiB", 20 * 1024 * 1024, 3],
  ])("%s: one PutObject up to 8 MiB, multipart of 8 MiB parts above", async (_, size, parts) => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const bytes = randomBytes(size);
    // Uneven chunks, as an HTTP body arrives.
    const chunks: Buffer[] = [];
    for (let at = 0; at < size; at += 700_001) chunks.push(bytes.subarray(at, at + 700_001));
    await (await storage.stage(key, Readable.from(chunks))).commit();
    expect(names(s3, "PutObjectCommand")).toHaveLength(parts === 0 ? 1 : 0);
    const uploaded = names(s3, "UploadPartCommand").map((c) => (c.input["Body"] as Buffer).length);
    if (parts === 0) expect(uploaded).toEqual([]);
    else {
      expect(uploaded).toHaveLength(parts);
      for (const length of uploaded.slice(0, -1)) expect(length).toBe(S3_PART_BYTES);
      expect(S3_PART_BYTES).toBeGreaterThanOrEqual(MIN_PART_BYTES);
    }
    for (const c of [...names(s3, "PutObjectCommand"), ...names(s3, "UploadPartCommand")])
      expect(c.input["ContentMD5"]).toBe(
        createHash("md5").update(c.input["Body"] as Buffer).digest("base64"),
      );
    const opened = await storage.open(key);
    expect(opened.sizeBytes).toBe(size);
    expect((await readAll(opened.stream)).equals(bytes)).toBe(true);
    expect(s3.uploads.size).toBe(0);
  });

  it("the double rejects, like S3, a non-final part under 5 000 000 bytes and a one-part multipart", async () => {
    const s3 = new InMemoryS3(BUCKET);
    const signal = new AbortController().signal;
    const { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } =
      await import("@aws-sdk/client-s3");
    const md5 = (b: Buffer) => createHash("md5").update(b).digest("base64");
    const part = async (uploadId: string, n: number, body: Buffer) =>
      s3.send(
        new UploadPartCommand({ Bucket: BUCKET, Key: "k", UploadId: uploadId, PartNumber: n, Body: body, ContentLength: body.length, ContentMD5: md5(body) }),
        { abortSignal: signal },
      );
    const complete = (uploadId: string, n: number) =>
      s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: BUCKET,
          Key: "k",
          UploadId: uploadId,
          MultipartUpload: { Parts: Array.from({ length: n }, (_, i) => ({ PartNumber: i + 1 })) },
        }),
        { abortSignal: signal },
      );
    const a = ((await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: "k" }), { abortSignal: signal })) as { UploadId: string }).UploadId;
    await part(a, 1, Buffer.alloc(MIN_PART_BYTES - 1));
    await part(a, 2, Buffer.alloc(10));
    await expect(complete(a, 2)).rejects.toMatchObject({ name: "EntityTooSmall" });
    const b = ((await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: "k" }), { abortSignal: signal })) as { UploadId: string }).UploadId;
    await part(b, 1, Buffer.alloc(10));
    await expect(complete(b, 1)).rejects.toMatchObject({ name: "EntityTooSmall" });
  });

  it("413 of the meter in the middle of a part: the original error, the multipart aborted, nothing left", async () => {
    const { s3, storage } = setup();
    const meter = new Sha256Meter(S3_PART_BYTES + 3 * 1024 * 1024);
    Readable.from([randomBytes(S3_PART_BYTES + 1024 * 1024), randomBytes(4 * 1024 * 1024)]).pipe(meter);
    await expect(storage.stage(randomUUID(), meter)).rejects.toBeInstanceOf(BackupTooLargeError);
    expect(s3.totalEntries()).toBe(0);
  });

  it("a source cut while a part is uploading aborts that request: stage only settles when nothing is in flight", async () => {
    const { s3, storage } = setup();
    let inFlight = 0;
    s3.before = async (command, signal) => {
      if (command.name !== "UploadPartCommand") return;
      inFlight++;
      try {
        await hang(signal);
      } finally {
        inFlight--;
      }
    };
    const source = new Readable({ read() {} });
    source.push(randomBytes(S3_PART_BYTES + 10));
    const staging = storage.stage(randomUUID(), source);
    await new Promise((r) => setTimeout(r, 20));
    expect(inFlight).toBe(1);
    source.destroy(new Error("transfer cut"));
    await expect(staging).rejects.toThrow("transfer cut");
    expect(inFlight).toBe(0);
    expect(s3.totalEntries()).toBe(0);
  });

  it("BadDigest from the provider: stage fails and nothing is visible", async () => {
    const { s3, storage } = setup();
    s3.before = (command) => {
      if (command.name === "PutObjectCommand") throw s3Error("BadDigest", 400);
    };
    const key = randomUUID();
    await expect(storage.stage(key, Readable.from([Buffer.from("x")]))).rejects.toMatchObject({ name: "BadDigest" });
    await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
    expect(s3.totalEntries()).toBe(0);
  });

  it("ambiguous commit: a timeout after the copy is resolved by the head and the commit holds", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
    s3.after = (command) => {
      if (command.name === "CopyObjectCommand") throw s3Error("TimeoutError", 0);
    };
    await staged.commit();
    expect((await readAll((await storage.open(key)).stream)).toString()).toBe("respaldo");
    expect(entriesOf(s3, "objects")).toEqual([key]);
    expect(entriesOf(s3, "staging")).toEqual([]);
  });

  it("a copy that did not happen: commit fails and leaves nothing", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
    s3.before = (command) => {
      if (command.name === "CopyObjectCommand") throw s3Error("InternalError", 500);
    };
    await expect(staged.commit()).rejects.toMatchObject({ name: "InternalError" });
    await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
    expect(s3.totalEntries()).toBe(0);
  });

  it("a retried copy that left two identical versions: commit ends with exactly one", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
    s3.after = (command) => {
      if (command.name !== "CopyObjectCommand") return;
      // The SDK's retry of a copy that had in fact succeeded.
      const final = command.input["Key"] as string;
      const [first] = s3.versionsOf(final);
      s3.putDirect(final, first.body, first.metadata);
      s3.after = undefined;
    };
    await staged.commit();
    expect(s3.versionsOf(`${PREFIX}objects/${key}`)).toHaveLength(1);
    expect((await readAll((await storage.open(key)).stream)).toString()).toBe("respaldo");
  });

  it("commit refuses an existing final object and never overwrites it", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    s3.putDirect(`${PREFIX}objects/${key}`, Buffer.from("ya estaba"));
    const staged = await storage.stage(key, Readable.from([Buffer.from("nueva")]));
    await expect(staged.commit()).rejects.toThrow("S3_OBJECT_ALREADY_EXISTS");
    expect(names(s3, "CopyObjectCommand")).toHaveLength(0);
    expect(s3.versionsOf(`${PREFIX}objects/${key}`).map((v) => v.body.toString())).toEqual(["ya estaba"]);
    expect(entriesOf(s3, "staging")).toEqual([]);
  });

  it("commit whose staging purge fails throws (R-c) and leaves no visible copy", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
    let deletes = 0;
    s3.before = (command) => {
      if (command.name === "DeleteObjectCommand" && String(command.input["Key"]).includes("/staging/") && deletes++ === 0)
        throw s3Error("ServiceUnavailable", 503);
    };
    await expect(staged.commit()).rejects.toMatchObject({ name: "ServiceUnavailable" });
    await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
    // The service then calls discardStaged and remove, which check.
    s3.before = undefined;
    await storage.discardStaged(key);
    await storage.remove(key);
    expect(s3.totalEntries()).toBe(0);
  });

  it("remove deletes every version and marker of its exact name only, never without a version id", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const neighbour = randomUUID();
    await (await storage.stage(key, Readable.from([Buffer.from("a")]))).commit();
    await (await storage.stage(neighbour, Readable.from([Buffer.from("b")]))).commit();
    const name = `${PREFIX}objects/${key}`;
    s3.putDirect(name, Buffer.from("otra versión"));
    s3.hideDirect(name);
    s3.putDirect(`${name}-x`, Buffer.from("comparte prefijo"));
    s3.pageSize = 2; // several pages
    await storage.remove(key);
    await storage.remove(key);
    expect(s3.versionsOf(name)).toEqual([]);
    expect(s3.versionsOf(`${PREFIX}objects/${neighbour}`)).toHaveLength(1);
    expect(s3.versionsOf(`${name}-x`)).toHaveLength(1);
    expect(names(s3, "DeleteObjectCommand").every((c) => typeof c.input["VersionId"] === "string")).toBe(true);
    expect(names(s3, "ListObjectVersionsCommand").some((c) => c.input["KeyMarker"] !== undefined)).toBe(true);
  });

  it("remove whose final listing still sees a version throws", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    await (await storage.stage(key, Readable.from([Buffer.from("a")]))).commit();
    const name = `${PREFIX}objects/${key}`;
    s3.before = (command) => {
      // A provider that answers 204 but keeps the bytes.
      if (command.name === "DeleteObjectCommand") throw Object.assign(new Error("ignored"), { swallow: true });
    };
    const original = s3.send.bind(s3);
    s3.send = async (command, options) => {
      try {
        return await original(command, options);
      } catch (error) {
        if ((error as { swallow?: boolean }).swallow) return {};
        throw error;
      }
    };
    await expect(storage.remove(key)).rejects.toThrow("S3_VERSIONS_REMAIN");
    expect(s3.versionsOf(name)).toHaveLength(1);
  });

  it("discardStaged aborts an open multipart upload of its key and purges its staging", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    const source = new Readable({ read() {} });
    s3.before = async (command, signal) => {
      // The process dies after the first part: the multipart stays open.
      if (command.name === "UploadPartCommand" && command.input["PartNumber"] === 2) await hang(signal);
    };
    source.push(randomBytes(2 * S3_PART_BYTES + 10));
    const staging = storage.stage(key, source).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    expect(s3.uploads.size).toBe(1);
    const otherUpload = randomUUID();
    s3.uploads.set(otherUpload, { key: `${PREFIX}staging/${randomUUID()}.0123456789abcdef.part`, parts: new Map(), initiated: new Date() });
    s3.before = undefined;
    await storage.discardStaged(key);
    expect([...s3.uploads.keys()]).toEqual([otherUpload]);
    source.destroy(new Error("cut"));
    await staging;
  });

  it("list reports hidden versions, markers and unfinished uploads, one entry each", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    await (await storage.stage(key, Readable.from([Buffer.from("abc")]))).commit();
    const name = `${PREFIX}objects/${key}`;
    const hidden = s3.versionsOf(name)[0].versionId;
    s3.putDirect(name, Buffer.from("abcd"));
    const gone = randomUUID();
    s3.putDirect(`${PREFIX}objects/${gone}`, Buffer.from("zz"));
    s3.hideDirect(`${PREFIX}objects/${gone}`);
    const uploadKey = `${PREFIX}staging/${randomUUID()}.0123456789abcdef.part`;
    s3.uploads.set("u1", { key: uploadKey, parts: new Map([[1, Buffer.alloc(7)], [2, Buffer.alloc(5)]]), initiated: new Date() });

    const listed = await storage.list();
    const pick = (f: (typeof listed)[number]) => ({
      area: f.area,
      key: f.key,
      sizeBytes: f.sizeBytes,
      hidden: f.hidden,
      deleteMarker: f.deleteMarker,
      incompleteUpload: f.incompleteUpload,
    });
    expect(listed.filter((f) => f.key === key).map(pick)).toEqual(
      expect.arrayContaining([
        { area: "objects", key, sizeBytes: 4, hidden: false, deleteMarker: false, incompleteUpload: undefined },
        { area: "objects", key, sizeBytes: 3, hidden: true, deleteMarker: false, incompleteUpload: undefined },
      ]),
    );
    expect(listed.find((f) => f.versionId === hidden)?.hidden).toBe(true);
    expect(
      listed
        .filter((f) => f.key === gone)
        .map((f) => `${f.hidden}/${f.deleteMarker}`)
        .sort(byCode),
    ).toEqual(["true/false", "true/true"]);
    expect(listed.filter((f) => f.incompleteUpload).map(pick)).toEqual([
      { area: "staging", key: uploadKey.slice(`${PREFIX}staging/`.length, -".0123456789abcdef.part".length), sizeBytes: 12, hidden: undefined, deleteMarker: undefined, incompleteUpload: true },
    ]);
  });

  it("open of an absent or hidden key is BackupObjectMissingError", async () => {
    const { s3, storage } = setup();
    await expect(storage.open(randomUUID())).rejects.toBeInstanceOf(BackupObjectMissingError);
    const key = randomUUID();
    await (await storage.stage(key, Readable.from([Buffer.from("a")]))).commit();
    s3.hideDirect(`${PREFIX}objects/${key}`);
    await expect(storage.open(key)).rejects.toBeInstanceOf(BackupObjectMissingError);
  });

  it("a provider that denies (403) fails stage, open and remove with its own error, never as success or missing", async () => {
    const { s3, storage } = setup();
    const key = randomUUID();
    await (await storage.stage(key, Readable.from([Buffer.from("a")]))).commit();
    s3.before = () => {
      throw s3Error("AccessDenied", 403);
    };
    await expect(storage.stage(randomUUID(), Readable.from([Buffer.from("b")]))).rejects.toMatchObject({ name: "AccessDenied" });
    await expect(storage.open(key)).rejects.toMatchObject({ name: "AccessDenied" });
    await expect(storage.remove(key)).rejects.toMatchObject({ name: "AccessDenied" });
    await expect(storage.discardStaged(key)).rejects.toMatchObject({ name: "AccessDenied" });
    s3.before = undefined;
    expect((await readAll((await storage.open(key)).stream)).toString()).toBe("a");
  });

  it("a hung call is aborted within its budget (commit, remove, open)", async () => {
    const limits: S3Limits = { ...S3_LIMITS, callMs: 40, commitMs: 120, purgeMs: 80, openMs: 40 };
    const { s3, storage } = setup(limits);
    const key = randomUUID();
    const staged = await storage.stage(key, Readable.from([Buffer.from("a")]));
    s3.before = async (command, signal) => {
      if (command.name !== "PutObjectCommand") await hang(signal);
    };
    const timed = async (run: () => Promise<unknown>) => {
      const started = Date.now();
      await expect(run()).rejects.toThrow("S3_DEADLINE_EXCEEDED");
      return Date.now() - started;
    };
    expect(await timed(() => staged.commit())).toBeLessThan(1000);
    expect(await timed(() => storage.remove(key))).toBeLessThan(1000);
    expect(await timed(() => storage.open(key))).toBeLessThan(1000);
    expect(await timed(() => storage.discardStaged(key))).toBeLessThan(1000);
  });

  it("an empty body is staged and can be discarded (the service rejects it as EMPTY)", async () => {
    const { s3, storage } = setup();
    const staged = await storage.stage(randomUUID(), Readable.from([]));
    await staged.discard();
    expect(s3.totalEntries()).toBe(0);
  });

  it("a cut source of a previous key never touches another copy", async () => {
    const { s3, storage } = setup();
    const previous = randomUUID();
    await (await storage.stage(previous, Readable.from([Buffer.from("válida")]))).commit();
    await expect(storage.stage(randomUUID(), failingSource(randomBytes(S3_PART_BYTES + 5)))).rejects.toThrow("transfer cut");
    expect(entriesOf(s3, "objects")).toEqual([previous]);
    expect(s3.uploads.size).toBe(0);
  });
});

/** Rewrites the provider's answer to every call of one command. */
function rewrite(
  s3: InMemoryS3,
  command: string,
  change: (out: Record<string, unknown>, input: Record<string, unknown>) => unknown,
) {
  const original = s3.send.bind(s3);
  s3.send = async (sent, options) => {
    const out = await original(sent, options);
    if (sent.constructor.name !== command) return out;
    return change(out as Record<string, unknown>, (sent as { input: Record<string, unknown> }).input);
  };
}

type Listed = { Key?: string; VersionId?: string; IsLatest?: boolean; LastModified?: Date };

/** Names under `objects/` with old versions, a marker on top and a version over a marker. */
function versionedState(s3: InMemoryS3) {
  const at = (key: string) => `${PREFIX}objects/${key}`;
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
  for (const body of ["a1", "a22", "a333"]) s3.putDirect(at(a), Buffer.from(body));
  s3.putDirect(at(b), Buffer.from("b1"));
  s3.hideDirect(at(b));
  s3.putDirect(at(c), Buffer.from("c1"));
  s3.hideDirect(at(c));
  s3.putDirect(at(c), Buffer.from("c22"));
  return { a, b, c };
}

/** What the double holds under `objects/`: only the last entry of a name, if not a marker, is visible. */
function truthOf(s3: InMemoryS3) {
  const base = `${PREFIX}objects/`;
  return s3
    .names(base)
    .flatMap((name) => {
      const versions = s3.versionsOf(name);
      const current = versions[versions.length - 1];
      return versions.map((v) => ({
        name: name.slice(base.length),
        versionId: v.versionId,
        deleteMarker: v.deleteMarker,
        hidden: v.deleteMarker || v !== current,
      }));
    })
    .sort((x, y) => byCode(x.versionId, y.versionId));
}

describe("#151: what B2 answered with the trial's restricted keys, imitated by the double (regressions)", () => {
  function b2(pageSize = 1000, limits: S3Limits = S3_LIMITS) {
    const t = setup(limits);
    t.s3.quirks = { missingAs403: true, latestPerPage: true };
    t.s3.pageSize = pageSize;
    return t;
  }

  describe("H1: HeadObject of an absent name answers 403, not 404", () => {
    it("the commit decides existence by listing the exact name: the copy becomes available, and no HEAD precedes the copy", async () => {
      const { s3, storage } = b2(2);
      const key = randomUUID();
      await (await storage.stage(key, Readable.from([Buffer.from("respaldo")]))).commit();
      expect((await readAll((await storage.open(key)).stream)).toString()).toBe("respaldo");
      expect(entriesOf(s3, "objects")).toEqual([key]);
      expect(entriesOf(s3, "staging")).toEqual([]);
      const order = s3.sent.map((c) => c.name);
      expect(order.indexOf("HeadObjectCommand")).toBeGreaterThan(order.indexOf("CopyObjectCommand"));
      const final = `${PREFIX}objects/${key}`;
      const check = s3.sent.findIndex((c) => c.name === "ListObjectVersionsCommand" && c.input["Prefix"] === final);
      expect(check).toBeGreaterThan(-1);
      expect(check).toBeLessThan(order.indexOf("CopyObjectCommand"));
    });

    it.each([false, true])(
      "any version or marker of the exact final name counts as existing (403 quirk: %s): nothing is copied and the third party's versions stay",
      async (quirk) => {
        const { s3, storage } = setup();
        s3.quirks.missingAs403 = quirk;
        const key = randomUUID();
        const final = `${PREFIX}objects/${key}`;
        s3.putDirect(final, Buffer.from("de un tercero"));
        s3.hideDirect(final);
        const staged = await storage.stage(key, Readable.from([Buffer.from("nueva")]));
        await expect(staged.commit()).rejects.toThrow("S3_OBJECT_ALREADY_EXISTS");
        expect(names(s3, "CopyObjectCommand")).toHaveLength(0);
        expect(s3.versionsOf(final).map((v) => `${v.deleteMarker}/${v.body.toString()}`)).toEqual([
          "false/de un tercero",
          "true/",
        ]);
        expect(entriesOf(s3, "staging")).toEqual([]);
      },
    );

    it("a name that only shares the prefix of the final name proves nothing: the commit goes on and leaves it alone", async () => {
      const { s3, storage } = b2(1);
      const key = randomUUID();
      const final = `${PREFIX}objects/${key}`;
      s3.putDirect(`${final}-x`, Buffer.from("comparte prefijo"));
      s3.putDirect(`${final}0`, Buffer.from("también"));
      await (await storage.stage(key, Readable.from([Buffer.from("respaldo")]))).commit();
      expect(s3.versionsOf(final)).toHaveLength(1);
      expect(s3.versionsOf(`${final}-x`)).toHaveLength(1);
      expect(s3.versionsOf(`${final}0`)).toHaveLength(1);
    });

    const failures: [string, (s3: InMemoryS3, final: string) => void, RegExp | { name: string }][] = [
      [
        "403 on the listing",
        (s3, final) => {
          s3.before = (c) => {
            if (c.name === "ListObjectVersionsCommand" && c.input["Prefix"] === final) throw s3Error("AccessDenied", 403);
          };
        },
        { name: "AccessDenied" },
      ],
      [
        "page with an entry without a name",
        (s3, final) =>
          rewrite(s3, "ListObjectVersionsCommand", (out, input) =>
            input["Prefix"] === final ? { ...out, Versions: [{ VersionId: "v", IsLatest: true, LastModified: new Date(), Size: 1 }] } : out,
          ),
        /S3_LISTING_/,
      ],
      [
        "page with an entry outside the listed prefix",
        (s3, final) =>
          rewrite(s3, "ListObjectVersionsCommand", (out, input) =>
            input["Prefix"] === final
              ? { ...out, Versions: [{ Key: `${PREFIX}objects/otro`, VersionId: "v", IsLatest: true, LastModified: new Date(), Size: 1 }] }
              : out,
          ),
        /S3_LISTING_/,
      ],
      [
        "truncated page without markers",
        (s3, final) =>
          rewrite(s3, "ListObjectVersionsCommand", (out, input) =>
            input["Prefix"] === final ? { ...out, IsTruncated: true, NextKeyMarker: undefined, NextVersionIdMarker: undefined } : out,
          ),
        /S3_/,
      ],
      [
        "page without IsTruncated",
        (s3, final) =>
          rewrite(s3, "ListObjectVersionsCommand", (out, input) =>
            input["Prefix"] === final ? { ...out, IsTruncated: undefined } : out,
          ),
        /S3_LISTING_/,
      ],
      [
        "answer that is not a listing",
        (s3, final) => rewrite(s3, "ListObjectVersionsCommand", (out, input) => (input["Prefix"] === final ? null : out)),
        /S3_LISTING_/,
      ],
    ];
    it.each(failures)(
      "%s while checking the final name fails closed: never 'absent', nothing copied, staging purged",
      async (_, arrange, expected) => {
        const { s3, storage } = b2();
        const key = randomUUID();
        const final = `${PREFIX}objects/${key}`;
        const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
        arrange(s3, final);
        const commit = expect(staged.commit()).rejects;
        if (expected instanceof RegExp) await commit.toThrow(expected);
        else await commit.toMatchObject(expected);
        expect(names(s3, "CopyObjectCommand")).toHaveLength(0);
        s3.before = undefined;
        expect(s3.versionsOf(final)).toEqual([]);
        expect(entriesOf(s3, "staging")).toEqual([]);
      },
    );

    it("a listing of the final name cut by the page limit fails closed, nothing copied", async () => {
      const { s3, storage } = b2(1, { ...S3_LIMITS, listPages: 1 } as S3Limits);
      const key = randomUUID();
      const final = `${PREFIX}objects/${key}`;
      s3.putDirect(`${final}-a`, Buffer.from("a"));
      s3.putDirect(`${final}-b`, Buffer.from("b"));
      const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
      await expect(staged.commit()).rejects.toThrow("S3_LISTING_INCOMPLETE");
      expect(names(s3, "CopyObjectCommand")).toHaveLength(0);
      expect(s3.versionsOf(final)).toEqual([]);
    });

    it("a copy that did not happen reports the copy's error, not the 403 of the head after it", async () => {
      const { s3, storage } = b2();
      const key = randomUUID();
      const staged = await storage.stage(key, Readable.from([Buffer.from("respaldo")]));
      s3.before = (c) => {
        if (c.name === "CopyObjectCommand") throw s3Error("InternalError", 500);
      };
      await expect(staged.commit()).rejects.toMatchObject({ name: "InternalError" });
      expect(s3.totalEntries()).toBe(0);
    });

    it("open after a 403: absent or hidden by the listing of the exact name is BackupObjectMissingError", async () => {
      const { s3, storage } = b2(1);
      const absent = randomUUID();
      s3.putDirect(`${PREFIX}objects/${absent}-x`, Buffer.from("comparte prefijo"));
      await expect(storage.open(absent)).rejects.toBeInstanceOf(BackupObjectMissingError);
      const hidden = randomUUID();
      s3.putDirect(`${PREFIX}objects/${hidden}`, Buffer.from("antes"));
      s3.hideDirect(`${PREFIX}objects/${hidden}`);
      await expect(storage.open(hidden)).rejects.toBeInstanceOf(BackupObjectMissingError);
    });

    it("open after a 403: a denied or invalid listing, or a current version that cannot be read, keeps the 403", async () => {
      const { s3, storage } = b2();
      const absent = randomUUID();
      s3.before = (c) => {
        if (c.name === "ListObjectVersionsCommand") throw s3Error("AccessDenied", 403);
      };
      await expect(storage.open(absent)).rejects.toMatchObject({ name: "AccessDenied" });
      s3.before = undefined;
      rewrite(s3, "ListObjectVersionsCommand", (out) => ({ ...out, IsTruncated: undefined }));
      await expect(storage.open(absent)).rejects.toMatchObject({ name: "AccessDenied" });
      const { s3: other, storage: denied } = b2();
      const present = randomUUID();
      other.putDirect(`${PREFIX}objects/${present}`, Buffer.from("existe"));
      other.before = (c) => {
        if (c.name === "GetObjectCommand") throw s3Error("AccessDenied", 403);
      };
      await expect(denied.open(present)).rejects.toMatchObject({ name: "AccessDenied" });
    });
  });

  describe("multipart listings are checked like the version listings (fail closed)", () => {
    const stagingName = () => `${PREFIX}staging/${randomUUID()}.0123456789abcdef.part`;
    const upload = (s3: InMemoryS3, key = stagingName()) => {
      s3.uploads.set(randomUUID(), { key, parts: new Map([[1, Buffer.alloc(7)]]), initiated: new Date(Date.UTC(2026, 0, 1)) });
      return key;
    };
    type Upload = { Key?: string; UploadId?: string; Initiated?: Date };
    const uploadsOf = (out: Record<string, unknown>) => (out["Uploads"] as Upload[] | undefined) ?? [];

    it("an upload without Initiated is never dated 1970: the F10 cleanup aborts nothing and fails", async () => {
      const { s3, storage } = setup();
      upload(s3);
      rewrite(s3, "ListMultipartUploadsCommand", (out) => ({
        ...out,
        Uploads: uploadsOf(out).map(({ Initiated: _, ...u }) => u),
      }));
      const prisma = {
        backupMetadata: { findMany: async () => [], findUnique: async () => null },
      } as unknown as Parameters<typeof cleanupBackupLeftovers>[0];
      await expect(
        cleanupBackupLeftovers(prisma, storage, { olderThanMinutes: MIN_CLEANUP_AGE_MINUTES, apply: true }),
      ).rejects.toThrow("S3_LISTING_INVALID");
      expect(names(s3, "AbortMultipartUploadCommand")).toHaveLength(0);
      expect(s3.uploads.size).toBe(1);
    });

    const invalid: [string, (out: Record<string, unknown>) => unknown][] = [
      ["an entry without UploadId", (out) => ({ ...out, Uploads: uploadsOf(out).map(({ UploadId: _, ...u }) => u) })],
      ["an entry without Key", (out) => ({ ...out, Uploads: uploadsOf(out).map(({ Key: _, ...u }) => u) })],
      ["an entry outside the listed prefix", (out) => ({ ...out, Uploads: [...uploadsOf(out), { Key: "otro/x", UploadId: "u", Initiated: new Date() }] })],
      ["an invalid Initiated", (out) => ({ ...out, Uploads: uploadsOf(out).map((u) => ({ ...u, Initiated: new Date(Number.NaN) })) })],
      ["a page without IsTruncated", (out) => ({ ...out, IsTruncated: undefined })],
    ];
    it.each(invalid)("%s makes discardStaged and list() fail, never skipped", async (_, change) => {
      const { s3, storage } = setup();
      const key = randomUUID();
      upload(s3, `${PREFIX}staging/${key}.0123456789abcdef.part`);
      rewrite(s3, "ListMultipartUploadsCommand", change);
      await expect(storage.discardStaged(key)).rejects.toThrow("S3_LISTING_INVALID");
      await expect(storage.list()).rejects.toThrow("S3_LISTING_INVALID");
      expect(s3.uploads.size).toBe(1);
    });

    it("a repeated upload, or markers that do not advance, fail closed", async () => {
      const { s3, storage } = setup();
      upload(s3);
      rewrite(s3, "ListMultipartUploadsCommand", (out) => ({ ...out, Uploads: [...uploadsOf(out), ...uploadsOf(out)] }));
      await expect(storage.list()).rejects.toThrow("S3_LISTING_INCONSISTENT");
      const again = setup();
      upload(again.s3);
      rewrite(again.s3, "ListMultipartUploadsCommand", (out, input) => ({
        ...out,
        IsTruncated: true,
        NextKeyMarker: input["KeyMarker"] ?? "k",
        NextUploadIdMarker: input["UploadIdMarker"] ?? "u",
      }));
      await expect(again.storage.list()).rejects.toThrow("S3_PAGINATION_STALLED");
    });

    it("ListParts: the page limit, a stalled marker or a part without size fail closed, never an undercount", async () => {
      const endless = setup({ ...S3_LIMITS, listPages: 3 });
      upload(endless.s3);
      let n = 0;
      rewrite(endless.s3, "ListPartsCommand", (out) => ({ ...out, IsTruncated: true, NextPartNumberMarker: String(++n) }));
      await expect(endless.storage.list()).rejects.toThrow("S3_LISTING_INCOMPLETE");
      const stalled = setup();
      upload(stalled.s3);
      rewrite(stalled.s3, "ListPartsCommand", (out, input) => ({ ...out, IsTruncated: true, NextPartNumberMarker: input["PartNumberMarker"] ?? "1" }));
      await expect(stalled.storage.list()).rejects.toThrow("S3_PAGINATION_STALLED");
      const sizeless = setup();
      upload(sizeless.s3);
      rewrite(sizeless.s3, "ListPartsCommand", (out) => ({
        ...out,
        Parts: ((out["Parts"] as { PartNumber?: number }[]) ?? []).map((p) => ({ PartNumber: p.PartNumber })),
      }));
      await expect(sizeless.storage.list()).rejects.toThrow("S3_LISTING_INVALID");
    });
  });

  describe("H2: IsLatest flagged on the first entry of each name in every page", () => {
    it.each([1, 2, 3, 4, 1000])(
      "pages of %i: list() gives the same logical result, one visible version per name at most, no duplicates, no old version visible",
      async (pageSize) => {
        const { s3, storage } = b2(pageSize);
        versionedState(s3);
        const listed = (await storage.list())
          .filter((f) => f.area === "objects")
          .map((f) => ({ name: f.name, versionId: f.versionId, deleteMarker: f.deleteMarker, hidden: f.hidden }))
          .sort((x, y) => byCode(x.versionId!, y.versionId!));
        expect(listed).toEqual(truthOf(s3));
        expect(new Set(listed.map((f) => f.versionId)).size).toBe(listed.length);
      },
    );

    it.each([1, 2, 1000])("pages of %i: the F10 inventory matches rows against current versions only", async (pageSize) => {
      const { s3, storage } = b2(pageSize);
      const { a, c } = versionedState(s3);
      const prisma = {
        backupMetadata: {
          findMany: async () => [
            { storageKey: a, status: "AVAILABLE", sizeBytes: 4n },
            { storageKey: c, status: "AVAILABLE", sizeBytes: 3n },
          ],
        },
      } as unknown as Parameters<typeof inventoryBackups>[0];
      const { summary } = await inventoryBackups(prisma, storage);
      expect(summary.availableOk.count).toBe(2);
      expect(summary.availableSizeMismatch.count).toBe(0);
      expect(summary.unreferencedObject.count).toBe(0);
      expect(summary.hiddenVersion.count).toBe(6);
    });

    it("purge does not rely on IsLatest: a commit holds with a provider that flags none, and list() then fails closed", async () => {
      const { s3, storage } = setup();
      const strip = (entries: unknown) => ((entries as Listed[] | undefined) ?? []).map(({ IsLatest: _, ...e }) => e);
      rewrite(s3, "ListObjectVersionsCommand", (out) => ({ ...out, Versions: strip(out["Versions"]), DeleteMarkers: strip(out["DeleteMarkers"]) }));
      const key = randomUUID();
      await (await storage.stage(key, Readable.from([Buffer.from("respaldo")]))).commit();
      expect(s3.versionsOf(`${PREFIX}objects/${key}`)).toHaveLength(1);
      await expect(storage.list()).rejects.toThrow("S3_LISTING_INCONSISTENT");
    });

    const contradictions: [string, (entries: Listed[]) => Listed[]][] = [
      ["every entry flagged", (entries) => entries.map((e) => ({ ...e, IsLatest: true }))],
      [
        "the flag on an older entry",
        (entries) => entries.map((e) => ({ ...e, IsLatest: e.LastModified === entries[entries.length - 1].LastModified })),
      ],
      ["an entry listed twice", (entries) => [...entries, entries[0]]],
    ];
    it.each(contradictions)("a listing with %s fails closed instead of choosing a version", async (_, change) => {
      const { s3, storage } = setup();
      const name = `${PREFIX}objects/${randomUUID()}`;
      for (const body of ["1", "22", "333"]) s3.putDirect(name, Buffer.from(body));
      // Only the listing of objects/ (staging/ is empty) is altered.
      rewrite(s3, "ListObjectVersionsCommand", (out, input) =>
        input["Prefix"] === `${PREFIX}objects/` ? { ...out, Versions: change(out["Versions"] as Listed[]) } : out,
      );
      await expect(storage.list()).rejects.toThrow(/S3_LISTING_INCONSISTENT/);
    });

    it("a listing cut by the page limit is reported as incomplete, never as a complete inventory", async () => {
      const { s3, storage } = b2(1, { ...S3_LIMITS, listPages: 2 } as S3Limits);
      versionedState(s3);
      await expect(storage.list()).rejects.toThrow("S3_LISTING_INCOMPLETE");
      const prisma = { backupMetadata: { findMany: async () => [] } } as unknown as Parameters<typeof inventoryBackups>[0];
      await expect(inventoryBackups(prisma, storage)).rejects.toThrow("S3_LISTING_INCOMPLETE");
    });
  });
});

describe("#151 5b and H3: the cleanup of a failed stage, and its original cause (regressions)", () => {
  function reported(limits: S3Limits = S3_LIMITS) {
    const s3 = new InMemoryS3(BUCKET);
    const reports: S3StagingCleanupReport[] = [];
    const storage = new S3BackupStorage(s3, { bucket: BUCKET, prefix: PREFIX }, limits, (r) => void reports.push(r));
    return { s3, storage, reports };
  }
  /** More than one part, then nothing until the test ends it: the stage waits in the multipart. */
  function openSource() {
    const source = new Readable({ read() {} });
    source.push(randomBytes(S3_PART_BYTES + 10));
    return source;
  }
  const staged = (key: string) => `${PREFIX}staging/${key}.`;
  const uploadNames = (s3: InMemoryS3) => [...s3.uploads.values()].map((u) => u.key).sort(byCode);
  const addUpload = (s3: InMemoryS3, key: string) =>
    s3.uploads.set(randomUUID(), { key, parts: new Map([[1, Buffer.alloc(3)]]), initiated: new Date() });

  describe("5b: a multipart upload created without its UploadId reaching the adapter", () => {
    it("the cut arrives once the provider created it: the upload is found by this attempt's own name and aborted; the other attempt, the other key and the AVAILABLE copy stay", async () => {
      const { s3, storage, reports } = reported();
      const key = randomUUID();
      const previous = randomUUID();
      await (await storage.stage(previous, Readable.from([Buffer.from("válida")]))).commit();
      reports.length = 0;
      const otherAttempt = `${staged(key)}0123456789abcdef.part`;
      const otherKey = `${staged(randomUUID())}fedcba9876543210.part`;
      addUpload(s3, otherAttempt);
      addUpload(s3, otherKey);
      s3.putDirect(otherAttempt, Buffer.from("otro intento"));
      const source = openSource();
      const cut = new Error("corte del origen");
      // The provider takes the CreateMultipartUpload; its answer never arrives.
      s3.after = async (command, signal) => {
        if (command.name !== "CreateMultipartUploadCommand") return;
        source.destroy(cut);
        await hang(signal);
      };
      await expect(storage.stage(key, source)).rejects.toBe(cut);
      expect(uploadNames(s3)).toEqual([otherAttempt, otherKey].sort(byCode));
      expect(s3.names(`${PREFIX}staging/`)).toEqual([otherAttempt]);
      expect(entriesOf(s3, "objects")).toEqual([previous]);
      expect((await readAll((await storage.open(previous)).stream)).toString()).toBe("válida");
      // Listed by the attempt's exact name only, never by the key's prefix.
      for (const c of names(s3, "ListMultipartUploadsCommand"))
        expect(c.input["Prefix"]).toMatch(new RegExp(`^${staged(key)}[0-9a-f]{16}\\.part$`));
      expect(names(s3, "AbortMultipartUploadCommand")).toHaveLength(1);
      expect(reports).toEqual([
        { trigger: "STAGE_FAILED", failure: { origin: "source", name: "Error" }, complete: true, pending: [] },
      ]);
    });

    it("two uploads under this attempt's name (e.g. a retried CreateMultipartUpload): ownership is ambiguous, none is aborted, the cleanup is pending", async () => {
      const { s3, storage, reports } = reported();
      const source = openSource();
      s3.after = async (command, signal) => {
        if (command.name !== "CreateMultipartUploadCommand") return;
        addUpload(s3, command.input["Key"] as string);
        source.destroy(new Error("corte"));
        await hang(signal);
      };
      await expect(storage.stage(randomUUID(), source)).rejects.toThrow("corte");
      expect(s3.uploads.size).toBe(2);
      expect(names(s3, "AbortMultipartUploadCommand")).toHaveLength(0);
      expect(reports).toMatchObject([{ complete: false, pending: ["MULTIPART_OWNERSHIP_AMBIGUOUS"] }]);
    });

    it("the multipart listing fails: the upload is kept and reported pending; the cut is still the error", async () => {
      const { s3, storage, reports } = reported();
      const source = openSource();
      s3.before = (command) => {
        if (command.name === "ListMultipartUploadsCommand") throw s3Error("InternalError", 500);
      };
      s3.after = async (command, signal) => {
        if (command.name !== "CreateMultipartUploadCommand") return;
        source.destroy(new Error("corte"));
        await hang(signal);
      };
      await expect(storage.stage(randomUUID(), source)).rejects.toThrow("corte");
      expect(s3.uploads.size).toBe(1);
      expect(names(s3, "AbortMultipartUploadCommand")).toHaveLength(0);
      expect(reports).toMatchObject([{ complete: false, pending: ["MULTIPART_LISTING_FAILED"] }]);
    });

    it("a CreateMultipartUpload cut before it took effect: nothing to abort, but its creation is not ruled out and is reported", async () => {
      const { s3, storage, reports } = reported();
      const source = openSource();
      s3.before = async (command, signal) => {
        if (command.name !== "CreateMultipartUploadCommand") return;
        source.destroy(new Error("corte"));
        await hang(signal);
      };
      await expect(storage.stage(randomUUID(), source)).rejects.toThrow("corte");
      expect(s3.totalEntries()).toBe(0);
      expect(reports).toMatchObject([{ complete: false, pending: ["MULTIPART_CREATION_UNKNOWN"] }]);
    });

    it("with its UploadId, an abort that fails leaves the upload listed and reported (MULTIPART_REMAINS)", async () => {
      const { s3, storage, reports } = reported();
      const source = openSource();
      s3.before = async (command, signal) => {
        if (command.name === "AbortMultipartUploadCommand") throw s3Error("InternalError", 500);
        if (command.name !== "UploadPartCommand") return;
        source.destroy(new Error("corte"));
        await hang(signal);
      };
      await expect(storage.stage(randomUUID(), source)).rejects.toThrow("corte");
      expect(s3.uploads.size).toBe(1);
      expect(reports).toMatchObject([{ complete: false, pending: ["MULTIPART_REMAINS"] }]);
    });

    describe("a refused CreateMultipartUpload rules the upload out only on its only attempt, and not for 408/429 (note m1 of B)", () => {
      it.each([
        ["400 after an SDK retry (attempts 2)", s3Error("InvalidRequest", 400, 2)],
        ["403 after SDK retries (attempts 3)", s3Error("AccessDenied", 403, 3)],
        ["429 on its only attempt", s3Error("SlowDown", 429, 1)],
      ])("%s, the upload created by an earlier attempt: found by this attempt's name and aborted; complete", async (_, refusal) => {
        const { s3, storage, reports } = reported();
        // The provider created the upload; the answer the adapter gets is the refusal.
        s3.after = (command) => {
          if (command.name === "CreateMultipartUploadCommand") throw refusal;
        };
        await expect(storage.stage(randomUUID(), openSource())).rejects.toBe(refusal);
        expect(s3.uploads.size).toBe(0);
        expect(names(s3, "AbortMultipartUploadCommand")).toHaveLength(1);
        expect(reports).toMatchObject([{ complete: true, pending: [] }]);
      });

      it.each([
        ["408", s3Error("RequestTimeout", 408, 1)],
        ["429", s3Error("SlowDown", 429, 1)],
      ])("%s on its only attempt and nothing listed: the creation is not ruled out, pending", async (_, refusal) => {
        const { s3, storage, reports } = reported();
        s3.before = (command) => {
          if (command.name === "CreateMultipartUploadCommand") throw refusal;
        };
        await expect(storage.stage(randomUUID(), openSource())).rejects.toBe(refusal);
        expect(names(s3, "ListMultipartUploadsCommand")).toHaveLength(1);
        expect(reports).toMatchObject([{ complete: false, pending: ["MULTIPART_CREATION_UNKNOWN"] }]);
      });

      it("403 on its only attempt: it created nothing, nothing is listed, complete", async () => {
        const { s3, storage, reports } = reported();
        const refusal = s3Error("AccessDenied", 403, 1);
        s3.before = (command) => {
          if (command.name === "CreateMultipartUploadCommand") throw refusal;
        };
        await expect(storage.stage(randomUUID(), openSource())).rejects.toBe(refusal);
        expect(names(s3, "ListMultipartUploadsCommand")).toHaveLength(0);
        expect(reports).toMatchObject([{ complete: true, pending: [] }]);
      });
    });

    it("a discarded staging is reported apart, complete once its versions are purged", async () => {
      const { s3, storage, reports } = reported();
      await (await storage.stage(randomUUID(), Readable.from([Buffer.from("x")]))).discard();
      expect(s3.totalEntries()).toBe(0);
      expect(reports).toEqual([{ trigger: "DISCARDED", complete: true, pending: [] }]);
    });
  });

  describe("H3: the provider's error is kept when leaving the stage makes the source fail too", () => {
    // Without I/O the double answers within one run of microtasks, and the
    // source's AbortError (emitted on the next tick) only arrives once the
    // stage has settled: B2 answers over the network, after it.
    const network = () => new Promise<void>((resolve) => setImmediate(resolve));

    it.each(["CreateMultipartUploadCommand", "UploadPartCommand"])(
      "403 on %s: stage throws the 403 (AccessDenied), not the source's AbortError; nothing is left",
      async (refused) => {
        const { s3, storage, reports } = reported();
        s3.before = async (command) => {
          await network();
          if (command.name === refused) throw s3Error("AccessDenied", 403);
        };
        const source = openSource();
        const seen: string[] = [];
        source.on("error", (e) => void seen.push(e.name));
        await expect(storage.stage(randomUUID(), source)).rejects.toMatchObject({
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        });
        // The second error did happen: the source failed after the 403.
        expect(seen).toEqual(["AbortError"]);
        expect(s3.totalEntries()).toBe(0);
        expect(reports).toEqual([
          { trigger: "STAGE_FAILED", failure: { origin: "provider", name: "AccessDenied", status: 403 }, complete: true, pending: [] },
        ]);
        // A refused CreateMultipartUpload created nothing: nothing is looked up.
        if (refused === "CreateMultipartUploadCommand") expect(names(s3, "ListMultipartUploadsCommand")).toHaveLength(0);
      },
    );

    it("a cleanup that fails after the 403 keeps the 403 and reports the cleanup apart", async () => {
      const { s3, storage, reports } = reported();
      s3.before = async (command) => {
        await network();
        if (command.name === "UploadPartCommand") throw s3Error("AccessDenied", 403);
        if (command.name === "AbortMultipartUploadCommand" || command.name === "ListObjectVersionsCommand")
          throw s3Error("InternalError", 500);
      };
      await expect(storage.stage(randomUUID(), openSource())).rejects.toMatchObject({ name: "AccessDenied" });
      expect(reports).toMatchObject([
        { failure: { origin: "provider", name: "AccessDenied", status: 403 }, complete: false, pending: ["MULTIPART_REMAINS", "STAGING_PURGE_FAILED"] },
      ]);
    });

    it("the adapter's own call deadline is the cause, not the source's AbortError", async () => {
      const { s3, storage, reports } = reported({ ...S3_LIMITS, callMs: 40 });
      s3.before = async (command, signal) => {
        await network();
        if (command.name === "UploadPartCommand") await hang(signal);
      };
      await expect(storage.stage(randomUUID(), openSource())).rejects.toThrow("S3_DEADLINE_EXCEEDED");
      expect(s3.totalEntries()).toBe(0);
      expect(reports).toMatchObject([{ failure: { origin: "deadline", name: "Error" }, complete: true }]);
    });

    class ServiceDeadline extends Error {}
    it.each([
      ["a client that disconnects", () => new BackupTransferIncompleteError()],
      ["the service's upload deadline", () => new ServiceDeadline("deadline")],
    ])("%s while a part uploads stays the cause, not the provider call it aborted", async (_, make) => {
      const { s3, storage, reports } = reported();
      const source = openSource();
      const cause = make();
      s3.before = async (command, signal) => {
        if (command.name !== "UploadPartCommand") return;
        source.destroy(cause);
        await hang(signal);
      };
      await expect(storage.stage(randomUUID(), source)).rejects.toBe(cause);
      expect(s3.totalEntries()).toBe(0);
      expect(reports).toMatchObject([{ failure: { origin: "source" }, complete: true }]);
    });

    it("a reporter that throws changes nothing: the 403 is still the error", async () => {
      const s3 = new InMemoryS3(BUCKET);
      const storage = new S3BackupStorage(s3, { bucket: BUCKET, prefix: PREFIX }, S3_LIMITS, () => {
        throw new Error("reporter");
      });
      s3.before = async (command) => {
        await network();
        if (command.name === "CreateMultipartUploadCommand") throw s3Error("AccessDenied", 403);
      };
      await expect(storage.stage(randomUUID(), openSource())).rejects.toMatchObject({ name: "AccessDenied" });
    });
  });
});

backupStorageContract("S3BackupStorage over the double with both #151 behaviours (403 for absent names, per-page IsLatest) and pages of 1", async () => {
  const { s3, storage } = setup();
  s3.quirks = { missingAs403: true, latestPerPage: true };
  s3.pageSize = 1;
  return {
    storage,
    entries: async (area) => entriesOf(s3, area),
    writeForeign: async (area, name, content) => {
      s3.putDirect(`${PREFIX}${area}/${name}`, Buffer.from(content));
    },
    readForeign: async (area, name) => {
      const versions = s3.versionsOf(`${PREFIX}${area}/${name}`);
      return versions[versions.length - 1].body.toString();
    },
    isEmpty: async () => s3.totalEntries() === 0,
    dispose: async () => undefined,
  };
});

backupStorageContract("S3BackupStorage over the double with B2's per-page IsLatest and pages of 1", async () => {
  const { s3, storage } = setup();
  s3.quirks.latestPerPage = true;
  s3.pageSize = 1;
  return {
    storage,
    entries: async (area) => entriesOf(s3, area),
    writeForeign: async (area, name, content) => {
      s3.putDirect(`${PREFIX}${area}/${name}`, Buffer.from(content));
    },
    readForeign: async (area, name) => {
      const versions = s3.versionsOf(`${PREFIX}${area}/${name}`);
      return versions[versions.length - 1].body.toString();
    },
    isEmpty: async () => s3.totalEntries() === 0,
    dispose: async () => undefined,
  };
});
