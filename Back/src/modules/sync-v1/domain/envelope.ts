import type {
  SyncV1Action,
  SyncV1BaseUnit,
  SyncV1ProjectionType,
} from "@prisma/client";
import { isJsonObject, JsonNumber, StrictJsonValue } from "./strict-json";

/** Closed envelope of contract §4, already validated. */
export interface SyncV1Envelope {
  contractVersion: 1;
  operationId: string;
  projectionType: SyncV1ProjectionType;
  action: SyncV1Action;
  causal: {
    predecessorOperationId: string | null;
    reconciliationReference: string | null;
  };
  payload: {
    campaign_ref: string;
    product_ref: string;
    base_unit: SyncV1BaseUnit;
    /** Decimal string; null only for CANCEL (absent on the wire). */
    quantity_base: string | null;
  };
}

export type RequestErrorCode =
  | "INVALID_REQUEST"
  | "FIELD_NOT_ALLOWED"
  | "CONTRACT_VERSION_MISMATCH";

export type EnvelopeValidation =
  | { ok: true; envelope: SyncV1Envelope }
  | { ok: false; status: 400 | 422; errorCode: RequestErrorCode };

export const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Central references: canonical lowercase RFC 9562 form, any version. */
export const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** `0` or `[1-9][0-9]*`: no sign, exponent, fraction, spaces or leading zeros. */
export const QUANTITY_FORMAT = /^(0|[1-9][0-9]*)$/;
/** SQLite INTEGER maximum (contract §4). */
export const QUANTITY_MAX = 9223372036854775807n;

const ENVELOPE_KEYS = [
  "contractVersion",
  "operationId",
  "projectionType",
  "action",
  "causal",
  "payload",
] as const;
const CAUSAL_KEYS = ["predecessorOperationId", "reconciliationReference"];
const VALUED_PAYLOAD_KEYS = [
  "campaign_ref",
  "product_ref",
  "base_unit",
  "quantity_base",
];
const CANCEL_PAYLOAD_KEYS = ["campaign_ref", "product_ref", "base_unit"];
const PROJECTION_TYPES = new Set(["CONSUMPTION_TOTAL", "DECLARED_NEED"]);
const ACTIONS = new Set(["PUBLISH", "SUPERSEDE", "CANCEL"]);
const BASE_UNITS = new Set(["ML", "G"]);

class Rejection {
  constructor(
    readonly status: 400 | 422,
    readonly errorCode: RequestErrorCode,
  ) {}
}

const invalid = () => new Rejection(400, "INVALID_REQUEST");
const notAllowed = () => new Rejection(400, "FIELD_NOT_ALLOWED");

/** Unknown keys first (FIELD_NOT_ALLOWED), then missing keys (INVALID_REQUEST). */
function closedObject(
  value: StrictJsonValue | undefined,
  allowed: readonly string[],
): { [key: string]: StrictJsonValue } {
  if (value === undefined || !isJsonObject(value)) throw invalid();
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) throw notAllowed();
  if (allowed.some((key) => !(key in value))) throw invalid();
  return value;
}

function uuid(value: StrictJsonValue, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw invalid();
  return value;
}

function nullableUuidV4(value: StrictJsonValue): string | null {
  return value === null ? null : uuid(value, UUID_V4);
}

function oneOf<T extends string>(value: StrictJsonValue, allowed: Set<string>) {
  if (typeof value !== "string" || !allowed.has(value)) throw invalid();
  return value as T;
}

/**
 * Validates the parsed body. A `contractVersion` integer other than 1 is a
 * 422 before any other shape check: a different version may have a different
 * shape, and it is never reinterpreted as v1 (contract §9, §14).
 */
export function validateEnvelope(body: StrictJsonValue): EnvelopeValidation {
  try {
    if (!isJsonObject(body)) throw invalid();
    const version = body["contractVersion"];
    if (!(version instanceof JsonNumber) || !version.isIntegerLiteral)
      throw invalid();
    if (version.raw !== "1")
      throw new Rejection(422, "CONTRACT_VERSION_MISMATCH");

    const envelope = closedObject(body, ENVELOPE_KEYS);
    const operationId = uuid(envelope["operationId"], UUID_V4);
    const projectionType = oneOf<SyncV1ProjectionType>(
      envelope["projectionType"],
      PROJECTION_TYPES,
    );
    const action = oneOf<SyncV1Action>(envelope["action"], ACTIONS);
    const causal = closedObject(envelope["causal"], CAUSAL_KEYS);
    const payload = closedObject(
      envelope["payload"],
      action === "CANCEL" ? CANCEL_PAYLOAD_KEYS : VALUED_PAYLOAD_KEYS,
    );

    let quantity: string | null = null;
    if (action !== "CANCEL") {
      const raw = payload["quantity_base"];
      if (typeof raw !== "string" || !QUANTITY_FORMAT.test(raw))
        throw invalid();
      quantity = raw;
    }
    return {
      ok: true,
      envelope: {
        contractVersion: 1,
        operationId,
        projectionType,
        action,
        causal: {
          predecessorOperationId: nullableUuidV4(
            causal["predecessorOperationId"],
          ),
          reconciliationReference: nullableUuidV4(
            causal["reconciliationReference"],
          ),
        },
        payload: {
          campaign_ref: uuid(payload["campaign_ref"], CANONICAL_UUID),
          product_ref: uuid(payload["product_ref"], CANONICAL_UUID),
          base_unit: oneOf<SyncV1BaseUnit>(payload["base_unit"], BASE_UNITS),
          quantity_base: quantity,
        },
      },
    };
  } catch (error) {
    if (error instanceof Rejection)
      return { ok: false, status: error.status, errorCode: error.errorCode };
    throw error;
  }
}

/** Quantity inside the closed format but beyond int64 is QUANTITY_INVALID (§4). */
export function quantityInRange(quantity: string): boolean {
  return BigInt(quantity) <= QUANTITY_MAX;
}
