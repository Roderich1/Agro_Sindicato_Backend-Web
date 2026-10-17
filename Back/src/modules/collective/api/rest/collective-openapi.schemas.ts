import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

const nullableString = { type: "string", nullable: true } as const;

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
      enum: ["DISCLOSED", "SUPPRESSED_UNDER_THRESHOLD", "SUPPRESSED_REVISION", "OVERFLOW"],
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
  required: ["contractVersion", "campaign", "disclosure", "coverage", "cells"],
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
      required: ["linked_members", "members_with_contribution"],
      properties: { linked_members: { type: "integer" }, members_with_contribution: { type: "integer" } },
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
