import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { CALL_ERROR_CODES } from "../../domain/call-error";

const dateTime: SchemaObject = { type: "string", format: "date-time" };
const nullableDateTime: SchemaObject = { type: "string", format: "date-time", nullable: true };
const baseUnit: SchemaObject = { type: "string", enum: ["ML", "G"] };
const unit: SchemaObject = { type: "string", enum: ["L", "KG"] };
const quantity: SchemaObject = { type: "string", pattern: "^(0|[1-9][0-9]*)$", description: "Entero decimal en la unidad base" };
const callStatus: SchemaObject = { type: "string", enum: ["DRAFT", "OPEN", "CLOSED", "CANCELLED"] };

const closed = (required: string[], properties: Record<string, SchemaObject>, extra: Partial<SchemaObject> = {}): SchemaObject => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
  ...extra,
});

const userRef = closed(["user_ref", "name"], { user_ref: { type: "string" }, name: { type: "string" } });
const nullableUserRef: SchemaObject = { ...userRef, nullable: true };

export const callErrorSchema: SchemaObject = closed(
  ["errorCode"],
  {
    errorCode: { type: "string", enum: [...CALL_ERROR_CODES] },
    reason: {
      type: "string",
      enum: ["DEADLINE_PASSED", "CLOSED", "CANCELLED", "DRAFT"],
      description: "Sólo con CALL_NOT_OPEN",
    },
    status: { ...callStatus, description: "Estado vigente: INVALID_TRANSITION, CALL_NOT_EDITABLE, CALL_NOT_CLOSED" },
    participation: {
      type: "object",
      nullable: true,
      description: "Sólo con STALE_SEQUENCE: la participación vigente en el servidor (o null)",
    },
  },
  { description: "Cuerpo cerrado; nunca repite el contenido de la solicitud" },
);

const participationLine = closed(["product_ref", "base_unit", "quantity_base"], {
  product_ref: { type: "string" },
  base_unit: baseUnit,
  quantity_base: quantity,
});

export const participationSchema: SchemaObject = closed(
  ["status", "lines", "last_sequence", "last_operation_id", "accepted_at", "consent"],
  {
    status: { type: "string", enum: ["ACTIVE", "WITHDRAWN"] },
    lines: { type: "array", items: participationLine },
    last_sequence: { type: "integer" },
    last_operation_id: { type: "string", format: "uuid" },
    accepted_at: { ...dateTime, description: "Hora del servidor de la última operación aceptada" },
    consent: closed(["version", "accepted_at", "received_at"], {
      version: { type: "string", example: "CONV-1" },
      accepted_at: { ...dateTime, description: "Declarada por el teléfono" },
      received_at: { ...dateTime, description: "Hora del servidor" },
    }),
  },
  { nullable: true },
);

export const acceptedSchema: SchemaObject = closed(["outcome", "participation"], {
  outcome: { type: "string", enum: ["ACCEPTED"] },
  participation: participationSchema,
});

const productRef = closed(["product_ref", "name", "unit", "base_unit"], {
  product_ref: { type: "string" },
  name: { type: "string" },
  unit,
  base_unit: baseUnit,
});

export const farmerListSchema: SchemaObject = closed(["contractVersion", "server_time", "consent", "calls"], {
  contractVersion: { type: "integer", enum: [1] },
  server_time: dateTime,
  consent: closed(["version", "text"], { version: { type: "string" }, text: { type: "string" } }),
  calls: {
    type: "array",
    items: closed(
      [
        "call_id",
        "name",
        "status",
        "campaign",
        "opened_at",
        "deadline_at",
        "closed_at",
        "cancelled_at",
        "server_time",
        "accepts_operations",
        "responsible",
        "products",
        "participation",
        "closing",
      ],
      {
        call_id: { type: "string", format: "uuid" },
        name: { type: "string" },
        status: { type: "string", enum: ["OPEN", "CLOSED", "CANCELLED"] },
        campaign: closed(["campaign_ref", "name"], { campaign_ref: { type: "string" }, name: { type: "string" } }),
        opened_at: nullableDateTime,
        deadline_at: dateTime,
        closed_at: nullableDateTime,
        cancelled_at: nullableDateTime,
        server_time: dateTime,
        accepts_operations: { type: "boolean" },
        responsible: closed(["name"], { name: { type: "string" } }),
        products: { type: "array", items: productRef },
        participation: participationSchema,
        closing: closed(
          ["cutoff_at", "closed_at", "included", "lines"],
          {
            cutoff_at: dateTime,
            closed_at: dateTime,
            included: { type: "boolean", description: "false: «no incluida» en el consolidado" },
            lines: { type: "array", items: participationLine },
          },
          { nullable: true },
        ),
      },
    ),
  },
});

