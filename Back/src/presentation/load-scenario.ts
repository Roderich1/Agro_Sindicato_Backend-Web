import { ConfigService } from "@nestjs/config";
import { Prisma, UserRole } from "@prisma/client";
import { hash } from "bcrypt";
import { randomBytes, randomUUID } from "node:crypto";
import { CampaignContextService } from "../modules/campaigns/application/services/campaign-context.service";
import { CampaignManagementUseCase } from "../modules/campaigns/application/use-cases/campaign-management.use-case";
import { CollectiveConfig } from "../modules/collective/application/collective-config";
import { CollectiveSealUseCase } from "../modules/collective/application/collective-seal.use-case";
import { CollectiveSummaryUseCase } from "../modules/collective/application/collective-summary.use-case";
import { EstimationClassificationsUseCase } from "../modules/estimation/application/estimation-classifications.use-case";
import { EstimationConfig } from "../modules/estimation/application/estimation-config";
import { EstimationJobsUseCase } from "../modules/estimation/application/estimation-jobs.use-case";
import type { AuthenticatedPrincipal } from "../modules/iam/application/types/authenticated-principal.type";
import { CallClosingService } from "../modules/joint-purchase-calls/application/call-closing.service";
import { FarmerParticipationUseCase } from "../modules/joint-purchase-calls/application/farmer-participation.use-case";
import { InstitutionalCallsUseCase } from "../modules/joint-purchase-calls/application/institutional-calls.use-case";
import { PushOperationUseCase } from "../modules/sync-v1/application/push-operation.use-case";
import { SyncV1Config } from "../modules/sync-v1/application/sync-v1-config";
import type { SyncV1Envelope } from "../modules/sync-v1/domain/envelope";
import type { PrismaService } from "../shared/infrastructure/persistence/prisma/prisma.service";
import {
  accounts, campaignPeriods, DATASET, daysFrom, figures, mobileAccount, products, SEASON_DAYS, TENANT_NAME,
} from "./scenario";

type Tx = Prisma.TransactionClient;
export type Credential = { email: string; role: UserRole; password: string };
type Farmer = AuthenticatedPrincipal & { sessionId: string; registrationId: string };

/** Wait for each application operation before starting the next one on the same transaction. */
async function inOrder<T, Result>(items: readonly T[], run: (item: T, index: number) => Promise<Result>): Promise<Result[]> {
  const results: Result[] = [];
  await items.reduce((previous, item, index) => previous.then(async () => {
    results.push(await run(item, index));
  }), Promise.resolve());
  return results;
}

export async function newAccounts() {
  return Promise.all(accounts.map(async (account) => {
    const password = randomBytes(24).toString("base64url");
    return { ...account, password, passwordHash: await hash(password, 12) };
  }));
}

/** Existing application transactions share the encompassing, all-or-nothing installation transaction. */
function scopedClient(tx: Tx): PrismaService {
  return new Proxy(tx, {
    get(target, key, receiver) {
      if (key === "$transaction") return <T>(run: (client: Tx) => Promise<T>) => run(tx);
      return Reflect.get(target, key, receiver);
    },
  }) as unknown as PrismaService;
}

export function configuredSync() {
  const version = Number(process.env.SYNC_V1_FINGERPRINT_KEY_VERSION);
  const config = new SyncV1Config(new ConfigService({
    NODE_ENV: "production",
    SYNC_V1_PRODUCTION_ADMISSION: process.env.SYNC_V1_PRODUCTION_ADMISSION,
    SYNC_V1_FINGERPRINT_KEY: process.env.SYNC_V1_FINGERPRINT_KEY,
    SYNC_V1_FINGERPRINT_KEY_VERSION: version,
  }));
  if (!config.admissionOpen) throw new Error("Configure la clave, versión y admisión explícita de Sync v1 para la carga.");
  return config;
}

async function fixtureSessions(tx: Tx, farmers: AuthenticatedPrincipal[]): Promise<Farmer[]> {
  return Promise.all(farmers.map(async (farmer) => {
    const client = await tx.clientRegistration.create({ data: {
      tenantId: farmer.tenantId, memberId: farmer.memberId, clientIdHash: randomBytes(32).toString("hex"),
    } });
    const session = await tx.authSession.create({ data: {
      memberId: farmer.memberId, clientRegistrationId: client.id, refreshTransport: "BODY",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    } });
    return { ...farmer, sessionId: session.id, registrationId: client.id };
  }));
}

