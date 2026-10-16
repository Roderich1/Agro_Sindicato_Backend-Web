import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

const uuid: SchemaObject = { type: "string", format: "uuid" };
const nullableUuid: SchemaObject = { ...uuid, nullable: true };

/** Contract §4: closed envelope; the server parses it strictly (no duplicates). */
export const syncV1EnvelopeSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "operationId", "projectionType", "action", "causal", "payload"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    operationId: { ...uuid, description: "UUID v4 lowercase, generado una vez por intención." },
    projectionType: { type: "string", enum: ["CONSUMPTION_TOTAL", "DECLARED_NEED"] },
    action: { type: "string", enum: ["PUBLISH", "SUPERSEDE", "CANCEL"] },
    causal: {
      type: "object",
      additionalProperties: false,
      required: ["predecessorOperationId", "reconciliationReference"],
      properties: {
        predecessorOperationId: nullableUuid,
        reconciliationReference: nullableUuid,
      },
    },
    payload: {
      type: "object",
      additionalProperties: false,
      required: ["campaign_ref", "product_ref", "base_unit"],
      description: "PUBLISH/SUPERSEDE exigen quantity_base; CANCEL no lo admite.",
      properties: {
        campaign_ref: uuid,
        product_ref: uuid,
        base_unit: { type: "string", enum: ["ML", "G"] },
        quantity_base: {
          type: "string",
          pattern: "^(0|[1-9][0-9]*)$",
          description: "Entero exacto como texto decimal; máximo 9223372036854775807.",
        },
      },
    },
  },
};

/** Contract §7: exactly seven keys. */
export const syncV1AckSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "operationId", "outcome", "disposition", "serverAcceptedAt", "code", "reconciliationReference"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    operationId: uuid,
    outcome: { type: "string", enum: ["APPLIED", "ALREADY_APPLIED", "CONFLICT", "REJECTED", "RETRYABLE"] },
    disposition: { type: "string", enum: ["RETIRE_FROM_OUTBOX", "KEEP_FOR_RETRY", "KEEP_FOR_RECONCILIATION", "MOVE_TO_TERMINAL_FAILURE"] },
    serverAcceptedAt: { type: "string", format: "date-time", nullable: true },
    code: {
      type: "string",
      enum: [
        "OK", "CAUSAL_FORK", "STALE_PREDECESSOR", "CANCELLED_PREDECESSOR", "RECONCILIATION_STALE",
        "IDEMPOTENCY_MISMATCH", "CAMPAIGN_NOT_OPEN", "REFERENCE_UNAVAILABLE", "UNIT_INCOMPATIBLE",
        "QUANTITY_INVALID", "INVALID_PREDECESSOR", "INVALID_TRANSITION", "OWNERSHIP_NOT_PROVEN",
        "PURPOSE_NOT_AUTHORIZED", "CAUSAL_FENCED", "OPERATION_IN_PROGRESS", "DEPENDENCY_PENDING",
        "TRANSIENT_UNAVAILABLE",
      ],
    },
    reconciliationReference: nullableUuid,
  },
};

/** Contract §9: exactly four keys; operationId is always null. */
export const syncV1ErrorSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "operationId", "errorCode", "disposition"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    operationId: { type: "string", nullable: true, enum: [null] },
    errorCode: {
      type: "string",
      enum: [
        "INVALID_REQUEST", "FIELD_NOT_ALLOWED", "CONTRACT_VERSION_MISMATCH", "AUTH_REQUIRED",
        "AUTH_CONTEXT_FORBIDDEN", "UNSUPPORTED_MEDIA_TYPE", "REQUEST_TOO_LARGE", "RATE_LIMITED",
        "TEMPORARILY_UNAVAILABLE", "OPERATION_NOT_FOUND",
      ],
    },
    disposition: { type: "string", enum: ["MOVE_TO_TERMINAL_FAILURE", "KEEP_FOR_RETRY", "KEEP_FOR_RECONCILIATION"] },
  },
};

export const syncV1OperationViewSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["ack", "contribution"],
  properties: {
    ack: syncV1AckSchema,
    contribution: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["status", "headOperationId", "reconciliationReference"],
      properties: {
        status: { type: "string", enum: ["NEVER_PUBLISHED", "ACTIVE", "CANCELLED", "CONTESTED"] },
        headOperationId: nullableUuid,
        reconciliationReference: nullableUuid,
      },
    },
  },
};

export const syncV1ReferencesSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "campaigns", "products"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    campaigns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["campaign_ref", "name", "status", "start_date", "end_date", "accepts_contributions"],
        properties: {
          campaign_ref: uuid,
          name: { type: "string" },
          status: { type: "string", enum: ["PLANIFICADA", "ABIERTA", "CERRADA", "CANCELADA"] },
          start_date: { type: "string", format: "date-time" },
          end_date: { type: "string", format: "date-time", nullable: true },
          accepts_contributions: { type: "boolean" },
        },
      },
    },
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["product_ref", "name", "unit", "base_unit", "is_active", "linkable"],
        properties: {
          product_ref: uuid,
          name: { type: "string" },
          unit: { type: "string" },
          base_unit: { type: "string", enum: ["ML", "G"], nullable: true },
          is_active: { type: "boolean" },
          linkable: { type: "boolean" },
        },
      },
    },
  },
};
