import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { DeleteObjectCommand, GetObjectCommand, ListMultipartUploadsCommand, ListObjectVersionsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { ENVELOPE_TAG_BYTES } from "./application/backup-format";
import { purgePending } from "./application/backup-retention";
import { S3BackupStorage, S3Sender } from "./infrastructure/s3-backup-storage";
import { envelopeHeader } from "./test-support/backup-envelope";
import { gateCommit, interceptCompletion } from "./test-support/backup-test-hooks";
import {
  B151_KEY_PREFIX,
  b151Format,
  B151Connection,
  B151Profile,
  B151Report,
  b2SettingsFromEnv,
  ErrorSummary,
  errorSummary,
  isProfile,
  nodelSettingsFromEnv,
  treeVersion,
  verifyB2Key,
  scrub,
} from "./test-support/b151-b2-real";
import { s3Error } from "./test-support/in-memory-s3";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  seedFixture,
  TestSession,
  unusablePasswordHash,
} from "../sync-v1/test-support/sync-v1-test-app";

/**
 * BE #151 §A item 6 (2026-10-19): C2, C5 and T-R5 of
 * `retention.backups.postgres.spec.ts` with the real S3 adapter.
 *
 * - `F08_B151_DESTINO=b2`: against real Backblaze B2, with the key that
 *   `con_b2.ps1` injects (`BACKUP_S3_*`) and `F08_B151_PERFIL` = `rw` (C2,
 *   C5) or `nodel` (T-R5, where the provider really refuses deletes). The
 *   key is checked against B2 before anything runs.
 * - `F08_B151_DESTINO=doble`: the same tests over the in-memory S3 double
 *   with the profile simulated. It validates the tests, **not B2**.
 *
 * Skipped without `F08_BKP_PG_TEST_URL` and `F08_B151_DESTINO`; not in the
 * CI (the CI's `backups.postgres.spec.ts` pattern does not match this
 * name). Report: `F08_B151_SALIDA` (JSON and text, scrubbed). Synthetic data.
 *
 * `F08_B151_FORMATO=2` (F08-ADR-003): every copy is a format-2 envelope (the
 * outer header of the phone's encryption over random bytes: the server and
 * B2 see the same as with a real one, and nobody can decrypt it), and the app
 * runs with `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true`. Default: format 1.
 */
const postgresUrl = process.env["F08_BKP_PG_TEST_URL"];
const destino = process.env["F08_B151_DESTINO"];
const perfil = process.env["F08_B151_PERFIL"];
const settings = destino === "b2" ? b2SettingsFromEnv() : null;
/** rw (C2, C5), nodel (T-R5) or rotacion (T-R5 with the rotation's purge refused: rw plus the nodel key). */
type SuiteMode = B151Profile | "rotacion";
const enabled =
  !!postgresUrl && (destino === "doble" || (destino === "b2" && !!settings && (isProfile(perfil) || perfil === "rotacion")));
const describeFor = (mode: SuiteMode) =>
  enabled && (destino === "doble" || perfil === mode) ? describe : describe.skip;