async function retireFixtureSessions(tx: Tx, sessions: Farmer[]) {
  const retired = { status: "REVOKED" as const, revokedAt: new Date() };
  await tx.authSession.updateMany({ where: { id: { in: sessions.map((session) => session.sessionId) } }, data: retired });
  await tx.clientRegistration.updateMany({ where: { id: { in: sessions.map((session) => session.registrationId) } }, data: retired });
}

async function publish(
  push: PushOperationUseCase, farmer: Farmer, campaign: string, product: { id: string; baseUnit: "ML" | "G" },
  type: SyncV1Envelope["projectionType"], quantity: number | null, predecessor: string | null = null,
) {
  const operationId = randomUUID();
  const result = await push.execute(farmer, {
    contractVersion: 1,
    operationId,
    projectionType: type,
    action: quantity === null ? "CANCEL" : "PUBLISH",
    causal: { predecessorOperationId: predecessor, reconciliationReference: null },
    payload: {
      campaign_ref: campaign, product_ref: product.id, base_unit: product.baseUnit,
      quantity_base: quantity === null ? null : String(quantity),
    },
  });
  if (result.outcome !== "APPLIED") throw new Error(`La carga recibió un acuse inesperado: ${result.code}.`);
  return operationId;
}

export async function loadScenario(tx: Tx, slug: string, reference: Date, users: Awaited<ReturnType<typeof newAccounts>>, sync: SyncV1Config) {
  const db = scopedClient(tx);
  const tenant = await tx.tenant.create({ data: { name: TENANT_NAME, slug } });
  const tenantId = tenant.id;
  const principals = await Promise.all(users.map(async ({ name, email, role, passwordHash }): Promise<AuthenticatedPrincipal> => {
    const user = await tx.user.create({ data: { name, email, role, passwordHash, tenantId,
      members: { create: { tenantId, role } },
    }, include: { members: true } });
    return { sub: user.id, email, tenantId, role, memberId: user.members[0].id, tokenVersion: 2 };
  }));
  const [admin, director, , ...farmers] = principals;
  const actor = { tenantId, userId: director.sub };
  const sessions = await fixtureSessions(tx, farmers.slice(0, -1));
  const catalog = await Promise.all(products.map(async ({ baseUnit, ...product }) =>
    ({ ...await tx.product.create({ data: { ...product, tenantId } }), baseUnit }),
  ));

  const mode = new CollectiveConfig();
  const summary = new CollectiveSummaryUseCase(db, mode);
  const seal = new CollectiveSealUseCase(db, mode, summary);
  const campaigns = new CampaignManagementUseCase(db, new CampaignContextService(db), seal);
  const clock = { now: () => new Date() };
  const calls = new InstitutionalCallsUseCase(db, mode, new CallClosingService(db, clock), clock);
  const participants = new FarmerParticipationUseCase(db, clock);
  const classification = new EstimationClassificationsUseCase(db);
  const season = await classification.createSeason(director, {
    key: "Ciclo anual", definition: "Ventana agrícola anual de la misma duración y época del calendario.", durationDays: SEASON_DAYS,
  });
  const push = new PushOperationUseCase(db, sync);
  const periods = campaignPeriods(reference);
  const deadline = daysFrom(reference, 14).toISOString();
  // There can be only one open campaign. Finish and seal each historical one before opening the next.
  const review = await inOrder(periods, async (period, index) => {
    const c = await campaigns.createCampaign(tenantId, admin.sub, admin.role, period);
    await campaigns.openCampaign(tenantId, director.sub, director.role, c.id);
    let withdrawalHead: string | undefined;
    await inOrder(figures(index), async (spec) => {
      const operation = await publish(push, sessions[spec.farmer], c.id, catalog[spec.product], spec.projectionType, spec.base);
      if (index === 1 && spec.product === 4 && spec.farmer === 0 && spec.projectionType === "CONSUMPTION_TOTAL") withdrawalHead = operation;
    });
    const call = await seedCalls(calls, participants, { actor, admin, campaign: c.id, index, catalog, farmers, deadline });
    if (period.historical) await campaigns.closeCampaign(tenantId, director.sub, director.role, c.id);
    if (withdrawalHead) await publish(push, sessions[0], c.id, catalog[4], "CONSUMPTION_TOTAL", null, withdrawalHead);
    await classification.classify(director, { campaignId: c.id, seasonId: season.season.season_ref });
    const view = await summary.execute(tenantId, c.id);
    const published = view.cells.filter((cell) => cell.status === "DISCLOSED");
    const records = await tx.syncV1Contribution.groupBy({ by: ["projectionType", "status"], where: { tenantId, campaignId: c.id }, _count: true });
    const callRows = await tx.jointPurchaseCall.findMany({
      where: { tenantId, campaignId: c.id },
      select: { id: true, name: true, status: true, _count: { select: { participations: true } } },
    });
    return {
      id: c.id, name: c.name, start: period.startDate.toISOString().slice(0, 10),
      estimatedEnd: period.estimatedEndDate.toISOString().slice(0, 10), status: view.campaign.status,
      historicalVersion: view.seal?.version ?? null, coverage: view.coverage,
      contributions: records, publishedNeedCells: published.filter((cell) => cell.projection_type === "DECLARED_NEED").length,
      publishedConsumptionCells: published.filter((cell) => cell.projection_type === "CONSUMPTION_TOTAL").length,
      explicitZeroCells: published.filter((cell) => cell.total_base === "0").length,
      withdrawnHistoricalCells: view.cells.filter((cell) => cell.status === "WITHDRAWN_AFTER_SEAL").length,
      calls: callRows, participationWithdrawals: call,
    };
  });
  await retireFixtureSessions(tx, sessions);
  const estimation = new EstimationJobsUseCase(db, new EstimationConfig(new ConfigService()), mode);
  const queued = await estimation.request(director, { requestId: randomUUID(), targetCampaignId: review.at(-1)!.id });
  return { tenant, report: {
    dataset: DATASET, source: "FICTIONAL_PRESENTATION", referenceDate: reference.toISOString().slice(0, 10),
    accounts: { ADMINISTRADOR: 1, DIRECTIVA: 2, AGRICULTOR: 24 }, products: catalog.length,
    freshMobileAccount: mobileAccount.email, campaigns: review, estimationJob: queued.job.job_ref,
  } };
}

