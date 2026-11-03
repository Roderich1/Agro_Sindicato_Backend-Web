import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

/**
 * F12-EST-08 (#181): closed shape of the estimation reference of a proposal.
 * The values are those of `GET /estimation/results` (INT-09) for the same
 * product and unit; there is no naive baseline, coverage, series nor any
 * figure per Member, and nothing of the proposal's lines is repeated.
 */
const estimationSchema: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: ["status", "reason_code", "estimate_base", "validity", "validity_reason", "method", "run_ref", "generated_at", "span_length", "run_relation"],
  properties: {
    status: { type: "string", enum: ["ESTIMATED", "INSUFFICIENT_DATA", "INCOMPATIBLE_DATA", "CALCULATION_FAILED"] },
    reason_code: {
      type: "string",
      nullable: true,
      enum: ["LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED", "SPAN_TOO_SHORT", "NO_SERIES", "MIXED_UNITS", "NO_COMPARABLE_CAMPAIGNS", "COVERAGE_UNKNOWN", "CALCULATION_ERROR"],
    },
    estimate_base: {
      type: "string",
      nullable: true,
      description: "Unidad base, hasta 6 decimales. Null sin cifra o si una fuente ya no se divulga (SOURCES_WITHDRAWN); nunca cero en su lugar",
    },
    validity: { type: "string", enum: ["NOT_USABLE", "SUPERSEDED", "OUTDATED", "CURRENT"] },
    validity_reason: {
      type: "string",
      nullable: true,
      enum: ["RUN_FAILED", "NO_FIGURE", "LATER_RUN", "SOURCES_CHANGED", "CLASSIFICATION_CORRECTED", "SOURCES_WITHDRAWN"],
    },
    method: { type: "string", enum: ["SES_NAIVE"] },
    run_ref: { type: "string", format: "uuid", description: "Ejecución de la que procede" },
    generated_at: { type: "string", format: "date-time", description: "Fecha de generación de esa ejecución" },
    span_length: { type: "integer", nullable: true },
    run_relation: {
      type: "string",
      enum: ["BEFORE_PROPOSAL", "AFTER_PROPOSAL"],
      description: "Si la ejecución se generó antes o después del borrador",
    },
  },
};

export const proposalEstimationReferenceSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "contract_version",
    "kind",
    "label",
    "proposal_ref",
    "proposal_generated_at",
    "target_campaign_ref",
    "availability",
    "evaluated_at",
    "season",
    "lines",
    "notice",
  ],
  properties: {
    contract_version: { type: "integer", enum: [1] },
    kind: { type: "string", enum: ["PROPOSAL_ESTIMATION_REFERENCE"] },
    label: { type: "string", enum: ["Estimación del consumo"] },
    proposal_ref: { type: "string", format: "uuid" },
    proposal_generated_at: { type: "string", format: "date-time" },
    target_campaign_ref: { type: "string", description: "La campaña del borrador, que es la campaña objetivo de la estimación" },
    availability: { type: "string", enum: ["AVAILABLE", "POLICY_PENDING"], description: "POLICY_PENDING: sin política en vigor no se entrega ninguna cifra" },
    evaluated_at: { type: "string", format: "date-time", description: "Momento en que se evaluó la vigencia" },
    season: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      required: ["season_ref", "key", "definition", "duration_days"],
      properties: {
        season_ref: { type: "string", format: "uuid" },
        key: { type: "string" },
        definition: { type: "string" },
        duration_days: { type: "integer" },
      },
    },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["position", "product_ref", "base_unit", "presentation_unit", "absence", "estimation"],
        properties: {
          position: { type: "integer", description: "La línea del borrador a la que acompaña" },
          product_ref: { type: "string", description: "Producto canónico de la línea" },
          base_unit: { type: "string", enum: ["ML", "G"] },
          presentation_unit: { type: "string", enum: ["L", "KG"] },
          absence: {
            type: "string",
            nullable: true,
            enum: ["NO_RESULT", "POLICY_PENDING"],
            description: "Por qué no hay resultado: ninguna ejecución lo incluye, o no hay política en vigor. Nunca un cero",
          },
          estimation: estimationSchema,
        },
      },
    },
    notice: { type: "string" },
  },
};