const STEP_LABEL: Record<SuiteMode, string> = {
  rw: "C2 y C5",
  ro: "(sin pruebas con ro)",
  nodel: "T-R5",
  rotacion: "T-R5, variante de la rotación",
};
const BASE = "/api/v1/me/backups";
/** Any error escaping a test (setup included) reaches the Jest console scrubbed of the keys. */
const scrubbed = (fn: () => Promise<void>) => async () => {
  try {
    await fn();
  } catch (error) {
    throw new Error(scrub(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  }
};
const N = 3;
const FORMATO = b151Format();
const MAGIC = Buffer.from("AGROENC\0", "latin1");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest("base64"); // NOSONAR: S3 Content-MD5 transport check, not cryptographic

/**
 * One app over one isolated database and the adapter under
 * `<prefix>c6-<mode>/`. In `rotacion` the adapter talks to B2 with rw, and
 * only while `routeRotationDeletes` is on, every `DeleteObject` of a name
 * under `objects/` goes out with the nodel key instead: B2 itself refuses it.
 */
function suite(mode: SuiteMode) {
  const profile: B151Profile = mode === "rotacion" ? "rw" : mode;
  const reportProfile = mode === "rotacion" ? "rw+nodel" : profile;
  const s = {} as {
    app: INestApplication;
    server: Server;
    prisma: PrismaService;
    jwt: JwtService;
    f: Fixture;
    diskDir: string;
    conn: B151Connection;
    storage: S3BackupStorage;
    base: string;
    report: B151Report;
    routeRotationDeletes: boolean;
    routed: { sent: number; keys: string[]; refused: ErrorSummary[] };
  };
  s.routeRotationDeletes = false;
  s.routed = { sent: 0, keys: [], refused: [] };

  beforeAll(scrubbed(async () => {
    s.conn = destino === "b2" ? B151Connection.b2(settings!) : B151Connection.doble(`${B151_KEY_PREFIX}doble-pg/`);
    s.conn.simulated = profile;
    const key = destino === "b2" ? await verifyB2Key(settings!, profile) : null;
    let second: Awaited<ReturnType<typeof verifyB2Key>> | null = null;
    let sender: S3Sender = s.conn.sender;
    if (mode === "rotacion") {
      let nodel: S3Sender;
      if (destino === "b2") {
        const nodelSettings = nodelSettingsFromEnv(settings!);
        if (!nodelSettings) throw new Error("rotacion needs F08_B151_NODEL_* (run it through b151_b2.cjs)");
        second = await verifyB2Key(nodelSettings, "nodel");
        nodel = B151Connection.b2(nodelSettings).sender;
      } else {
        // The double has one store: the refusal of the second key is simulated.
        nodel = { send: async () => Promise.reject(s3Error("AccessDenied", 403)) };
      }
      const rw = s.conn.sender;
      sender = {
        send: async (command, options) => {
          const isRotationDelete =
            s.routeRotationDeletes &&
            command instanceof DeleteObjectCommand &&
            (command.input.Key ?? "").startsWith(`${s.base}objects/`);
          if (!isRotationDelete) return rw.send(command, options);
          s.routed.sent += 1;
          s.routed.keys.push((command.input.Key ?? "").slice(s.base.length));
          try {
            return await nodel.send(command, options);
          } catch (error) {
            s.routed.refused.push(errorSummary(error));
            throw error;
          }
        },
      };
    }
    s.base = `${s.conn.settings.prefix}c6-${mode}/`;
    s.storage = new S3BackupStorage(sender, { bucket: s.conn.settings.bucket, prefix: s.base });
    s.report = new B151Report({
      herramienta: "Back/src/modules/backups/b151-b2-real.postgres.spec.ts",
      destino: destino as "b2" | "doble",
      perfil: reportProfile,
      paso: STEP_LABEL[mode],
      version: treeVersion(join(__dirname, "..", "..", "..", "..")),
      configuracion: {
        prefijoAdaptador: s.base,
        bucket: s.conn.settings.bucket,
        N,
        formato: FORMATO,
        exigeCifradoEnElTelefono: FORMATO === 2,
        ...(key ? { clave: { capacidades: key.capabilities, namePrefix: key.namePrefix } } : {}),
        ...(second ? { claveDeLosBorradosDeLaRotacion: { capacidades: second.capabilities, namePrefix: second.namePrefix } } : {}),
      },
    });
    const existing = (await versions("")).length + (await uploads("")).length;
    if (existing > 0) throw new Error(`${s.base} is not empty: use another BACKUP_S3_PREFIX subfolder or clean it`);
    // A disk directory is configured on purpose: nothing may ever land in it.
    s.diskDir = await mkdtemp(join(tmpdir(), `f08-b151-${mode}-disk-`));
    process.env["BACKUP_STORAGE_DIR"] = s.diskDir;
    process.env["BACKUP_MAX_BYTES"] = String(64 * 1024);
    process.env["BACKUP_MAX_ACTIVE_PER_MEMBER"] = String(N);
    process.env["BACKUP_REQUIRE_CLIENT_ENCRYPTION"] = FORMATO === 2 ? "true" : "false";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, `f08_b151_${mode}`);
    ({ app: s.app, prisma: s.prisma, jwt: s.jwt } = await createSyncV1App(databaseUrl, { backupStorage: s.storage }));
    s.server = s.app.getHttpServer();
    await new Promise<void>((resolve) => s.server.listen(0, "127.0.0.1", resolve));
    s.f = await seedFixture(s.prisma);
    for (const level of ["log", "warn", "error", "debug", "verbose"] as const)
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }), 300000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await s.app?.close();
    if (s.diskDir) {
      expect(await readdir(s.diskDir)).toEqual([]);
      await rm(s.diskDir, { recursive: true, force: true });
    }
    if (s.report) {
      const out = process.env["F08_B151_SALIDA"] ?? join(tmpdir(), "b151");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const files = s.report.write(out, `b151-${destino}-${mode}-c6-${stamp}`);
      s.report.note(`informe: ${files.json} y ${files.text}`);
    }
  });

  const send = <T>(command: object) =>
    s.conn.sender.send(command, { abortSignal: AbortSignal.timeout(120_000) }) as Promise<T>;
  /** Versions and markers under `<base><sub>`, all pages (relative names). */
  async function versions(sub: string) {
    const out: { name: string; versionId?: string; marker: boolean }[] = [];
    let KeyMarker: string | undefined;
    let VersionIdMarker: string | undefined;
    for (;;) {
      const page = await send<{
        Versions?: { Key?: string; VersionId?: string }[];
        DeleteMarkers?: { Key?: string; VersionId?: string }[];
        IsTruncated?: boolean;
        NextKeyMarker?: string;
        NextVersionIdMarker?: string;
      }>(new ListObjectVersionsCommand({ Bucket: s.conn.settings.bucket, Prefix: s.base + sub, KeyMarker, VersionIdMarker }));
      for (const v of page.Versions ?? []) out.push({ name: v.Key!.slice(s.base.length), versionId: v.VersionId, marker: false });
      for (const m of page.DeleteMarkers ?? []) out.push({ name: m.Key!.slice(s.base.length), versionId: m.VersionId, marker: true });
      if (!page.IsTruncated) return out;
      KeyMarker = page.NextKeyMarker;
      VersionIdMarker = page.NextVersionIdMarker;
    }
  }
  async function uploads(sub: string) {
    const page = await send<{ Uploads?: { Key?: string }[] }>(
      new ListMultipartUploadsCommand({ Bucket: s.conn.settings.bucket, Prefix: s.base + sub }),
    );
    return (page.Uploads ?? []).map((u) => u.Key!.slice(s.base.length));
  }
  /** Physical entries (versions, markers, staging) of one storage key. */
  const entriesOfKey = async (key: string) =>
    (await versions(`objects/${key}`)).length + (await versions(`staging/${key}.`)).length + (await uploads(`staging/${key}.`)).length;

  /**
   * Records one check in the report and fails the test if it does not hold.
   * The body returns what was observed and whether it is what was expected.
   */
  async function check(caso: string, esperado: string, body: () => Promise<{ observado: unknown; ok: boolean; nota?: string }>) {
    let result: { observado: unknown; ok: boolean; nota?: string };
    try {
      result = await body();
    } catch (error) {
      result = { observado: { error: errorSummary(error) }, ok: false };
    }
    s.report.add({ caso, perfil: reportProfile, esperado, observado: result.observado, veredicto: result.ok ? "PASS" : "FAIL", ...(result.nota ? { nota: result.nota } : {}) });
    expect({ caso, ok: result.ok }).toEqual({ caso, ok: true });
  }

  const http = () => request(s.server);
  const auth = (session: { token: string }) => ({ Authorization: `Bearer ${session.token}` });
  const plain = () => Buffer.concat([Buffer.from(`F08-B151-${randomUUID()}`), randomBytes(512)]);
  /** Format 2: the envelope's header, 512 random "encrypted" bytes and a random tag. */
  const payload = () =>
    FORMATO === 2 ? Buffer.concat([envelopeHeader(512), randomBytes(512), randomBytes(ENVELOPE_TAG_BYTES)]) : plain();
  const upload = (session: TestSession, bytes = payload(), format = FORMATO) =>
    http()
      .post(BASE)
      .set(auth(session))
      .set("Content-Type", "application/octet-stream")
      .set("X-Content-SHA256", sha(bytes))
      .set("X-Backup-Format-Version", String(format))
      .set("X-Backup-Schema-Version", "9")
      .send(bytes);
  const download = (session: TestSession, id: string) =>
    http()
      .get(`${BASE}/${id}/content`)
      .set(auth(session))
      .buffer(true)
      .parse((res: Readable, done: (e: Error | null, b: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
  const listIds = async (session: TestSession) =>
    ((await http().get(BASE).set(auth(session))).body.backups as { id: string }[]).map((b) => b.id);
  const rowsOf = (session: TestSession) =>
    s.prisma.backupMetadata.findMany({ where: { memberId: session.memberId }, orderBy: { createdAt: "asc" } });

  async function newFarmer(): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await s.prisma.user.create({
      data: {
        id: userId, tenantId: s.f.tenantA, name: "Agricultor sintético B151",
        email: `b151-${userId}@example.test`, passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: s.f.tenantA, role: "AGRICULTOR" } },
      },
    });
    return createSession(s.prisma, s.jwt, memberId);
  }

  async function farmerWith(count: number) {
    const session = await newFarmer();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const response = await upload(session);
      if (response.status !== 201) throw new Error(`setup upload HTTP ${response.status}`);
      ids.push(response.body.id);
    }
    return { session, ids };
  }

  /** Each AVAILABLE row has exactly one version of its object and nothing in staging. */
  async function availableIntact(session: TestSession) {
    let ok = true;
    for (const row of (await rowsOf(session)).filter((r) => r.status === "AVAILABLE")) {
      const v = await versions(`objects/${row.storageKey}`);
      ok &&= v.length === 1 && !v[0].marker && (await versions(`staging/${row.storageKey}.`)).length === 0;
    }
    return ok;
  }

  return { s, versions, uploads, entriesOfKey, check, http, auth, plain, payload, upload, download, listIds, rowsOf, newFarmer, farmerWith, availableIntact };
}

