import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

const nullableString = { type: "string", nullable: true } as const;
const dateTime = { type: "string", format: "date-time" } as const;

export const identificationErrorSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["errorCode"],
  properties: {
    errorCode: {
      type: "string",
      enum: [
        "PAYLOAD_INVALID",
        "AUTH_REQUIRED",
        "AUTH_CONTEXT_FORBIDDEN",
        "REQUEST_NOT_FOUND",
        "REQUEST_ID_CONFLICT",
        "REQUEST_ALREADY_LINKED",
        "UNIT_UNSUPPORTED",
        "UNIT_IMMUTABLE",
        "PHOTO_CONSENT_REQUIRED",
        "PHOTO_NOT_FOUND",
        "PHOTO_STORAGE_UNAVAILABLE",
        "PHOTO_INTEGRITY_FAILED",
        "IMAGE_INVALID",
        "IMAGE_TOO_LARGE",
        "CONTENT_HASH_MISMATCH",
        "UNSUPPORTED_MEDIA_TYPE",
        "CONFIRMATION_REQUIRED",
        "REASON_REQUIRED",
        "PRODUCT_NOT_FOUND",
        "PRODUCT_INACTIVE",
        "PRODUCT_NAME_TAKEN",
        "UNIT_DIMENSION_MISMATCH",
        "RATE_LIMITED",
        "TEMPORARILY_UNAVAILABLE",
      ],
    },
  },
};

const resolutionSchema: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: ["kind", "product_ref", "product_name", "unit", "base_unit", "is_active", "resolved_at"],
  properties: {
    kind: { type: "string", enum: ["LINKED_EXISTING", "CREATED_PRODUCT"] },
    product_ref: { type: "string" },
    product_name: { type: "string" },
    unit: { type: "string", description: "Unidad del catálogo central tal como se guarda" },
    base_unit: { type: "string", enum: ["ML", "G"], nullable: true },
    is_active: { type: "boolean" },
    resolved_at: dateTime,
  },
};

const pendingNoteSchema: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: ["text", "at"],
  properties: { text: { type: "string" }, at: dateTime },
  description: "Nota de la Directiva al dejarla pendiente; sin nombre del autor",
};

const farmerPhotoProperties: Record<string, SchemaObject> = {
  state: { type: "string", enum: ["NONE", "STORED", "REMOVED"] },
  sha256: { ...nullableString, description: "SHA-256 de la foto almacenada; null si no hay" },
  consent_version: { ...nullableString, description: "Versión del consentimiento de foto registrado" },
};

const requestProperties: Record<string, SchemaObject> = {
  contractVersion: { type: "integer", enum: [1] },
  request_id: { type: "string", format: "uuid", description: "UUID v4 generado por el teléfono" },
  status: { type: "string", enum: ["PENDING", "LINKED"] },
  local_name: { type: "string" },
  active_ingredient: nullableString,
  unit: { type: "string", enum: ["L", "KG"] },
  base_unit: { type: "string", enum: ["ML", "G"] },
  received_at: dateTime,
  updated_at: dateTime,
  resolution: resolutionSchema,
  pending_note: pendingNoteSchema,
};

const requestRequired = [
  "contractVersion",
  "request_id",
  "status",
  "local_name",
  "active_ingredient",
  "unit",
  "base_unit",
  "received_at",
  "updated_at",
  "photo",
  "resolution",
  "pending_note",
];

/** E1 §4.1: the farmer's own request. */
export const farmerRequestSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: requestRequired,
  properties: {
    ...requestProperties,
    photo: {
      type: "object",
      additionalProperties: false,
      required: ["state", "sha256", "consent_version"],
      properties: farmerPhotoProperties,
    },
  },
};

/** E1 §4.2: the farmer's view plus server id and photo metadata; never the farmer's identity. */
export const institutionalRequestSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["id", ...requestRequired],
  properties: {
    id: { type: "string", format: "uuid", description: "Id del servidor (rutas institucionales)" },
    ...requestProperties,
    photo: {
      type: "object",
      additionalProperties: false,
      required: ["state", "sha256", "consent_version", "content_type", "width", "height", "stored_at"],
      properties: {
        ...farmerPhotoProperties,
        content_type: { type: "string", enum: ["image/jpeg", "image/png"], nullable: true },
        width: { type: "integer", nullable: true },
        height: { type: "integer", nullable: true },
        stored_at: { ...nullableString, format: "date-time" },
      },
    },
  },
};

export const identificationListSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "requests"],
  description:
    "Agricultor (sesión móvil Auth V2): sus solicitudes (vista del §4.1). Directiva/Administrador: las del tenant (vista del §4.2).",
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    requests: { type: "array", items: { oneOf: [farmerRequestSchema, institutionalRequestSchema] } },
  },
};

export const candidateListSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "candidates"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    candidates: {
      type: "array",
      maxItems: 5,
      description: "Sugerencias por parecido del nombre o ingrediente activo igual; nunca se vincula por similitud",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "product_ref",
          "product_name",
          "unit",
          "base_unit",
          "is_active",
          "is_alias",
          "canonical_product_ref",
          "similarity",
          "matched_on",
        ],
        properties: {
          product_ref: { type: "string" },
          product_name: { type: "string" },
          unit: { type: "string" },
          base_unit: { type: "string", enum: ["ML", "G"] },
          is_active: { type: "boolean" },
          is_alias: { type: "boolean", description: "Tiene una asociación vigente con otro producto canónico" },
          canonical_product_ref: nullableString,
          similarity: { type: "string", enum: ["ALTA", "MEDIA", "BAJA"] },
          matched_on: { type: "array", items: { type: "string", enum: ["name", "active_ingredient"] } },
        },
      },
    },
  },
};

export const historySchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "events"],
  properties: {
    contractVersion: { type: "integer", enum: [1] },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["at", "kind", "actor", "product_ref", "product_name", "detail"],
        properties: {
          at: dateTime,
          kind: {
            type: "string",
            enum: [
              "RECEIVED",
              "UPDATED",
              "PHOTO_RECEIVED",
              "PHOTO_REPLACED",
              "PHOTO_REMOVED",
              "LINKED",
              "RELINKED",
              "PRODUCT_CREATED",
              "NOTE",
            ],
          },
          actor: {
            type: "object",
            nullable: true,
            additionalProperties: false,
            required: ["name"],
            properties: { name: { type: "string" } },
            description: "Sólo en decisiones institucionales; null en los eventos del agricultor, que nunca se nombra",
          },
          product_ref: nullableString,
          product_name: nullableString,
          detail: nullableString,
        },
      },
    },
  },
};

export const decisionSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["changed", "request"],
  properties: {
    changed: { type: "boolean", description: "false: el vínculo pedido ya era el vigente" },
    product_ref: { type: "string", description: "Sólo en create-product: el producto creado" },
    request: institutionalRequestSchema,
  },
};
