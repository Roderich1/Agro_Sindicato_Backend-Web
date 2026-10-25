import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  TestSession,
  unusablePasswordHash,
} from "../../../sync-v1/test-support/sync-v1-test-app";
import { Projection, Scenario, ScenarioContribution, scenarios } from "./scenarios";

/**
 * F07-POL-01 (#107): reproducible comparison of thresholds with synthetic data.
 * Not a test of the CI and not a policy decision. Opt-in:
 *
 *   F07_K_COMPARE_PG_URL   a throwaway PostgreSQL server (one NEW database per
 *                          scenario is created and migrated from zero)
 *   F07_K_COMPARE_K        the threshold of this run (default 3)
 *   F07_K_COMPARE_OUT      directory for k<K>.json (optional); never
 *                          docs/evidence/f07_k_comparison, whose files are the
 *                          historical runs on 98375dc and 04fbc9d
 *
 * TEST-ONLY INJECTION of k: the system keeps PROVISIONAL_THRESHOLD = 3
 * (provisional, synthetic trials only) and POLICY_PENDING as its default mode;
 * this suite turns PROVISIONAL_SYNTHETIC on for itself (2026-10-24 note in
 * F07_POL_01_COMPARACION_K.md). Only in this file's module registry, the mock
 * below makes `decideCells` use F07_K_COMPARE_K and the summary report it.
 * With k = 3 the mock passes the default through unchanged.
 *
 * Every scenario runs the same sequence through the real API (Sync v1 push,
 * Directiva and Administrador endpoints): E1 publish, E2 supersede,
 * E3 associate (W3), E4 removal of a Member, E5 role change (M5, #157). After
 * each step, per campaign: the summary JSON (what the Web dashboard reads) and
 * its CSV, then a joint proposal and its CSV. Each read compares the channels
 * with each other and the figures with an oracle kept here from the operations
 * sent, not from the server.
 */
jest.mock("../../domain/disclosure-policy", () => {
  const actual = jest.requireActual("../../domain/disclosure-policy");
  const k = Number(process.env["F07_K_COMPARE_K"] ?? actual.PROVISIONAL_THRESHOLD);
  return {
    ...actual,
    PROVISIONAL_THRESHOLD: k,
    decideCells: (cells: unknown, histories: unknown, _threshold: unknown, budget: unknown) =>
      actual.decideCells(cells, histories, k, budget),
  };
});

const adminUrl = process.env["F07_K_COMPARE_PG_URL"];
const describePostgres = adminUrl ? describe : describe.skip;
const K = Number(process.env["F07_K_COMPARE_K"] ?? "3");
const OUT = process.env["F07_K_COMPARE_OUT"];
const ONLY = process.env["F07_K_COMPARE_SCENARIOS"]?.split(",");

const PUSH = "/api/v1/sync/v1/push";
const STEPS = ["E1_PUBLICAR", "E2_SUSTITUIR", "E3_ASOCIAR", "E4_BAJA", "E5_CAMBIO_ROL"] as const;

interface Res {
  status: number;
  body: any;
  text: string;
}

interface Head {
  member: string;
  campaign: string;
  type: Projection;
  product: string;
  unit: string;
  quantity: bigint;
  active: boolean;
  lastOperation: string;
}

interface CellRead {
  cell: string;
  members_now: number;
  total_now: string;
  status: string;
  contributors: number | null;
  total_base: string | null;
  pending_changes: boolean;
}

/** Git by absolute path only (never resolved through PATH); "desconocido" without it. */
const gitPath = [process.env["F07_K_COMPARE_GIT"], "C:\\Program Files\\Git\\cmd\\git.exe", "/usr/bin/git", "/usr/local/bin/git"].find(
  (c): c is string => !!c && isAbsolute(c) && existsSync(c),
);
const git = (...args: string[]) =>
  gitPath ? spawnSync(gitPath, args, { encoding: "utf8" }).stdout.trim() : "desconocido";
