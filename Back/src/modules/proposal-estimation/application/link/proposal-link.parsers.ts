import { HttpException, HttpStatus } from "@nestjs/common";
import { Prisma, SyncV1BaseUnit } from "@prisma/client";
import { createHash } from "node:crypto";
import { canonicalJson } from "@/modules/estimation/domain/run-content";
import { EstimationReadsUseCase } from "@/modules/estimation/application/estimation-reads.use-case";

export type Tx = Prisma.TransactionClient;
export type Mode = "INITIAL" | "UPDATE";
export type Action = "LINK_EXISTING_RUN" | "REUSE_JOB" | "REQUEST_JOB" | "CLEAR";
export type PrepareOutcome =
  | "EXISTING"
  | "LINKED_EXISTING_RUN"
  | "REUSED_JOB"
  | "REQUESTED_JOB"
  | "CLEARED"
  | "NOT_CALCULABLE";
export type NotCalculableReason =
  | "TARGET_CAMPAIGN_NOT_ELIGIBLE"
  | "TARGET_CAMPAIGN_NOT_CLASSIFIED"
  | "NO_ESTIMABLE_PRODUCTS";
export type UpdateReason = "NEWER_RUN" | "OUTDATED" | "FAILED" | "NOT_EXECUTED" | "INCOMPLETE";

export const LINK_NOTICE =
  "Consumo estimado: referencia fijada para este borrador. No se suma a la necesidad declarada ni a la cantidad confirmada en una convocatoria, no cambia las líneas ni la huella del borrador y sólo se actualiza a pedido.";

export const OUTCOME_OF: Record<Action, PrepareOutcome> = {
  LINK_EXISTING_RUN: "LINKED_EXISTING_RUN",
  REUSE_JOB: "REUSED_JOB",
  REQUEST_JOB: "REQUESTED_JOB",
  CLEAR: "CLEARED",
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TRANSACTION = { maxWait: 10_000, timeout: 60_000 } as const;
export const MAX_SELECTION = 200;

/** Closed error body of the E3 routes: `{ errorCode, view? | selection? }`; nothing from the request is echoed. */
export class LinkHttpError extends HttpException {
  constructor(status: number, errorCode: string, extra: Record<string, unknown> = {}) {
    super({ errorCode, ...extra }, status);
  }
}

export const invalid = () => new LinkHttpError(HttpStatus.BAD_REQUEST, "PAYLOAD_INVALID");
export const notFound = () => new LinkHttpError(HttpStatus.NOT_FOUND, "PROPOSAL_NOT_FOUND");

/** A conflict decided inside the transaction; the view is rendered after it rolls back. */
export class ConflictWithView extends Error {
  constructor(readonly errorCode: "REFERENCE_CHANGED" | "REFERENCE_UP_TO_DATE") {
    super(errorCode);
  }
}

export interface ProposalHead {
  id: string;
  tenantId: string;
  campaignId: string;
  lines: { position: number; canonicalProductId: string; baseUnit: SyncV1BaseUnit }[];
}

export interface EstimableLine {
  position: number;
  productId: string;
  baseUnit: SyncV1BaseUnit;
}

export const LINK_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  run: { select: { id: true, outcome: true, failureCode: true } },
  job: {
    select: {
      id: true,
      status: true,
      stopCode: true,
      run: { select: { id: true, outcome: true, failureCode: true } },
    },
  },
} satisfies Prisma.JointPurchaseProposalEstimationLinkInclude;

export type StoredLink = Prisma.JointPurchaseProposalEstimationLinkGetPayload<{ include: typeof LINK_INCLUDE }>;
export type RunFacts = NonNullable<Awaited<ReturnType<EstimationReadsUseCase["resultFacts"]>>>;

export function hashOf(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid();
}

export function parsePrepare(body: unknown): { requestId: string; mode: Mode; expectedLinkRef: string | null } {
  if (!isRecord(body)) throw invalid();
  onlyKeys(body, ["request_id", "mode", "expected_link_ref"]);
  const { request_id: requestId, mode, expected_link_ref: expected } = body;
  if (typeof requestId !== "string" || !UUID.test(requestId)) throw invalid();
  if (mode !== "INITIAL" && mode !== "UPDATE") throw invalid();
  if (expected !== undefined && expected !== null && (typeof expected !== "string" || !UUID.test(expected))) throw invalid();
  if (mode === "UPDATE" && typeof expected !== "string") throw invalid();
  return { requestId: requestId.toLowerCase(), mode, expectedLinkRef: typeof expected === "string" ? expected.toLowerCase() : null };
}

export function parseClear(body: unknown): { requestId: string; expectedLinkRef: string } {
  if (!isRecord(body)) throw invalid();
  onlyKeys(body, ["request_id", "expected_link_ref"]);
  const { request_id: requestId, expected_link_ref: expected } = body;
  if (typeof requestId !== "string" || !UUID.test(requestId)) throw invalid();
  if (typeof expected !== "string" || !UUID.test(expected)) throw invalid();
  return { requestId: requestId.toLowerCase(), expectedLinkRef: expected.toLowerCase() };
}

export function parseSelection(body: unknown): { expectedRevision: number; productRefs: string[] } {
  if (!isRecord(body)) throw invalid();
  onlyKeys(body, ["expected_revision", "product_refs"]);
  const { expected_revision: revision, product_refs: refs } = body;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) throw invalid();
  if (!Array.isArray(refs) || refs.length > MAX_SELECTION) throw invalid();
  if (refs.some((ref) => typeof ref !== "string" || ref.length < 1 || ref.length > 64)) throw invalid();
  if (new Set(refs).size !== refs.length) throw invalid();
  return { expectedRevision: revision, productRefs: refs as string[] };
}
