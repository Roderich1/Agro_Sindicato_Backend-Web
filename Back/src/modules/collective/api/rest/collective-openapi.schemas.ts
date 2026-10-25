import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

const nullableString = { type: "string", nullable: true } as const;

/** F07 (2026-10-23): the sealed version of a campaign; null if not sealed. */
const sealRefSchema: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: ["seal_ref", "version", "sealed_at", "accepted_until", "sealed_by"],
  properties: {
    seal_ref: { type: "string", format: "uuid" },
    version: { type: "integer", enum: [1], description: "Este bloque no crea versiones posteriores" },
    sealed_at: { type: "string", format: "date-time", description: "Hora del servidor del sellado" },
    accepted_until: {
      type: "string",
      format: "date-time",
      description: "Instante de la decisión sellada; cada cifra vale por su data_as_of. No prueba que los teléfonos publicaran todo",
    },
    sealed_by: {
      type: "object",
      additionalProperties: false,
      required: ["user_ref", "name", "role"],
      properties: {
        user_ref: { type: "string" },
        name: { type: "string" },
        role: { type: "string", enum: ["DIRECTIVA", "ADMINISTRADOR"] },
      },
    },
  },
};

/** One cell: aggregates derived in Central only (F06 §5); never per Member. */
export const collectiveCellSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "projection_type",
    "product_ref",
    "product_name",
    "base_unit",
    "presentation_unit",
    "status",
    "total_base",
    "total_presentation",
    "contributors",
    "data_as_of",
    "released_at",
    "pending_changes",
  ],
  properties: {
    projection_type: { type: "string", enum: ["CONSUMPTION_TOTAL", "DECLARED_NEED"] },
    product_ref: { type: "string", description: "Producto canónico vigente" },
    product_name: { type: "string" },
    base_unit: { type: "string", enum: ["ML", "G"] },
    presentation_unit: { type: "string", enum: ["L", "KG"] },
    status: {
      type: "string",
      enum: ["DISCLOSED", "SUPPRESSED_UNDER_THRESHOLD", "SUPPRESSED_REVISION", "OVERFLOW", "WITHDRAWN_AFTER_SEAL"],
      description: "WITHDRAWN_AFTER_SEAL: sólo en una versión sellada; el aportante retiró su aporte después del sellado",
    },
    total_base: { ...nullableString, description: "Entero exacto en unidad base; null si no se divulga" },
    total_presentation: { ...nullableString, description: "L/KG exactos; null si no se divulga" },
    contributors: { type: "integer", nullable: true, description: "Members distintos; null si no se divulga" },
    data_as_of: { ...nullableString, format: "date-time", description: "Última aceptación central incluida" },
    released_at: { ...nullableString, format: "date-time" },
    pending_changes: { type: "boolean", description: "Hay cambios que aún no alcanzan el umbral" },
  },
};

export const collectiveSummarySchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "campaign", "seal", "disclosure", "coverage", "cells"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    campaign: {
      type: "object",
      additionalProperties: false,
      required: ["campaign_ref", "name", "status"],
      properties: {
        campaign_ref: { type: "string" },
        name: { type: "string" },
        status: { type: "string" },
      },
    },
    seal: sealRefSchema,
    disclosure: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "policy", "approved", "threshold"],
      properties: {
        mode: { type: "string", enum: ["POLICY_PENDING", "PROVISIONAL_SYNTHETIC"] },
        policy: { type: "string", enum: ["F07-POL-01"] },
        approved: { type: "boolean", enum: [false] },
        threshold: { type: "integer", nullable: true },
      },
    },
    coverage: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["linked_members", "members_with_contribution", "suppressed_cells"],
      properties: {
        linked_members: { type: "integer" },
        members_with_contribution: {
          type: "integer",
          description: "Members inside a published figure (F10-SEC-02): contributors of suppressed cells are not counted.",
        },
        suppressed_cells: { type: "boolean", description: "Some row has no figure; no count is given." },
      },
    },
    cells: { type: "array", items: collectiveCellSchema },
  },
};

const associationSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "association_ref",
    "product_ref",
    "product_name",
    "canonical_product_ref",
    "canonical_product_name",
    "valid_from",
    "valid_to",
    "actor_ref",
    "actor_name",
    "reason",
    "closed_by_ref",
    "closed_by_name",
    "close_reason",
  ],
  properties: {
    association_ref: { type: "string", format: "uuid" },
    product_ref: { type: "string" },
    product_name: { type: "string" },
    canonical_product_ref: { type: "string" },
    canonical_product_name: { type: "string" },
    valid_from: { type: "string", format: "date-time" },
    valid_to: { ...nullableString, format: "date-time" },
    actor_ref: { type: "string" },
    actor_name: { type: "string" },
    reason: { type: "string" },
    closed_by_ref: nullableString,
    closed_by_name: nullableString,
    close_reason: nullableString,
  },
};