const run: { meta: Record<string, unknown>; scenarios: unknown[] } = {
  meta: {
    k: K,
    injection: "jest.mock de disclosure-policy sólo en este archivo; el sistema conserva PROVISIONAL_THRESHOLD = 3",
    sha: git("rev-parse", "HEAD"),
    tree_clean: git("status", "--porcelain") === "",
    node: process.version,
    started_at: new Date().toISOString(),
  },
  scenarios: [],
};

describePostgres(`F07-POL-01 k comparison (k = ${K})`, () => {
  beforeAll(() => {
    if (!Number.isInteger(K) || K < 2) throw new Error("F07_K_COMPARE_K must be an integer >= 2");
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    for (const level of ["log", "warn"] as const) jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    run.meta["finished_at"] = new Date().toISOString();
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(resolve(OUT, `k${K}.json`), `${JSON.stringify(run, null, 2)}\n`);
    }
  });

  for (const scenario of scenarios().filter((s) => !ONLY || ONLY.includes(s.id))) {
    it(`${scenario.id}: the same sequence on a new database`, async () => {
      const failures = await runScenario(scenario);
      expect(failures).toEqual([]);
    }, 600000);
  }
});

async function runScenario(scenario: Scenario): Promise<string[]> {
  const prefix = `f07k${K}_${scenario.id.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const databaseUrl = await createIsolatedDatabase(adminUrl!, prefix);
  const { app, prisma, jwt } = await createSyncV1App(databaseUrl);
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: unknown = "") => {
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  };
  try {
    const db = (await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`)[0]!.db;
    const version = (await prisma.$queryRaw<{ server_version: string }[]>`SHOW server_version`)[0]!.server_version;
    check("isolated database", databaseUrl.includes(`/${db}`) && db.startsWith(prefix), db);
    const ids = await seed(prisma, scenario);
    const sessions: Record<string, TestSession> = {};
    for (const code of scenario.members) sessions[code] = await createSession(prisma, jwt, ids.members[code]!.memberId);
    const director = await createSession(prisma, jwt, ids.director);
    const admin = await createSession(prisma, jwt, ids.admin);
    const http = () => request(app.getHttpServer());
    const auth = (s: TestSession) => ({ Authorization: `Bearer ${s.token}` });

    const heads = new Map<string, Head>();
    const keyOf = (c: Pick<ScenarioContribution, "member" | "campaign" | "type" | "product" | "unit">) =>
      [c.member, c.campaign, c.type, c.product, c.unit].join("|");
    const state = new Map(scenario.members.map((code) => [code, { active: true, role: "AGRICULTOR" }]));
    const canonical = new Map(scenario.products.map((p) => [p.name, p.name]));
    /** The oracle of kept figures: per campaign and cell, the last figure released without pending changes. */
    const released = new Map<string, { total: string; members: Set<string> }>();
    const nameOf = new Map(Object.entries(ids.products).map(([name, id]) => [id, name]));

    async function push(session: TestSession, c: Omit<ScenarioContribution, "cancelled">, action: "PUBLISH" | "SUPERSEDE" | "CANCEL", pred: string | null) {
      const operationId = randomUUID();
      const res: Res = await http()
        .post(PUSH)
        .set("Content-Type", "application/json")
        .set(auth(session))
        .send(
          JSON.stringify({
            contractVersion: 1,
            operationId,
            projectionType: c.type,
            action,
            causal: { predecessorOperationId: pred, reconciliationReference: null },
            payload: {
              campaign_ref: ids.campaigns[c.campaign],
              product_ref: ids.products[c.product],
              base_unit: c.unit,
              ...(action === "CANCEL" ? {} : { quantity_base: c.quantity }),
            },
          }),
        );
      if (res.status !== 200 || res.body.outcome !== "APPLIED") throw new Error(`push ${action} ${res.status} ${JSON.stringify(res.body)}`);
      return operationId;
    }

    /** The oracle: current cells from the operations sent (not from the server). */
    function model(campaign: string) {
      const cells = new Map<string, { members: Set<string>; total: bigint; type: Projection; unit: string }>();
      for (const h of heads.values()) {
        const m = state.get(h.member)!;
        if (h.campaign !== campaign || !h.active || !m.active || m.role !== "AGRICULTOR") continue;
        const id = [h.type, canonical.get(h.product), h.unit].join("|");
        const cell = cells.get(id) ?? { members: new Set<string>(), total: 0n, type: h.type, unit: h.unit };
        cell.members.add(h.member);
        cell.total += h.quantity;
        cells.set(id, cell);
      }
      return cells;
    }
    const linked = () => [...state.values()].filter((m) => m.active && m.role === "AGRICULTOR").length;

    function csvSection(text: string, firstColumn: string) {
      const lines = text.trim().split("\n");
      const start = lines.findIndex((line) => line.startsWith(`${firstColumn},`));
      const header = lines[start]!.split(",");
      return lines
        .slice(start + 1)
        .filter((line) => line !== "")
        .map((line) => Object.fromEntries(line.split(",").map((v, i) => [header[i], v])));
    }

    async function readSummary(step: string, campaign: string, previousWithdrawn: number) {
      const ref = ids.campaigns[campaign]!;
      const json: Res = await http().get(`/api/v1/collective/campaigns/${ref}/summary`).set(auth(director));
      const csv: Res = await http().get(`/api/v1/collective/campaigns/${ref}/summary.csv`).set(auth(director));
      check(`${step} ${campaign} summary 200`, json.status === 200 && csv.status === 200, [json.status, csv.status]);
      const s = json.body;
      const where = `${step} ${campaign}`;
      check(`${where} threshold`, s.disclosure.threshold === K, s.disclosure);
      // Channel coherence: the CSV carries the same decisions as the JSON.
      const [head] = csvSection(csv.text, "campaign_ref");
      check(`${where} CSV header`, head!["threshold"] === String(K) &&
        head!["linked_members"] === String(s.coverage.linked_members) &&
        head!["members_with_contribution"] === String(s.coverage.members_with_contribution) &&
        head!["suppressed_cells"] === String(s.coverage.suppressed_cells), head);
      const rows = csvSection(csv.text, "projection_type");
      const fromCsv = rows.map((r) => [r["projection_type"], r["product_ref"], r["base_unit"], r["status"], r["total_base"] || null, r["contributors"] || null, r["pending_changes"]].join("|")).sort();
      const fromJson = (s.cells as any[]).map((c) => [c.projection_type, c.product_ref, c.base_unit, c.status, c.total_base, c.contributors === null ? null : String(c.contributors), String(c.pending_changes)].join("|")).sort();
      check(`${where} CSV = JSON`, JSON.stringify(fromCsv) === JSON.stringify(fromJson), { fromCsv, fromJson });

      const truth = model(campaign);
      const cells: CellRead[] = [];
      for (const c of s.cells as any[]) {
        const id = [c.projection_type, nameOf.get(c.product_ref), c.base_unit].join("|");
        const t = truth.get(id);
        cells.push({
          cell: id,
          members_now: t?.members.size ?? 0,
          total_now: (t?.total ?? 0n).toString(),
          status: c.status,
          contributors: c.contributors,
          total_base: c.total_base,
          pending_changes: c.pending_changes,
        });
        if (c.status === "DISCLOSED") {
          check(`${where} ${id} no figure under k`, c.contributors >= K, c);
          check(`${where} ${id} visible only with k current Members`, (t?.members.size ?? 0) >= K, { c, now: t?.members.size });
          const memory = `${campaign}|${id}`;
          if (!c.pending_changes) {
            check(`${where} ${id} exact when not pending`, t !== undefined && c.total_base === t.total.toString() && c.contributors === t.members.size, { c, t: t && { total: t.total.toString(), members: t.members.size } });
            // Releases happen only in these summary reads (the proposal decides nothing new): this is the cell's latest release.
            if (t) released.set(memory, { total: t.total.toString(), members: new Set(t.members) });
          } else {
            // A figure kept from before: exactly the last one released for this cell, never a recomputed or foreign one.
            const prior = released.get(memory);
            check(`${where} ${id} pending shows its last release`, prior !== undefined && c.total_base === prior.total && c.contributors === prior.members.size, { c, prior: prior && { total: prior.total, members: prior.members.size } });
          }
        }
        if (c.status === "SUPPRESSED_UNDER_THRESHOLD") check(`${where} ${id} under threshold`, (t?.members.size ?? 0) < K, { now: t?.members.size });
        if (t === undefined) check(`${where} ${id} without contributions is withdrawn`, c.status === "SUPPRESSED_REVISION", c);
      }
      for (const id of truth.keys()) check(`${where} ${id} present`, cells.some((c) => c.cell === id), id);
      check(`${where} linked`, s.coverage.linked_members === linked(), [s.coverage.linked_members, linked()]);
      const disclosed = cells.filter((c) => c.status === "DISCLOSED");
      // «N de M con cifras publicadas»: a new figure counts its current Members; a kept one, those of its release.
      const inside = new Set(
        disclosed.flatMap((c) => [...(c.pending_changes ? released.get(`${campaign}|${c.cell}`)?.members ?? [] : truth.get(c.cell)?.members ?? [])]),
      );
      check(`${where} members_with_contribution`, s.coverage.members_with_contribution === inside.size, [s.coverage.members_with_contribution, inside.size]);
      const withdrawn = await prisma.collectiveRelease.count({ where: { campaignId: ref, withdrawnAt: { not: null } } });
      const releases = await prisma.collectiveRelease.count({ where: { campaignId: ref } });
      const litres = (unit: string, visible: boolean) =>
        cells
          .filter((c) => c.cell.startsWith("DECLARED_NEED|") && c.cell.endsWith(`|${unit}`))
          .reduce((sum, c) => sum + BigInt(visible ? (c.status === "DISCLOSED" ? c.total_base! : "0") : c.total_now), 0n)
          .toString();
      const count = (status: string) => cells.filter((c) => c.status === status).length;
      return {
        summary: s,
        metrics: {
          step,
          campaign,
          linked_members: s.coverage.linked_members,
          members_with_contribution: s.coverage.members_with_contribution,
          suppressed_cells: s.coverage.suppressed_cells,
          distribution: [...truth.entries()].map(([id, t]) => ({ cell: id, members: t.members.size })).sort((a, b) => b.members - a.members || a.cell.localeCompare(b.cell)),
          cells: cells.length,
          disclosed: disclosed.length,
          disclosed_pending: disclosed.filter((c) => c.pending_changes).length,
          suppressed_under_threshold: count("SUPPRESSED_UNDER_THRESHOLD"),
          suppressed_revision: count("SUPPRESSED_REVISION"),
          overflow: count("OVERFLOW"),
          withdrawn_total: withdrawn,
          withdrawn_in_step: withdrawn - previousWithdrawn,
          releases_total: releases,
          need_ml_declared: litres("ML", false),
          need_ml_visible: litres("ML", true),
          need_g_declared: litres("G", false),
          need_g_visible: litres("G", true),
          min_contributors_published: disclosed.length ? Math.min(...disclosed.map((c) => c.contributors!)) : null,
          published_with_exactly_k: disclosed.filter((c) => c.contributors === K).length,
          detail: cells.sort((a, b) => a.cell.localeCompare(b.cell)),
        },
      };
    }

    const reads: unknown[] = [];
    const proposals: unknown[] = [];
    const withdrawnSoFar = new Map(scenario.campaigns.map((c) => [c, 0]));

    /**
     * The joint proposal of the same state, right after the summary read: its
     * lines must be the summary's DECLARED_NEED cells, its CSV its lines, and
     * generating it must not decide anything new (no release, no withdrawal).
     */
    async function propose(step: string, campaign: string, read: Awaited<ReturnType<typeof readSummary>>) {
      const ref = ids.campaigns[campaign]!;
      const where = `${step} ${campaign}`;
      const draft: Res = await http().post(`/api/v1/collective/campaigns/${ref}/proposals`).set(auth(director));
      check(`${where} proposal 201`, draft.status === 201, draft.body);
      const file: Res = await http().get(`/api/v1/collective/proposals/${draft.body.proposal_ref}/csv`).set(auth(director));
      check(`${where} proposal CSV 200`, file.status === 200, file.status);
      const s = read.summary;
      const lines = draft.body.lines as any[];
      const needCells = (s.cells as any[]).filter((c) => c.projection_type === "DECLARED_NEED");
      check(`${where} proposal = summary`,
        JSON.stringify(lines.map((l) => [l.product_ref, l.base_unit, l.status, l.quantity_base, l.contributors, l.pending_changes]).sort()) ===
          JSON.stringify(needCells.map((c) => [c.product_ref, c.base_unit, c.status, c.total_base, c.contributors, c.pending_changes]).sort()),
        { lines, needCells });
      const rows = csvSection(file.text, "position");
      check(`${where} proposal CSV = JSON`,
        JSON.stringify(rows.map((r) => [r["product_ref"], r["status"], r["quantity_base"] || null]).sort()) ===
          JSON.stringify(lines.map((l) => [l.product_ref, l.status, l.quantity_base]).sort()),
        rows);
      check(`${where} proposal coverage`,
        draft.body.coverage.linked_members === s.coverage.linked_members &&
          draft.body.coverage.members_with_contribution === s.coverage.members_with_contribution,
        [draft.body.coverage, s.coverage]);
      const releases = await prisma.collectiveRelease.count({ where: { campaignId: ref } });
      const withdrawn = await prisma.collectiveRelease.count({ where: { campaignId: ref, withdrawnAt: { not: null } } });
      check(`${where} proposal decides nothing new`,
        releases === read.metrics.releases_total && withdrawn === read.metrics.withdrawn_total,
        [releases, withdrawn, read.metrics.releases_total, read.metrics.withdrawn_total]);
      const sum = (unit: string) =>
        lines.filter((l) => l.base_unit === unit && l.quantity_base !== null).reduce((acc, l) => acc + BigInt(l.quantity_base), 0n).toString();
      const hidden = lines.filter((l) => l.quantity_base === null);
      proposals.push({
        step,
        campaign,
        lines: lines.length,
        lines_with_figure: lines.length - hidden.length,
        lines_hidden: hidden.length,
        hidden_by_status: Object.fromEntries([...new Set(hidden.map((l) => l.status as string))].map((st) => [st, hidden.filter((l) => l.status === st).length])),
        lines_pending: lines.filter((l) => l.pending_changes).length,
        covered_ml: sum("ML"),
        covered_g: sum("G"),
        declared_ml: read.metrics.need_ml_declared,
        declared_g: read.metrics.need_g_declared,
        coverage: draft.body.coverage,
      });
    }

    /** After each step: summary JSON and CSV, then the proposal and its CSV, per campaign. */
    async function readAll(step: string) {
      for (const campaign of scenario.campaigns) {
        const r = await readSummary(step, campaign, withdrawnSoFar.get(campaign)!);
        withdrawnSoFar.set(campaign, r.metrics.withdrawn_total);
        reads.push(r.metrics);
        await propose(step, campaign, r);
      }
    }

    // E1: every head published (a D4 cancellation: published, then cancelled).
    for (const c of scenario.contributions) {
      const op = await push(sessions[c.member]!, c, "PUBLISH", null);
      const head: Head = { ...c, quantity: BigInt(c.quantity), active: true, lastOperation: op };
      if (c.cancelled) {
        head.lastOperation = await push(sessions[c.member]!, c, "CANCEL", op);
        head.active = false;
      }
      heads.set(keyOf(c), head);
    }
    await readAll(STEPS[0]);

    // E2: one contributor replaces its value (a net change of one Member).
    const target = heads.get(keyOf(scenario.steps.supersede))!;
    target.lastOperation = await push(sessions[target.member]!, scenario.steps.supersede, "SUPERSEDE", target.lastOperation);
    target.quantity = BigInt(scenario.steps.supersede.quantity);
    await readAll(STEPS[1]);

    // E3: the Directiva associates a denomination with its canonical product (W3).
    const association: Res = await http()
      .post("/api/v1/collective/product-associations")
      .set(auth(director))
      .send({
        productId: ids.products[scenario.steps.associate.product],
        canonicalProductId: ids.products[scenario.steps.associate.canonical],
        reason: "Comparación sintética de umbrales (F07-POL-01)",
        confirmed: true,
      });
    check("E3 association 200", association.status === 200, association.body);
    canonical.set(scenario.steps.associate.product, scenario.steps.associate.canonical);
    await readAll(STEPS[2]);

    // E4: the Administrador deactivates a contributing farmer.
    const off: Res = await http().patch(`/api/v1/users/${ids.members[scenario.steps.deactivate]!.userId}/deactivate`).set(auth(admin));
    check("E4 deactivate 200", off.status === 200, off.body);
    state.get(scenario.steps.deactivate)!.active = false;
    await readAll(STEPS[3]);

    // E5: the Administrador changes a contributing farmer to DIRECTIVA (M5).
    const role: Res = await http().patch(`/api/v1/users/${ids.members[scenario.steps.roleChange]!.userId}`).set(auth(admin)).send({ role: "DIRECTIVA" });
    check("E5 role change 200", role.status === 200, role.body);
    state.get(scenario.steps.roleChange)!.role = "DIRECTIVA";
    await readAll(STEPS[4]);

    run.scenarios.push({
      id: scenario.id,
      origin: scenario.origin,
      source: scenario.source,
      database: db,
      postgres: version,
      linked_initial: scenario.members.length,
      contributing_initial: new Set(scenario.contributions.filter((c) => !c.cancelled).map((c) => c.member)).size,
      steps: scenario.steps,
      reads,
      proposals,
      failures,
    });
    return failures;
  } finally {
    await app.close();
  }
}