describeFor("rw")("BE #151 item 6 with the real S3 adapter: C2 and C5 (key rw)", () => {
  const t = suite("rw");

  it("C2: an owner deletion before the completion retires nothing more; one during it waits for the Member lock", scrubbed(async () => {
    {
      const { session, ids } = await t.farmerWith(N);
      const first = (await t.rowsOf(session))[0];
      const gate = gateCommit(t.s.storage);
      const pending = t.upload(session).then((r: { status: number }) => r); // supertest only sends when awaited
      await gate.reached;
      const deleted = await t.http().delete(`${BASE}/${ids[0]}`).set(t.auth(session));
      gate.release();
      const done = await pending;
      await t.check("C2a: borrado del propietario mientras la subida espera en el commit",
        "borrado 204; subida 201; quedan N AVAILABLE; ninguna retirada por RETENTION; la borrada sin versiones en B2; cada AVAILABLE con 1 versión y sin staging",
        async () => {
          const rows = await t.rowsOf(session);
          const observado = {
            borrado: deleted.status, subida: done.status,
            available: rows.filter((r) => r.status === "AVAILABLE").length,
            retention: rows.filter((r) => r.deletionReason === "RETENTION").length,
            owner: rows.filter((r) => r.deletionReason === "OWNER").map((r) => r.id === ids[0]),
            versionesDeLaBorrada: await t.entriesOfKey(first.storageKey),
            availableIntactas: await t.availableIntact(session),
          };
          return {
            observado,
            ok: deleted.status === 204 && done.status === 201 && observado.available === N && observado.retention === 0 &&
              JSON.stringify(observado.owner) === "[true]" && observado.versionesDeLaBorrada === 0 && observado.availableIntactas,
          };
        });
    }
    {
      const { session, ids } = await t.farmerWith(N);
      const before = await t.rowsOf(session);
      let deletion: Promise<{ status: number }> | undefined;
      let deleted = false;
      let deletedInsideLock: boolean | undefined;
      interceptCompletion(t.s.prisma, {
        inside: async () => {
          deletion = t.http().delete(`${BASE}/${ids[1]}`).set(t.auth(session)).then((r: { status: number }) => {
            deleted = true;
            return r;
          });
          await new Promise((resolve) => setTimeout(resolve, 400));
          deletedInsideLock = deleted;
        },
      });
      const done = await t.upload(session);
      const del = await deletion!;
      await t.check("C2b: borrado del propietario durante la transacción de completado",
        "el borrado espera al cerrojo del Member; subida 201 y borrado 204; RETENTION = la más antigua, OWNER = la otra; N-1 AVAILABLE; ambas sin versiones en B2",
        async () => {
          const rows = await t.rowsOf(session);
          const observado = {
            borradoDentroDelCerrojo: deletedInsideLock, subida: done.status, borrado: del.status,
            retention: rows.filter((r) => r.deletionReason === "RETENTION").map((r) => r.id === ids[0]),
            owner: rows.filter((r) => r.deletionReason === "OWNER").map((r) => r.id === ids[1]),
            available: rows.filter((r) => r.status === "AVAILABLE").length,
            versionesRetirada: await t.entriesOfKey(before[0].storageKey),
            versionesBorrada: await t.entriesOfKey(before[1].storageKey),
            availableIntactas: await t.availableIntact(session),
          };
          return {
            observado,
            ok: deletedInsideLock === false && done.status === 201 && del.status === 204 &&
              JSON.stringify(observado.retention) === "[true]" && JSON.stringify(observado.owner) === "[true]" &&
              observado.available === N - 1 && observado.versionesRetirada === 0 && observado.versionesBorrada === 0 && observado.availableIntactas,
          };
        });
    }
  }), 600000);

  it("C5: a recent UPLOADING row is never closed; an abandoned one is closed and its staging purged in B2; a late completion changes nothing", scrubbed(async () => {
    const session = await t.newFarmer();
    const key = randomUUID();
    const row = await t.s.prisma.backupMetadata.create({
      data: {
        id: randomUUID(), tenantId: t.s.f.tenantA, memberId: session.memberId, storageKey: key,
        contentType: "application/octet-stream", formatVersion: FORMATO, schemaVersion: 9, sha256: "d".repeat(64),
      },
    });
    const part = randomBytes(64);
    const stagingName = `${t.s.base}staging/${key}.${randomBytes(8).toString("hex")}.part`;
    await t.s.conn.sender.send(
      new PutObjectCommand({ Bucket: t.s.conn.settings.bucket, Key: stagingName, Body: part, ContentLength: part.length, ContentMD5: md5(part) }),
      { abortSignal: AbortSignal.timeout(120_000) },
    );

    const recent = await t.upload(session);
    const recentRow = await t.s.prisma.backupMetadata.findUniqueOrThrow({ where: { id: row.id } });
    const recentStaging = (await t.versions(`staging/${key}.`)).length;
    await t.check("C5a: una fila UPLOADING reciente no se cierra",
      "409; la fila sigue UPLOADING; su staging sigue en B2",
      async () => ({
        observado: { subida: recent.status, estado: recentRow.status, stagingEnB2: recentStaging },
        ok: recent.status === 409 && recentRow.status === "UPLOADING" && recentStaging === 1,
      }));

    await t.s.prisma.backupMetadata.update({ where: { id: row.id }, data: { createdAt: new Date(Date.now() - 61 * 60 * 1000) } });
    const after = await t.upload(session);
    const closed = await t.s.prisma.backupMetadata.findUniqueOrThrow({ where: { id: row.id } });
    await t.check("C5b: una fila abandonada (> 60 min) se cierra y su staging se purga en B2",
      "201; la fila FAILED ABANDONED sin purga pendiente; 0 versiones de su staging en B2",
      async () => {
        const observado = { subida: after.status, estado: closed.status, codigo: closed.failureCode, purgaPendiente: closed.purgePending, stagingEnB2: await t.entriesOfKey(key) };
        return {
          observado,
          ok: after.status === 201 && closed.status === "FAILED" && closed.failureCode === "ABANDONED" && !closed.purgePending && observado.stagingEnB2 === 0,
        };
      });

    const gate = gateCommit(t.s.storage);
    const late = t.upload(session).then((r: { status: number }) => r);
    await gate.reached;
    const waiting = (await t.rowsOf(session)).find((r) => r.status === "UPLOADING")!;
    await t.s.prisma.backupMetadata.update({ where: { id: waiting.id }, data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    const other = await t.upload(session);
    gate.release();
    const lateDone = await late;
    await t.check("C5c: una subida cerrada como abandonada mientras esperaba el commit; su commit tardío no cambia nada",
      "la otra subida 201; la tardía 503; la fila FAILED ABANDONED sin purga pendiente; ni objeto final ni staging en B2; no aparece en la lista",
      async () => {
        const w = await t.s.prisma.backupMetadata.findUniqueOrThrow({ where: { id: waiting.id } });
        const observado = {
          otra: other.status, tardia: lateDone.status, estado: w.status, codigo: w.failureCode, purgaPendiente: w.purgePending,
          entradasEnB2: await t.entriesOfKey(waiting.storageKey), listada: (await t.listIds(session)).includes(waiting.id),
          availableIntactas: await t.availableIntact(session),
        };
        return {
          observado,
          ok: other.status === 201 && lateDone.status === 503 && w.status === "FAILED" && w.failureCode === "ABANDONED" &&
            !w.purgePending && observado.entradasEnB2 === 0 && !observado.listada && observado.availableIntactas,
        };
      });
  }), 600000);

  (FORMATO === 2 ? it : it.skip)("format 2: B2 keeps the encrypted copy byte for byte under SSE-B2; a format-1 upload is refused without reaching B2", scrubbed(async () => {
    const session = await t.newFarmer();
    const bytes = t.payload();
    const stored = await t.upload(session, bytes);
    await t.check("c6-rw formato 2: B2 guarda la copia cifrada tal como llegó del teléfono",
      "201; fila AVAILABLE con formatVersion 2; el objeto de B2 empieza por AGROENC\\0 y tiene el mismo tamaño y SHA-256; SSE AES256; la descarga por la API es idéntica",
      async () => {
        const row = (await t.rowsOf(session)).at(-1)!;
        const object = (await t.s.conn.sender.send(
          new GetObjectCommand({ Bucket: t.s.conn.settings.bucket, Key: `${t.s.base}objects/${row.storageKey}` }),
          { abortSignal: AbortSignal.timeout(120_000) },
        )) as { Body?: AsyncIterable<Uint8Array>; ServerSideEncryption?: string };
        const chunks: Buffer[] = [];
        for await (const chunk of object.Body!) chunks.push(Buffer.from(chunk));
        const inB2 = Buffer.concat(chunks);
        const served = await t.download(session, stored.body.id);
        const observado = {
          subida: stored.status, estado: row.status, formatVersion: row.formatVersion,
          cabeceraAgroenc: inB2.subarray(0, MAGIC.length).equals(MAGIC), bytesEnB2: inB2.length, bytesEnviados: bytes.length,
          mismoSha256: sha(inB2) === sha(bytes), sse: object.ServerSideEncryption ?? null,
          descargaIdentica: served.status === 200 && sha(served.body as Buffer) === sha(bytes),
        };
        // The double does not simulate SSE-B2: there it is only recorded.
        const sseOk = destino === "doble" || observado.sse === "AES256";
        return {
          observado,
          ok: stored.status === 201 && row.status === "AVAILABLE" && row.formatVersion === 2 && observado.cabeceraAgroenc &&
            observado.bytesEnB2 === bytes.length && observado.mismoSha256 && sseOk && observado.descargaIdentica,
          ...(destino === "doble" ? { nota: "el doble no simula SSE-B2: el AES256 sólo se comprueba contra B2" } : {}),
        };
      });
    const rowsBefore = (await t.rowsOf(session)).length;
    const entriesBefore = (await t.versions("")).length + (await t.uploads("")).length;
    const refused = await t.upload(session, t.plain(), 1);
    await t.check("c6-rw formato 2: con BACKUP_REQUIRE_CLIENT_ENCRYPTION=true, una subida en formato 1 se rechaza sin llegar a B2",
      "422 BACKUP_ENCRYPTION_REQUIRED; 0 filas nuevas; 0 entradas nuevas en B2",
      async () => {
        const observado = {
          subida: refused.status, codigo: refused.body?.errorCode ?? null,
          filasNuevas: (await t.rowsOf(session)).length - rowsBefore,
          entradasNuevasEnB2: (await t.versions("")).length + (await t.uploads("")).length - entriesBefore,
        };
        return {
          observado,
          ok: refused.status === 422 && observado.codigo === "BACKUP_ENCRYPTION_REQUIRED" && observado.filasNuevas === 0 && observado.entradasNuevasEnB2 === 0,
        };
      });
  }), 300000);

  it("rw leaves its subfolder clean: every remaining entry belongs to an AVAILABLE copy; the owner deletes them all", scrubbed(async () => {
    const rows = await t.s.prisma.backupMetadata.findMany({ where: { status: "AVAILABLE" } });
    const all = await t.versions("");
    const known = new Set(rows.map((r) => `objects/${r.storageKey}`));
    const strays = all.filter((v) => !known.has(v.name));
    await t.check("c6-rw: en B2 sólo quedan los objetos de copias AVAILABLE (1 versión cada una)",
      "0 entradas ajenas; tantas versiones como copias AVAILABLE; 0 multipart",
      async () => {
        const observado = { available: rows.length, versiones: all.length, ajenas: strays.length, multipart: (await t.uploads("")).length };
        return { observado, ok: strays.length === 0 && all.length === rows.length && observado.multipart === 0 };
      });
    for (const row of rows) await t.s.storage.remove(row.storageKey);
    const left = (await t.versions("")).length + (await t.uploads("")).length;
    t.s.report.note(`c6-rw: subcarpeta limpiada por el adaptador (remove de ${rows.length} copias); quedan ${left} entradas`);
    expect(left).toBe(0);
  }), 300000);
});

describeFor("nodel")("BE #151 item 6 with the real S3 adapter: T-R5 with a key that cannot delete (nodel)", () => {
  const t = suite("nodel");

  it("T-R5: with real delete refusals no valid copy is lost, nothing becomes AVAILABLE, the bound holds with 503 and the purges stay pending", scrubbed(async () => {
    const session = await t.newFarmer();
    // N valid copies written directly (the key can write, and no commit can succeed without deleteFiles).
    const seeded: { id: string; key: string; bytes: Buffer }[] = [];
    for (let i = 0; i < N; i++) {
      const bytes = t.payload();
      const key = randomUUID();
      await t.s.conn.sender.send(
        new PutObjectCommand({
          Bucket: t.s.conn.settings.bucket, Key: `${t.s.base}objects/${key}`, Body: bytes, ContentLength: bytes.length,
          ContentMD5: md5(bytes), ContentType: "application/octet-stream", ServerSideEncryption: "AES256",
          Metadata: { "agro-sha256": sha(bytes), "agro-size": String(bytes.length) },
        }),
        { abortSignal: AbortSignal.timeout(120_000) },
      );
      const row = await t.s.prisma.backupMetadata.create({
        data: {
          id: randomUUID(), tenantId: t.s.f.tenantA, memberId: session.memberId, storageKey: key, status: "AVAILABLE",
          contentType: "application/octet-stream", formatVersion: FORMATO, schemaVersion: 9, sha256: sha(bytes),
          sizeBytes: BigInt(bytes.length), completedAt: new Date(), createdAt: new Date(Date.now() - (N - i) * 60_000),
        },
      });
      seeded.push({ id: row.id, key, bytes });
    }
    const intact = async () => {
      const out: boolean[] = [];
      for (const c of seeded) {
        const d = await t.download(session, c.id);
        out.push(d.status === 200 && sha(d.body as Buffer) === sha(c.bytes));
      }
      return out;
    };
    await t.check("T-R5 preparación: N copias válidas escritas con la clave nodel y descargables por la API",
      "lista con N copias; cada descarga 200 con sus bytes",
      async () => {
        const ids = await t.listIds(session);
        const ok = await intact();
        return { observado: { listadas: ids.length, intactas: ok }, ok: ids.length === N && ok.every(Boolean) };
      });

    const first = await t.upload(session);
    const failed = (await t.rowsOf(session)).at(-1)!;
    await t.check("T-R5a: una subida con el proveedor que rechaza borrados",
      "503 BACKUP_STORAGE_UNAVAILABLE (el commit no puede purgar el staging); la fila FAILED STORAGE_COMMIT_FAILED con purga pendiente; nada retirado; las N copias siguen listadas e íntegras",
      async () => {
        const rows = await t.rowsOf(session);
        const observado = {
          subida: first.status, cuerpo: first.body, estado: failed.status, codigo: failed.failureCode, purgaPendiente: failed.purgePending,
          retention: rows.filter((r) => r.deletionReason === "RETENTION").length, listadas: (await t.listIds(session)).length,
          intactas: await intact(), restosEnB2: await t.entriesOfKey(failed.storageKey),
        };
        return {
          observado,
          ok: first.status === 503 && first.body?.errorCode === "BACKUP_STORAGE_UNAVAILABLE" && failed.status === "FAILED" &&
            failed.failureCode === "STORAGE_COMMIT_FAILED" && failed.purgePending && observado.retention === 0 &&
            observado.listadas === N && observado.intactas.every(Boolean),
          nota: "Los restos en B2 de la subida fallida (objeto final y staging) no se pueden borrar con esta clave: quedan para «limpiar» con rw.",
        };
      });

    const rowsBefore = (await t.rowsOf(session)).length;
    const entriesBefore = (await t.versions("")).length;
    const second = await t.upload(session);
    await t.check("T-R5b: con N AVAILABLE + 1 purga pendiente, la cota rechaza la siguiente subida",
      "503 BACKUP_STORAGE_UNAVAILABLE sin fila nueva ni escritura nueva en B2",
      async () => {
        const observado = { subida: second.status, cuerpo: second.body, filasNuevas: (await t.rowsOf(session)).length - rowsBefore, entradasNuevasEnB2: (await t.versions("")).length - entriesBefore };
        return {
          observado,
          ok: second.status === 503 && second.body?.errorCode === "BACKUP_STORAGE_UNAVAILABLE" && observado.filasNuevas === 0 && observado.entradasNuevasEnB2 === 0,
        };
      });

    const del = await t.http().delete(`${BASE}/${seeded[0].id}`).set(t.auth(session));
    await t.check("T-R5c: el borrado del propietario con el proveedor que rechaza borrados",
      "204 (borrado lógico: deja de listarse y servirse) con la purga pendiente; sus bytes siguen en B2 hasta que una clave con deleteFiles reconcilie; las otras copias íntegras",
      async () => {
        const row = await t.s.prisma.backupMetadata.findUniqueOrThrow({ where: { id: seeded[0].id } });
        const served = await t.download(session, seeded[0].id);
        const others = (await intact()).slice(1);
        const observado = {
          borrado: del.status, estado: row.status, motivo: row.deletionReason, purgaPendiente: row.purgePending,
          descarga: served.status, versionesEnB2: (await t.versions(`objects/${seeded[0].key}`)).length, otrasIntactas: others,
        };
        return {
          observado,
          ok: del.status === 204 && row.status === "DELETED" && row.deletionReason === "OWNER" && row.purgePending &&
            served.status === 404 && observado.versionesEnB2 === 1 && others.every(Boolean),
        };
      });

    const third = await t.upload(session);
    const reconcile = await purgePending(t.s.prisma, t.s.storage, { memberId: session.memberId });
    await t.check("T-R5d: la cota sigue cerrada y la reconciliación con esta clave no confirma nada",
      "subida 503; purgePending: 0 confirmadas, 2 fallidas (OWNER y FAILED); las filas siguen pendientes",
      async () => {
        const pending = (await t.rowsOf(session)).filter((r) => r.purgePending).length;
        const observado = { subida: third.status, reconciliacion: reconcile, filasPendientes: pending };
        return {
          observado,
          ok: third.status === 503 && reconcile.confirmed === 0 && reconcile.failed === 2 && pending === 2,
          nota: "Con sólo esta clave la purga de la rotación no se alcanza (ningún commit llega a AVAILABLE sin deleteFiles); esa variante es la suite «rotacion» (rw + nodel).",
        };
      });
  }), 600000);
});

describeFor("rotacion")("BE #151 item 6 with the real S3 adapter: T-R5, the purge of the rotation refused by B2 (rw + nodel)", () => {
  const t = suite("rotacion");

  it("T-R5 (rotation): a purge refused during the rotation keeps the bounded excess, refuses uploads with 503 and is reconciled", scrubbed(async () => {
    const { session, ids } = await t.farmerWith(N);
    const retired = (await t.rowsOf(session))[0];

    t.s.routeRotationDeletes = true;
    const rotated = await t.upload(session);
    await t.check("T-R5r-a: la subida que rota, con el borrado de la copia retirada enviado con la clave nodel",
      "201; la nueva queda AVAILABLE; la más antigua DELETED RETENTION con purga pendiente; B2 rechazó el borrado y su versión sigue; N listadas e íntegras",
      async () => {
        const row = await t.s.prisma.backupMetadata.findUniqueOrThrow({ where: { id: ids[0] } });
        const observado = {
          subida: rotated.status, estado: row.status, motivo: row.deletionReason, purgaPendiente: row.purgePending,
          borradosEnviadosConNodel: t.s.routed.sent, rechazosDeB2: [...t.s.routed.refused],
          soloLaRetirada: t.s.routed.keys.every((k) => k === `objects/${retired.storageKey}`),
          versionesDeLaRetirada: (await t.versions(`objects/${retired.storageKey}`)).length,
          listadas: (await t.listIds(session)).length, availableIntactas: await t.availableIntact(session),
        };
        return {
          observado,
          ok: rotated.status === 201 && row.status === "DELETED" && row.deletionReason === "RETENTION" && row.purgePending &&
            t.s.routed.sent > 0 && t.s.routed.refused.length === t.s.routed.sent && observado.soloLaRetirada &&
            t.s.routed.refused.every((e) => e.status === 401 || e.status === 403) &&
            observado.versionesDeLaRetirada === 1 && observado.listadas === N && observado.availableIntactas,
          nota: "La herramienta elige qué clave envía el borrado de objects/; el rechazo lo decide B2 (la clave nodel no tiene deleteFiles).",
        };
      });

    const rowsBefore = (await t.rowsOf(session)).length;
    const entriesBefore = (await t.versions("")).length;
    const refused = await t.upload(session);
    await t.check("T-R5r-b: con N AVAILABLE + 1 purga pendiente, la cota rechaza la siguiente subida",
      "503 BACKUP_STORAGE_UNAVAILABLE, sin fila nueva ni escritura nueva en B2; siguen N listadas",
      async () => {
        const observado = {
          subida: refused.status, cuerpo: refused.body, filasNuevas: (await t.rowsOf(session)).length - rowsBefore,
          entradasNuevasEnB2: (await t.versions("")).length - entriesBefore, listadas: (await t.listIds(session)).length,
        };
        return {
          observado,
          ok: refused.status === 503 && refused.body?.errorCode === "BACKUP_STORAGE_UNAVAILABLE" && observado.filasNuevas === 0 &&
            observado.entradasNuevasEnB2 === 0 && observado.listadas === N,
        };
      });

    t.s.routeRotationDeletes = false;
    const reconciled = await t.upload(session);
    await t.check("T-R5r-c: con la clave con deleteFiles otra vez, la siguiente subida reconcilia",
      "201; ninguna purga pendiente; la retirada sin versiones en B2; N AVAILABLE con 1 versión cada una",
      async () => {
        const rows = await t.rowsOf(session);
        const observado = {
          subida: reconciled.status, pendientes: rows.filter((r) => r.purgePending).length,
          versionesDeLaRetirada: (await t.versions(`objects/${retired.storageKey}`)).length,
          available: rows.filter((r) => r.status === "AVAILABLE").length, availableIntactas: await t.availableIntact(session),
        };
        return {
          observado,
          ok: reconciled.status === 201 && observado.pendientes === 0 && observado.versionesDeLaRetirada === 0 &&
            observado.available === N && observado.availableIntactas,
        };
      });

    for (const row of (await t.rowsOf(session)).filter((r) => r.status === "AVAILABLE")) await t.s.storage.remove(row.storageKey);
    const left = (await t.versions("")).length + (await t.uploads("")).length;
    t.s.report.note(`c6-rotacion: subcarpeta limpiada por el adaptador con rw; quedan ${left} entradas`);
    expect(left).toBe(0);
  }), 600000);
});