export const associationListSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["current", "history"],
  properties: {
    current: { type: "array", items: associationSchema },
    history: { type: "array", items: associationSchema },
  },
};

export const associationChangeSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["changed", "association"],
  properties: {
    changed: { type: "boolean" },
    association: { type: "string", format: "uuid" },
  },
};

const userRefSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["user_ref", "name"],
  properties: { user_ref: { type: "string" }, name: { type: "string" } },
};

/** F07 #27: one line; the figure only when the summary still discloses it. */
const proposalLineSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "position",
    "product_ref",
    "product_name",
    "base_unit",
    "presentation_unit",
    "status",
    "quantity_base",
    "quantity_presentation",
    "contributors",
    "data_as_of",
    "released_at",
    "pending_changes",
  ],
  properties: {
    position: { type: "integer" },
    product_ref: { type: "string", description: "Producto canónico" },
    product_name: { type: "string" },
    base_unit: { type: "string", enum: ["ML", "G"] },
    presentation_unit: { type: "string", enum: ["L", "KG"] },
    status: {
      type: "string",
      enum: [
        "DISCLOSED",
        "SUPPRESSED_UNDER_THRESHOLD",
        "SUPPRESSED_REVISION",
        "OVERFLOW",
        "WITHDRAWN",
        "SUPERSEDED",
        "POLICY_PENDING",
      ],
    },
    quantity_base: { ...nullableString, description: "Necesidad declarada divulgada, entero exacto; null si no se divulga" },
    quantity_presentation: { ...nullableString, description: "L/KG exactos; null si no se divulga" },
    contributors: { type: "integer", nullable: true },
    data_as_of: { ...nullableString, format: "date-time" },
    released_at: { ...nullableString, format: "date-time" },
    pending_changes: { type: "boolean" },
  },
};

export const proposalSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion",
    "proposal_ref",
    "status",
    "basis",
    "campaign",
    "seal",
    "generated_at",
    "generated_by",
    "inputs_fingerprint",
    "disclosure",
    "coverage",
    "lines",
    "notice",
  ],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    proposal_ref: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["DRAFT"] },
    basis: { type: "string", enum: ["DECLARED_NEED"], description: "Necesidad declarada; no resta stock (no es necesidad neta)" },
    campaign: {
      type: "object",
      additionalProperties: false,
      required: ["campaign_ref", "name", "status"],
      properties: { campaign_ref: { type: "string" }, name: { type: "string" }, status: { type: "string" } },
    },
    seal: sealRefSchema,
    generated_at: { type: "string", format: "date-time" },
    generated_by: userRefSchema,
    inputs_fingerprint: {
      type: "string",
      nullable: true,
      description: "SHA-256 de las entradas autorizadas, ordenadas; null si alguna cifra del borrador no se sirve",
    },
    disclosure: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "policy", "approved"],
      properties: {
        mode: { type: "string", enum: ["POLICY_PENDING", "PROVISIONAL_SYNTHETIC"] },
        policy: { type: "string", enum: ["F07-POL-01"] },
        approved: { type: "boolean", enum: [false] },
      },
    },
    coverage: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["linked_members", "members_with_contribution", "basis"],
      properties: {
        linked_members: { type: "integer" },
        members_with_contribution: { type: "integer" },
        basis: {
          type: "string",
          enum: ["PUBLISHED_FIGURES", "ALL_CONTRIBUTORS"],
          description: "Rule of members_with_contribution when the draft was generated (F10-SEC-02); stored drafts are never rewritten.",
        },
      },
    },
    lines: { type: "array", items: proposalLineSchema },
    notice: { type: "string" },
  },
};

export const proposalListSchema: SchemaObject = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["proposal_ref", "status", "generated_at", "generated_by", "inputs_fingerprint", "line_count"],
    properties: {
      proposal_ref: { type: "string", format: "uuid" },
      status: { type: "string", enum: ["DRAFT"] },
      generated_at: { type: "string", format: "date-time" },
      generated_by: userRefSchema,
      inputs_fingerprint: { type: "string", nullable: true },
      line_count: { type: "integer" },
    },
  },
};

const campaignRefSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["campaign_ref", "name", "status"],
  properties: { campaign_ref: { type: "string" }, name: { type: "string" }, status: { type: "string" } },
};

