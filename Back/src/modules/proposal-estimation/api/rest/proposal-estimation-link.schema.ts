import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

/** E3 §4: OpenAPI shapes of the estimation reference fixed in a draft proposal. */
const closed = (required: string[], properties: Record<string, SchemaObject>, extra: Partial<SchemaObject> = {}): SchemaObject => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
  ...extra,
});
const uuid: SchemaObject = { type: "string", format: "uuid" };
const nullableUuid: SchemaObject = { type: "string", format: "uuid", nullable: true };
const dateTime: SchemaObject = { type: "string", format: "date-time" };
const nullableString: SchemaObject = { type: "string", nullable: true };

const linkProps: Record<string, SchemaObject> = {
  link_ref: uuid,
  sequence: { type: "integer", minimum: 1 },
  mode: { type: "string", enum: ["INITIAL", "UPDATE", "CLEAR"] },
  action: { type: "string", enum: ["LINK_EXISTING_RUN", "REUSE_JOB", "REQUEST_JOB", "CLEAR"] },
  created_at: dateTime,
  created_by: closed(["user_ref", "name", "role"], { user_ref: { type: "string" }, name: { type: "string" }, role: { type: "string" } }),
  run_ref: { ...nullableUuid, description: "Ejecución fijada, o la que resolvió el trabajo" },
  job_ref: nullableUuid,
  job_status: { type: "string", nullable: true, enum: ["QUEUED", "RUNNING", "COMPLETED", "NOT_EXECUTED"] },
  stop_code: nullableString,
  failure_code: nullableString,
};
const linkRequired = Object.keys(linkProps);

const blockers = ["NEED_NOT_DISCLOSED", "ESTIMATE_NOT_AVAILABLE", "ESTIMATE_NOT_CURRENT", "PRODUCT_MISMATCH", "UNIT_MISMATCH", "PERIOD_MISMATCH", "POPULATION_NOT_VERIFIED"];

export const estimationLinkViewSchema: SchemaObject = closed(
  ["contract_version", "proposal_ref", "target_campaign_ref", "state", "link", "run", "update", "prepare_blocker", "lines", "history", "evaluated_at", "notice"],
  {
    contract_version: { type: "integer", enum: [1] },
    proposal_ref: uuid,
    target_campaign_ref: { type: "string" },
    state: { type: "string", enum: ["NONE", "CALCULATING", "LINKED", "UNAVAILABLE", "RESTRICTED"] },
    link: closed(linkRequired, linkProps, { nullable: true, description: "Vínculo vigente (null sin referencia o tras quitarla)" }),
    run: {
      type: "object",
      nullable: true,
      description: "Resumen de la ejecución fijada (sin cifras): método, versión, temporada, campaña objetivo con período y política aplicada",
      properties: {
        run_ref: uuid,
        job_ref: uuid,
        generated_at: dateTime,
        outcome: { type: "string", enum: ["CALCULATED", "FAILED"] },
        failure_code: nullableString,
        method: { type: "string" },
        method_version: { type: "string" },
        season: { type: "object" },
        target: { type: "object" },
        disclosure: { type: "object" },
      },
    },
    update: closed(["available", "reason"], {
      available: { type: "boolean" },
      reason: { type: "string", nullable: true, enum: ["NEWER_RUN", "OUTDATED", "FAILED", "NOT_EXECUTED", "INCOMPLETE"] },
    }),
    prepare_blocker: {
      type: "string",
      nullable: true,
      enum: ["POLICY_PENDING", "TARGET_CAMPAIGN_NOT_ELIGIBLE", "TARGET_CAMPAIGN_NOT_CLASSIFIED", "NO_ESTIMABLE_PRODUCTS"],
    },
    lines: {
      type: "array",
      items: closed(["position", "product", "base_unit", "presentation_unit", "need", "estimation", "comparison", "scope"], {
        position: { type: "integer" },
        product: closed(["product_ref", "name"], { product_ref: { type: "string" }, name: { type: "string" } }),
        base_unit: { type: "string", enum: ["ML", "G"] },
        presentation_unit: { type: "string", enum: ["L", "KG"] },
        need: closed(["status", "quantity_base", "quantity_presentation"], {
          status: { type: "string", description: "Estado de la línea tal como la sirve el borrador (F07)" },
          quantity_base: nullableString,
          quantity_presentation: nullableString,
        }),
        estimation: closed(["state", "status", "reason_code", "estimate_base", "validity", "validity_reason"], {
          state: { type: "string", enum: ["NONE", "CALCULATING", "AVAILABLE", "OUTDATED", "INSUFFICIENT_DATA", "ERROR", "NO_RESULT", "RESTRICTED"] },
          status: { type: "string", nullable: true, enum: ["ESTIMATED", "INSUFFICIENT_DATA", "INCOMPATIBLE_DATA", "CALCULATION_FAILED"] },
          reason_code: nullableString,
          estimate_base: { type: "string", nullable: true, description: "Sólo en AVAILABLE y OUTDATED; 6 decimales" },
          validity: { type: "string", nullable: true, enum: ["NOT_USABLE", "SUPERSEDED", "OUTDATED", "CURRENT"] },
          validity_reason: nullableString,
        }),
        comparison: closed(["comparable", "blockers", "message", "difference"], {
          comparable: { type: "boolean" },
          blockers: { type: "array", items: { type: "string", enum: blockers } },
          message: nullableString,
          difference: closed(
            ["difference_base", "difference_percent", "percent_undefined", "direction", "observation"],
            {
              difference_base: { type: "string", description: "Necesidad − estimación, exacta, 6 decimales" },
              difference_percent: { type: "string", nullable: true, description: "4 decimales; null si la estimación es 0" },
              percent_undefined: { type: "string", nullable: true, enum: ["ESTIMATE_ZERO"] },
              direction: { type: "string", enum: ["ABOVE", "BELOW", "EQUAL"] },
              observation: { type: "string" },
            },
            { nullable: true, description: "Sólo sin blockers; hoy siempre null (POPULATION_NOT_VERIFIED, E3-P1)" },
          ),
        }),
        scope: closed(
          ["need_contributors", "estimate"],
          {
            need_contributors: {
              type: "integer",
              minimum: 0,
              nullable: true,
              description: "Aportantes de la cifra de necesidad; sólo si la línea está divulgada y servida (DISCLOSED)",
            },
            estimate: closed(
              ["span_campaigns", "contributors_min", "contributors_max"],
              {
                span_campaigns: { type: "integer", minimum: 1, description: "Campañas del tramo usado por la estimación" },
                contributors_min: { type: "integer", minimum: 0, description: "Menos aportantes de una cifra de consumo del tramo" },
                contributors_max: { type: "integer", minimum: 0, description: "Más aportantes de una cifra de consumo del tramo" },
              },
              {
                nullable: true,
                description:
                  "Sólo con cifra de estimación (AVAILABLE u OUTDATED con estimate_base); null en cualquier otro estado. Sin identidades ni detalle por campaña",
              },
            ),
          },
          { description: "E3-P1 (opción 1 + 1b): alcance conocido de cada cifra; no habilita ninguna diferencia" },
        ),
      }),
    },
    history: {
      type: "array",
      items: closed([...linkRequired, "current"], { ...linkProps, current: { type: "boolean" } }),
    },
    evaluated_at: dateTime,
    notice: { type: "string" },
  },
);

