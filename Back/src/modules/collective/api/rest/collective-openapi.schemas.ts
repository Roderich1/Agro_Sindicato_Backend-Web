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
      required: ["linked_members", "members_with_contribution"],
      properties: {
        linked_members: { type: "integer" },
        members_with_contribution: { type: "integer" },
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
    "reason",
    "closed_by_ref",
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
    reason: { type: "string" },
    closed_by_ref: nullableString,
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