const sealedCoverageSchema: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: ["linked_members", "members_with_contribution", "suppressed_cells"],
  properties: {
    linked_members: { type: "integer" },
    members_with_contribution: { type: "integer" },
    suppressed_cells: { type: "boolean" },
  },
};

/** F07 (2026-10-23): seal state and the review shown before sealing. */
export const sealStateSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "campaign", "state", "seal", "can_seal", "blocked_by", "review"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    campaign: campaignRefSchema,
    state: { type: "string", enum: ["SEALED", "NOT_SEALED"] },
    seal: sealRefSchema,
    can_seal: { type: "boolean" },
    blocked_by: {
      type: "array",
      items: { type: "string", enum: ["SEALING_DISABLED", "POLICY_PENDING", "CAMPAIGN_NOT_CLOSED"] },
    },
    review: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["review_ref", "accepted_until", "coverage", "open_disputes", "pending_changes", "cells_without_figure"],
      properties: {
        review_ref: { type: "string", pattern: "^[0-9a-f]{64}$", description: "Se envía al confirmar el sellado" },
        accepted_until: { type: "string", format: "date-time" },
        coverage: { ...sealedCoverageSchema, nullable: false },
        open_disputes: { type: "boolean", description: "Alguna aportación tiene una disputa abierta; sin conteo" },
        pending_changes: { type: "boolean", description: "Alguna cifra se muestra con cambios pendientes" },
        cells_without_figure: { type: "boolean", description: "Alguna celda no tiene cifra; sin conteo" },
      },
    },
  },
};

export const sealResultSchema: SchemaObject = {
  ...sealStateSchema,
  required: [...(sealStateSchema.required ?? []), "created"],
  properties: {
    ...sealStateSchema.properties,
    created: { type: "boolean", description: "false: la campaña ya estaba sellada (respuesta idempotente)" },
  },
};

const trendPointSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["campaign_ref", "status", "total_base", "total_presentation", "contributors", "data_as_of", "pending_changes"],
  properties: {
    campaign_ref: { type: "string" },
    status: {
      type: "string",
      enum: [
        "DISCLOSED",
        "SUPPRESSED_UNDER_THRESHOLD",
        "SUPPRESSED_REVISION",
        "OVERFLOW",
        "WITHDRAWN_AFTER_SEAL",
        "NO_DATA",
        "NOT_SEALED",
      ],
      description: "NO_DATA: la versión sellada no tiene esa celda (desconocido, no cero). NOT_SEALED: sin versión sellada",
    },
    total_base: nullableString,
    total_presentation: nullableString,
    contributors: { type: "integer", nullable: true },
    data_as_of: { ...nullableString, format: "date-time" },
    pending_changes: { type: "boolean" },
  },
};

/** F07 (2026-10-23): first trends query; only sealed versions, cell by cell. */
export const trendsSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "disclosure", "projection_type", "campaigns", "series", "notice"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    disclosure: collectiveSummarySchema.properties!["disclosure"],
    projection_type: { type: "string", nullable: true, enum: ["CONSUMPTION_TOTAL", "DECLARED_NEED", null] },
    campaigns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["campaign_ref", "name", "status", "start_date", "seal", "coverage"],
        properties: {
          campaign_ref: { type: "string" },
          name: { type: "string" },
          status: { type: "string" },
          start_date: { type: "string", format: "date-time" },
          seal: sealRefSchema,
          coverage: sealedCoverageSchema,
        },
      },
    },
    series: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["projection_type", "product_ref", "product_name", "base_unit", "presentation_unit", "points"],
        properties: {
          projection_type: { type: "string", enum: ["CONSUMPTION_TOTAL", "DECLARED_NEED"] },
          product_ref: { type: "string" },
          product_name: { type: "string" },
          base_unit: { type: "string", enum: ["ML", "G"] },
          presentation_unit: { type: "string", enum: ["L", "KG"] },
          points: { type: "array", items: trendPointSchema },
        },
      },
    },
    notice: { type: "string" },
  },
};

/** F07-REC-01: catalogue denominations for the reconciliation screen. */
export const productCatalogSchema: SchemaObject = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["product_ref", "product_name", "unit", "base_unit", "is_active"],
    properties: {
      product_ref: { type: "string" },
      product_name: { type: "string" },
      unit: { type: "string" },
      base_unit: { type: "string", enum: ["ML", "G"], nullable: true, description: "null: unidad no vinculable" },
      is_active: { type: "boolean" },
    },
  },
};