async function seedCalls(
  calls: InstitutionalCallsUseCase, participation: FarmerParticipationUseCase,
  { actor, admin, campaign, index, catalog, farmers, deadline }: {
    actor: { tenantId: string; userId: string }; admin: AuthenticatedPrincipal;
    campaign: string; index: number; catalog: { id: string }[]; farmers: AuthenticatedPrincipal[]; deadline: string;
  },
) {
  const manage = { tenantId: actor.tenantId, userId: admin.sub };
  const draft = (name: string, productIndexes: number[]) => calls.create(actor, {
    campaign_id: campaign, name, deadline_at: deadline,
    products: productIndexes.map((product) => ({ product_ref: catalog[product].id })),
  });
  if (index === 0) {
    const call = await draft("Insumos de nutrición foliar", [0, 3]);
    await calls.open(manage, call.call_id, { confirmed: true });
    await confirmRequests(participation, call.call_id, farmers.slice(0, 7), catalog[0].id);
    await participation.withdraw(farmers[6], call.call_id, { operation_id: randomUUID(), sequence: 2 });
    await calls.close(manage, call.call_id, { confirmed: true });
    return 1;
  }
  if (index === 2) {
    const call = await draft("Abastecimiento de acondicionadores", [9, 11]);
    await calls.open(manage, call.call_id, { confirmed: true });
    await confirmRequests(participation, call.call_id, farmers.slice(4, 6), catalog[9].id);
    await calls.cancel(actor, call.call_id, { confirmed: true, reason: "La compra se reprogramó para el siguiente ciclo." });
  }
  if (index === 4) {
    const open = await draft("Compra conjunta de nutrición mineral", [1, 10]);
    await calls.open(manage, open.call_id, { confirmed: true });
    await confirmRequests(participation, open.call_id, farmers.slice(0, 8), catalog[1].id);
    await draft("Compra conjunta de insumos foliares", [0, 6, 12]);
  }
  return 0;
}

async function confirmRequests(participation: FarmerParticipationUseCase, call: string, farmers: AuthenticatedPrincipal[], product: string) {
  await inOrder(farmers, async (farmer, index) => {
    await participation.confirm(farmer, call, {
      operation_id: randomUUID(), sequence: 1,
      consent: { version: "CONV-4", accepted_at: new Date().toISOString() },
      lines: [{ product_ref: product, quantity_base: String(4500 + index * 750) }],
    });
    if (index % 3 === 1) {
      await participation.decideConsent(farmer, call, {
        operation_id: randomUUID(), sequence: 1, scope: "TOTALS_ONLY",
        consent: { version: "CONV-4", decided_at: new Date().toISOString() },
      });
    }
  });
}