const productTotals: Record<string, SchemaObject> = {
  participant_count: { type: "integer" },
  total_quantity_base: { ...quantity, nullable: true, description: "null bajo el umbral (E2-D7) para quien no es responsable" },
  visibility: { type: "string", enum: ["VISIBLE", "UNDER_THRESHOLD"] },
};

export const callSummaryListSchema: SchemaObject = closed(["contractVersion", "calls"], {
  contractVersion: { type: "integer", enum: [1] },
  calls: {
    type: "array",
    items: closed(
      [
        "call_id",
        "name",
        "status",
        "campaign",
        "deadline_at",
        "opened_at",
        "closed_at",
        "cancelled_at",
        "created_at",
        "responsible",
        "product_count",
        "participant_count",
      ],
      {
        call_id: { type: "string", format: "uuid" },
        name: { type: "string" },
        status: callStatus,
        campaign: closed(["campaign_ref", "name"], { campaign_ref: { type: "string" }, name: { type: "string" } }),
        deadline_at: dateTime,
        opened_at: nullableDateTime,
        closed_at: nullableDateTime,
        cancelled_at: nullableDateTime,
        created_at: dateTime,
        responsible: userRef,
        product_count: { type: "integer" },
        participant_count: { type: "integer" },
      },
    ),
  },
});

export const callDetailSchema: SchemaObject = closed(
  [
    "contractVersion",
    "call_id",
    "name",
    "status",
    "campaign",
    "deadline_at",
    "opened_at",
    "closed_at",
    "cancelled_at",
    "cancel_reason",
    "created_at",
    "updated_at",
    "server_time",
    "responsible",
    "created_by",
    "opened_by",
    "cancelled_by",
    "source_proposal_ref",
    "participant_count",
    "totals_source",
    "totals_threshold",
    "can_view_participants",
    "is_responsible",
    "products",
    "history",
  ],
  {
    contractVersion: { type: "integer", enum: [1] },
    call_id: { type: "string", format: "uuid" },
    name: { type: "string" },
    status: callStatus,
    campaign: closed(["campaign_ref", "name", "status"], {
      campaign_ref: { type: "string" },
      name: { type: "string" },
      status: { type: "string" },
    }),
    deadline_at: dateTime,
    opened_at: nullableDateTime,
    closed_at: nullableDateTime,
    cancelled_at: nullableDateTime,
    cancel_reason: { type: "string", nullable: true },
    created_at: dateTime,
    updated_at: dateTime,
    server_time: dateTime,
    responsible: closed(["user_ref", "name", "role"], {
      user_ref: { type: "string" },
      name: { type: "string" },
      role: { type: "string", nullable: true, enum: ["DIRECTIVA", "ADMINISTRADOR", "AGRICULTOR"] },
    }),
    created_by: userRef,
    opened_by: nullableUserRef,
    cancelled_by: nullableUserRef,
    source_proposal_ref: { type: "string", format: "uuid", nullable: true },
    participant_count: { type: "integer", description: "Personas con participación vigente (o del consolidado)" },
    totals_source: { type: "string", enum: ["NONE", "LIVE", "CLOSING"] },
    totals_threshold: { type: "integer", example: 3 },
    can_view_participants: { type: "boolean" },
    is_responsible: { type: "boolean" },
    products: {
      type: "array",
      items: closed(["position", "product_ref", "name", "unit", "base_unit", "is_active", "reference", "totals"], {
        position: { type: "integer" },
        product_ref: { type: "string" },
        name: { type: "string" },
        unit,
        base_unit: baseUnit,
        is_active: { type: "boolean" },
        reference: closed(
          ["proposal_ref", "position", "status", "label", "quantity_base", "contributors", "released_at"],
          {
            proposal_ref: { type: "string", format: "uuid" },
            position: { type: "integer" },
            status: { type: "string", enum: ["DISCLOSED", "NO_FIGURE"] },
            label: { type: "string" },
            quantity_base: { ...quantity, nullable: true },
            contributors: { type: "integer", nullable: true },
            released_at: nullableDateTime,
          },
          { nullable: true, description: "Cifra divulgada en el borrador de propuesta, o «Sin cifra»" },
        ),
        totals: closed(["participant_count", "total_quantity_base", "visibility"], { ...productTotals }),
      }),
    },
    history: {
      type: "array",
      items: closed(["at", "kind", "actor", "detail"], {
        at: dateTime,
        kind: { type: "string", enum: ["CREATED", "UPDATED", "OPENED", "CLOSED", "CANCELLED", "RESPONSIBLE_ASSIGNED"] },
        actor: nullableUserRef,
        detail: { type: "string", nullable: true },
      }),
    },
  },
);