/** Identity, campaign and catalogue only; contributions go through the API. */
async function seed(prisma: PrismaService, scenario: Scenario) {
  const tenantId = randomUUID();
  await prisma.tenant.create({ data: { id: tenantId, name: `Comparación k ${scenario.id}`, slug: `f07k-${scenario.id.toLowerCase()}-${tenantId}` } });
  async function person(code: string, role: "AGRICULTOR" | "DIRECTIVA" | "ADMINISTRADOR") {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: `Sintético ${code}`, email: `${code.toLowerCase()}-${userId}@example.test`,
        passwordHash: unusablePasswordHash(), role, members: { create: { id: memberId, tenantId, role } },
      },
    });
    return { userId, memberId };
  }
  const members: Record<string, { userId: string; memberId: string }> = {};
  for (const code of scenario.members) members[code] = await person(code, "AGRICULTOR");
  const director = (await person("directiva", "DIRECTIVA")).memberId;
  const admin = (await person("administrador", "ADMINISTRADOR")).memberId;
  const campaigns: Record<string, string> = {};
  for (const name of scenario.campaigns) {
    campaigns[name] = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id: campaigns[name], tenantId, name, status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
    });
  }
  const products: Record<string, string> = {};
  for (const p of scenario.products) products[p.name] = (await prisma.product.create({ data: { tenantId, name: p.name, unit: p.unit } })).id;
  return { tenantId, members, director, admin, campaigns, products };
}