export const estimationLinkActionSchema: SchemaObject = closed(["outcome", "view"], {
  outcome: { type: "string", enum: ["EXISTING", "LINKED_EXISTING_RUN", "REUSED_JOB", "REQUESTED_JOB", "CLEARED", "NOT_CALCULABLE"] },
  reason: { type: "string", enum: ["TARGET_CAMPAIGN_NOT_ELIGIBLE", "TARGET_CAMPAIGN_NOT_CLASSIFIED", "NO_ESTIMABLE_PRODUCTS"], description: "Sólo con NOT_CALCULABLE" },
  view: estimationLinkViewSchema,
});

export const selectionSchema: SchemaObject = closed(["contract_version", "proposal_ref", "revision", "product_refs", "updated_at"], {
  contract_version: { type: "integer", enum: [1] },
  proposal_ref: uuid,
  revision: { type: "integer", minimum: 0, description: "0 si nunca se eligió" },
  product_refs: { type: "array", items: { type: "string" }, description: "En el orden de las líneas del borrador" },
  updated_at: { ...dateTime, nullable: true },
});

export const linkErrorSchema: SchemaObject = closed(["errorCode"], {
  errorCode: {
    type: "string",
    enum: ["PAYLOAD_INVALID", "PROPOSAL_NOT_FOUND", "POLICY_PENDING", "REFERENCE_CHANGED", "REFERENCE_UP_TO_DATE", "REQUEST_ID_REUSED", "PRODUCT_NOT_IN_PROPOSAL", "SELECTION_STALE"],
  },
  view: { ...estimationLinkViewSchema, description: "Con REFERENCE_CHANGED y REFERENCE_UP_TO_DATE: la vista vigente" },
  selection: { ...selectionSchema, description: "Con SELECTION_STALE: la selección vigente" },
});

export const prepareBodySchema: SchemaObject = closed(["request_id", "mode"], {
  request_id: { ...uuid, description: "Idempotencia: el mismo cuerpo devuelve el mismo resultado; otro cuerpo, 409 REQUEST_ID_REUSED" },
  mode: { type: "string", enum: ["INITIAL", "UPDATE"] },
  expected_link_ref: { ...nullableUuid, description: "Obligatorio con UPDATE: el vínculo vigente que se vio" },
});

export const clearBodySchema: SchemaObject = closed(["request_id", "expected_link_ref"], {
  request_id: uuid,
  expected_link_ref: uuid,
});

export const selectionBodySchema: SchemaObject = closed(["expected_revision", "product_refs"], {
  expected_revision: { type: "integer", minimum: 0 },
  product_refs: { type: "array", maxItems: 200, uniqueItems: true, items: { type: "string" } },
});