const namedLine = closed(["product_ref", "product_name", "base_unit", "quantity_base"], {
  product_ref: { type: "string" },
  product_name: { type: "string" },
  base_unit: baseUnit,
  quantity_base: quantity,
});

export const participantsSchema: SchemaObject = closed(
  ["contractVersion", "call_id", "status", "provisional", "notice", "participant_count", "participants"],
  {
    contractVersion: { type: "integer", enum: [1] },
    call_id: { type: "string", format: "uuid" },
    status: callStatus,
    provisional: { type: "boolean" },
    notice: { type: "string", nullable: true },
    participant_count: { type: "integer" },
    participants: {
      type: "array",
      items: closed(["participation_ref", "name", "status", "accepted_at", "lines"], {
        participation_ref: { type: "string", format: "uuid" },
        name: { type: "string" },
        status: { type: "string", enum: ["ACTIVE"] },
        accepted_at: dateTime,
        lines: { type: "array", items: namedLine },
      }),
    },
  },
);

export const closingSchema: SchemaObject = closed(
  [
    "contractVersion",
    "call_id",
    "name",
    "status",
    "label",
    "mode",
    "cutoff_at",
    "closed_at",
    "closed_by",
    "participant_count",
    "totals_threshold",
    "can_view_participants",
    "lines",
    "participants",
  ],
  {
    contractVersion: { type: "integer", enum: [1] },
    call_id: { type: "string", format: "uuid" },
    name: { type: "string" },
    status: { type: "string", enum: ["CLOSED"] },
    label: { type: "string" },
    mode: { type: "string", enum: ["MANUAL", "AUTOMATIC"] },
    cutoff_at: dateTime,
    closed_at: dateTime,
    closed_by: nullableUserRef,
    participant_count: { type: "integer" },
    totals_threshold: { type: "integer" },
    can_view_participants: { type: "boolean" },
    lines: {
      type: "array",
      items: closed(["product_ref", "product_name", "unit", "base_unit", "participant_count", "total_quantity_base", "visibility"], {
        product_ref: { type: "string" },
        product_name: { type: "string" },
        unit,
        base_unit: baseUnit,
        ...productTotals,
      }),
    },
    participants: {
      type: "array",
      nullable: true,
      description: "Sólo con el permiso específico (E2-D6); null en otro caso",
      items: closed(["participation_ref", "name", "accepted_at", "lines"], {
        participation_ref: { type: "string", format: "uuid" },
        name: { type: "string" },
        accepted_at: dateTime,
        lines: { type: "array", items: namedLine },
      }),
    },
  },
);

export const eligibleResponsiblesSchema: SchemaObject = closed(["contractVersion", "users"], {
  contractVersion: { type: "integer", enum: [1] },
  users: {
    type: "array",
    items: closed(["user_ref", "name", "role"], {
      user_ref: { type: "string" },
      name: { type: "string" },
      role: { type: "string", enum: ["DIRECTIVA", "ADMINISTRADOR"] },
    }),
  },
});
