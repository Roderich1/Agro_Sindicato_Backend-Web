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
    status: { ...callStatus, description: "Estado vigente: INVALID_TRANSITION, CALL_NOT_EDITABLE, CALL_NOT_CLOSED, WIDENING_NOT_ALLOWED" },
    participation: {
      type: "object",
      nullable: true,
      description: "Sólo con STALE_SEQUENCE: la participación vigente en el servidor (o null)",
    },
    responsible_version: { type: "integer", minimum: 1, description: "Sólo con RESPONSIBLE_CHANGED: la versión vigente de la responsabilidad" },
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
    consent: closed(
      ["version", "accepted_at", "received_at"],
      {
        version: { type: "string", example: "CONV-3" },
        accepted_at: { ...dateTime, description: "Declarada por el teléfono" },
        received_at: { ...dateTime, description: "Hora del servidor" },
      },
      { description: "Texto aceptado al crear la participación; nunca se reescribe" },
    ),
    consent_scope: closed(
      ["scope", "version", "decided_at", "received_at", "sequence"],
      {
        scope: {
          type: "string",
          enum: ["RESPONSIBLE_ONLY", "COLLABORATORS", "ADMINISTRATION", "TOTALS_ONLY"],
          description:
            "E4 §4.2: ADMINISTRATION (CONV-4: la Administración habilitada ve el detalle) y TOTALS_ONLY (retiró esa autorización; cubre sólo los totales). Una respuesta de escritura de los contratos 1–3 nunca lleva un valor nuevo (§7.2)",
        },
        version: { type: "string", example: "CONV-3", description: "Texto citado por la decisión que fijó el alcance" },
        decided_at: { ...dateTime, description: "Declarada por el teléfono" },
        received_at: { ...dateTime, description: "Hora del servidor" },
        sequence: { type: "integer", minimum: 0, description: "Orden de la decisión (0 = la aceptación inicial)" },
      },
      {
        description:
          "Alcance vigente del consentimiento: en las lecturas (forma 4) y en las respuestas de escritura de los contratos 2, 3 y 4; las cantidades nunca lo cambian",
      },
    ),
    responsible_authorization: closed(
      ["authorized", "version"],
      {
        authorized: { type: "boolean", description: "El agricultor autorizó a la persona responsable actual de la convocatoria" },
        version: { type: "integer", nullable: true, description: "Versión de la responsabilidad que cubre su autorización; null si ninguna" },
      },
      {
        description:
          "P-A C1 (§12): sólo en las respuestas de escritura del contrato 3, que lo valida. E4: ya no decide ningún acceso; nunca en las lecturas (forma 4) ni en el contrato 4",
      },
    ),
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

const farmerCallSchema: SchemaObject = closed(
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
        responsible: closed(["name"], { name: { type: "string" } }, { description: "E4: quién coordina; sin versión (P-A C1 ya no decide el acceso)" }),
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
    );

const consentSchema = closed(["version", "text", "help"], {
  version: {
    type: "string",
    enum: ["CONV-4"],
    description: "E4 §4.1: CONV-4, servido a todos los contratos (§7.1): los textos anteriores dirían que la responsable ve los datos, y eso ya no es cierto",
  },
  text: { type: "string" },
  help: { type: "string", description: "Ayuda de CONV-4; forma parte de la versión" },
});

export const farmerListSchema: SchemaObject = closed(["contractVersion", "server_time", "consent", "calls", "history"], {
  contractVersion: {
    type: "integer",
    enum: [4],
    description:
      "E4 §7.1: 4 para todos (cabecera X-Joint-Purchase-Contract 1, 2, 3, 4 o ninguna). Las apps de los contratos 1–3 muestran «Actualice la aplicación» o no pueden leer la lista",
  },
  server_time: dateTime,
  consent: consentSchema,
  calls: { type: "array", items: farmerCallSchema },
  history: closed(["older_count"], {
    older_count: {
      type: "integer",
      minimum: 0,
      description: "Convocatorias terminadas con participación propia anteriores a los 180 días (se consultan en history)",
    },
  }),
});

export const farmerHistorySchema: SchemaObject = closed(["contractVersion", "server_time", "consent", "calls", "next_cursor"], {
  contractVersion: { type: "integer", enum: [4] },
  server_time: dateTime,
  consent: consentSchema,
  calls: { type: "array", items: farmerCallSchema, description: "Sólo CLOSED/CANCELLED con participación propia, de la más reciente a la más antigua" },
  next_cursor: { type: "string", nullable: true, description: "Opaco; null en la última página" },
});

const productTotals: Record<string, SchemaObject> = {
  participant_count: { type: "integer", description: "Personas contadas en el producto (un conteo, siempre visible)" },
  total_quantity_base: { ...quantity, nullable: true, description: "null salvo VISIBLE" },
  visibility: {
    type: "string",
    enum: ["VISIBLE", "PENDING_CONSENT"],
    description:
      "E4 §5.2 (regla T), igual para Directiva y Administración. PENDING_CONSENT: alguna participación contada no cubre los totales y no aplica la regla anterior; sin cifra",
  },
  totals_basis: {
    type: "string",
    nullable: true,
    enum: ["ROLE_CONSENT", "PREVIOUS_POLICY_K3", null],
    description:
      "ROLE_CONSENT: todas las participaciones contadas cubren los totales (ADMINISTRATION o TOTALS_ONLY), con cualquier número de personas. PREVIOUS_POLICY_K3: sólo al cierre, 3 o más personas y quien consulta no ve a ninguna por nombre (visible con la regla anterior). null con PENDING_CONSENT",
  },
};
const productTotalsRequired = ["participant_count", "total_quantity_base", "visibility", "totals_basis"];

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
    "can_view_participants",
    "is_responsible",
    "can_manage",
    "can_cancel_or_close",
    "delegations_suspended",
    "my_grants",
    "collaborator_count",
    "can_substitute_responsible",
    "pending_delegation_reviews",
    "pending_consent_count",
    "responsible_changes",
    "products",
    "origin",
    "origin_differs_from_current",
    "history",
  ],
  {
    contractVersion: { type: "integer", enum: [2], description: "E4: contrato institucional 2" },
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
    responsible: closed(["user_ref", "name", "role", "eligible", "version"], {
      user_ref: { type: "string" },
      name: { type: "string" },
      role: { type: "string", nullable: true, enum: ["DIRECTIVA", "ADMINISTRADOR", "AGRICULTOR"] },
      eligible: { type: "boolean", description: "Cuenta, Member y rol institucional activos (E2-D5)" },
      version: { type: "integer", minimum: 1, description: "P-A (§12): versión de la responsabilidad; la sube cada sustitución" },
    }),
    created_by: userRef,
    opened_by: nullableUserRef,
    cancelled_by: nullableUserRef,
    source_proposal_ref: { type: "string", format: "uuid", nullable: true },
    participant_count: { type: "integer", description: "Personas con participación vigente (o del consolidado)" },
    totals_source: {
      type: "string",
      enum: ["NONE", "LIVE", "CLOSING"],
      description: "LIVE: total provisional (OPEN/CANCELLED); CLOSING: consolidado al cierre; NONE: borrador",
    },
    can_view_participants: {
      type: "boolean",
      description: "E4 §2: quien consulta es una ADMINISTRADOR habilitada del sindicato ahora (por rol, leído en cada petición)",
    },
    is_responsible: { type: "boolean" },
    can_manage: { type: "boolean", description: "Responsable o MANAGE: editar el borrador, abrir, cancelar y cerrar (§10.2)" },
    can_cancel_or_close: {
      type: "boolean",
      description: "Igual a can_manage (N2 rechazada el 2026-11-12: ningún rol cancela ni cierra por defecto)",
    },
    delegations_suspended: { type: "boolean", description: "m6: la responsable no está habilitada; los permisos que concedió no se ejercen" },
    my_grants: { type: "array", items: { type: "string", enum: ["MANAGE"] }, description: "E4: sólo MANAGE (la responsable lo tiene por serlo)" },
    collaborator_count: { type: "integer", description: "Usuarios con MANAGE vigente concedido por la responsable" },
    can_substitute_responsible: {
      type: "boolean",
      description: "E4 §3.1: ADMINISTRADOR habilitada, la responsable ya no está habilitada y la convocatoria no está cancelada",
    },
    pending_delegation_reviews: { type: "integer", description: "Delegaciones MANAGE de una versión anterior pendientes de la revisión de la sucesora" },
    pending_consent_count: {
      type: "integer",
      description: "E4 §3.1: participaciones contadas cuyo consentimiento no cubre el alcance nuevo (ADMINISTRATION). Un conteo, sin nombres; para Directiva y Administración",
    },
    responsible_changes: {
      type: "array",
      description: "P-A: cada sustitución de la persona responsable, de la más antigua a la más reciente (sin datos de agricultores)",
      items: closed(["version", "at", "previous", "next", "actor", "reason", "call_status", "suspended_delegations"], {
        version: { type: "integer", minimum: 2 },
        at: dateTime,
        previous: userRef,
        next: userRef,
        actor: userRef,
        reason: { type: "string" },
        call_status: { type: "string", enum: ["DRAFT", "OPEN", "CLOSED"] },
        suspended_delegations: { type: "integer" },
      }),
    },
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
        totals: closed(productTotalsRequired, { ...productTotals }),
      }),
    },
    origin: closed(
      [
        "kind",
        "proposal_ref",
        "proposal_generated_at",
        "proposal_fingerprint",
        "selection_revision",
        "selection_matched",
        "recorded_at",
        "recorded_by",
        "products",
      ],
      {
        kind: { type: "string", enum: ["PROPOSAL", "CATALOG"] },
        proposal_ref: { type: "string", format: "uuid", nullable: true, description: "Borrador de propuesta de origen; null en CATALOG" },
        proposal_generated_at: { ...nullableDateTime, description: "Fecha en que se generó ese borrador (inmutable); null en CATALOG" },
        proposal_fingerprint: {
          type: "string",
          nullable: true,
          description:
            "Huella del borrador al crear la convocatoria; null en CATALOG, sin divulgación autorizada o si una cifra divulgada de ese borrador se retiró",
        },
        selection_revision: {
          type: "integer",
          nullable: true,
          description: "Revisión de la selección guardada del borrador al crear; null si nunca se guardó o en CATALOG",
        },
        selection_matched: {
          type: "boolean",
          nullable: true,
          description: "Los productos al crear eran exactamente los de esa selección (sin importar el orden); null sin selección",
        },
        recorded_at: { ...dateTime, description: "Hora del servidor al crear la convocatoria" },
        recorded_by: userRef,
        products: {
          type: "array",
          items: closed(["position", "product_ref", "product_name", "base_unit", "proposal_position"], {
            position: { type: "integer" },
            product_ref: { type: "string" },
            product_name: { type: "string" },
            base_unit: baseUnit,
            proposal_position: { type: "integer", nullable: true, description: "Línea del borrador de la que venía; null si no venía de una línea" },
          }),
        },
      },
      {
        nullable: true,
        description:
          "E3-P2: productos y procedencia al crear la convocatoria (inmutable); null en convocatorias anteriores al registro. Sin cantidades, cifras, aportantes ni estimaciones",
      },
    ),
    origin_differs_from_current: {
      type: "boolean",
      description: "Los productos actuales no son los del origen (sin importar el orden); false sin origen",
    },
    history: {
      type: "array",
      items: closed(["at", "kind", "actor", "detail"], {
        at: dateTime,
        kind: {
          type: "string",
          enum: [
            "CREATED",
            "UPDATED",
            "OPENED",
            "CLOSED",
            "CANCELLED",
            "RESPONSIBLE_ASSIGNED",
            "ACCESS_GRANTED",
            "ACCESS_REVOKED",
            "RESPONSIBLE_REPLACED",
            "ACCESS_CONFIRMED",
          ],
        },
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

const pendingConsentFields: Record<string, SchemaObject> = {
  pending_consent_count: {
    type: "integer",
    description: "E4: participaciones cuyo alcance vigente no es ADMINISTRATION; no se listan ni se nombran",
  },
  pending_consent_notice: { type: "string", nullable: true },
};

export const participantsSchema: SchemaObject = closed(
  [
    "contractVersion",
    "call_id",
    "status",
    "provisional",
    "notice",
    "participant_count",
    "pending_consent_count",
    "pending_consent_notice",
    "participants",
  ],
  {
    contractVersion: { type: "integer", enum: [2] },
    call_id: { type: "string", format: "uuid" },
    status: callStatus,
    provisional: { type: "boolean" },
    notice: { type: "string", nullable: true },
    participant_count: { type: "integer", description: "Todas las participaciones vigentes, listadas o no" },
    ...pendingConsentFields,
    participants: {
      type: "array",
      description: "E4: sólo para una ADMINISTRADOR habilitada (si no, 403 PARTICIPANTS_FORBIDDEN); sólo participaciones ACTIVE con alcance ADMINISTRATION",
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
    "can_view_participants",
    "lines",
    "participants",
    "pending_consent_count",
    "pending_consent_notice",
  ],
  {
    contractVersion: { type: "integer", enum: [2] },
    call_id: { type: "string", format: "uuid" },
    name: { type: "string" },
    status: { type: "string", enum: ["CLOSED"] },
    label: { type: "string" },
    mode: { type: "string", enum: ["MANUAL", "AUTOMATIC"] },
    cutoff_at: dateTime,
    closed_at: dateTime,
    closed_by: nullableUserRef,
    participant_count: { type: "integer" },
    can_view_participants: { type: "boolean", description: "ADMINISTRADOR habilitada ahora" },
    lines: {
      type: "array",
      items: closed(["product_ref", "product_name", "unit", "base_unit", ...productTotalsRequired], {
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
      description: "E4: sólo para una ADMINISTRADOR habilitada, las congeladas con alcance ADMINISTRATION; null en otro caso",
      items: closed(["participation_ref", "name", "accepted_at", "lines"], {
        participation_ref: { type: "string", format: "uuid" },
        name: { type: "string" },
        accepted_at: dateTime,
        lines: { type: "array", items: namedLine },
      }),
    },
    ...pendingConsentFields,
  },
);

const grantEnum: SchemaObject = { type: "string", enum: ["PARTICIPANTS", "MANAGE"] };

export const collaboratorsSchema: SchemaObject = closed(
  ["contractVersion", "call_id", "status", "responsible", "can_grant", "can_review", "responsible_version", "collaborators", "retired_grants", "history"],
  {
    contractVersion: { type: "integer", enum: [2] },
    call_id: { type: "string", format: "uuid" },
    status: callStatus,
    responsible: userRef,
    can_grant: { type: "boolean", description: "Sólo la responsable concede y revoca MANAGE" },
    can_review: { type: "boolean", description: "La responsable actual y habilitada revisa las delegaciones MANAGE de versiones anteriores" },
    responsible_version: { type: "integer", minimum: 1 },
    collaborators: {
      type: "array",
      items: closed(["user_ref", "name", "role", "grants"], {
        user_ref: { type: "string" },
        name: { type: "string" },
        role: { type: "string", nullable: true, enum: ["DIRECTIVA", "ADMINISTRADOR", "AGRICULTOR"] },
        grants: {
          type: "array",
          items: closed(["grant", "label", "granted_at", "granted_by", "status", "responsible_version"], {
            grant: { type: "string", enum: ["MANAGE"] },
            label: { type: "string" },
            granted_at: dateTime,
            granted_by: userRef,
            status: {
              type: "string",
              enum: ["IN_FORCE", "SUSPENDED", "PENDING_REVIEW"],
              description: "SUSPENDED: la responsable no está habilitada (m6); PENDING_REVIEW: concedida con una versión anterior (P-A)",
            },
            responsible_version: { type: "integer", minimum: 1 },
          }),
        },
      }),
    },
    retired_grants: {
      type: "array",
      description: "E4 §3.1: permisos de visualización (PARTICIPANTS) guardados, sólo como historia; no dan acceso",
      items: closed(["grant", "label", "user", "granted_at", "granted_by", "responsible_version", "retired", "notice"], {
        grant: { type: "string", enum: ["PARTICIPANTS"] },
        label: { type: "string" },
        user: userRef,
        granted_at: dateTime,
        granted_by: { ...nullableUserRef, description: "null: lo creó el sistema para la responsable al abrir o al sustituir" },
        responsible_version: { type: "integer", minimum: 1 },
        retired: { type: "boolean", enum: [true] },
        notice: { type: "string", example: "Permiso de visualización retirado el 2026-11-13; no da acceso." },
      }),
    },
    history: {
      type: "array",
      items: closed(["at", "action", "grant", "user", "actor", "retired", "notice"], {
        at: dateTime,
        action: { type: "string", enum: ["GRANTED", "REVOKED", "SUSPENDED", "CONFIRMED"] },
        grant: grantEnum,
        user: userRef,
        actor: userRef,
        retired: { type: "boolean", description: "true en todo evento PARTICIPANTS (permiso retirado)" },
        notice: { type: "string", nullable: true },
      }),
    },
  },
  { description: "Sin datos de agricultores" },
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

/** E4 §3.2: `GET /joint-purchase-substitution-permissions`, sólo lectura de historia. */
export const substitutionPermissionsSchema: SchemaObject = closed(["contractVersion", "retired_at", "notice", "can_grant", "holders", "history"], {
  contractVersion: { type: "integer", enum: [2] },
  retired_at: { ...dateTime, description: "Cuándo dejó de usarse en este entorno (la migración de E4)" },
  notice: { type: "string", enum: ["Ya no se usa: sustituye la Administración habilitada"] },
  can_grant: { type: "boolean", enum: [false] },
  holders: {
    type: "array",
    description: "Quién lo tenía al retirarse (las filas se conservan; no dan ningún poder)",
    items: closed(["user_ref", "name", "role", "granted_at", "granted_by", "reason"], {
      user_ref: { type: "string" },
      name: { type: "string" },
      role: { type: "string", nullable: true, enum: ["DIRECTIVA", "ADMINISTRADOR", "AGRICULTOR"] },
      granted_at: dateTime,
      granted_by: userRef,
      reason: { type: "string" },
    }),
  },
  history: {
    type: "array",
    items: closed(["at", "action", "user", "actor", "reason"], {
      at: dateTime,
      action: { type: "string", enum: ["GRANTED", "REVOKED"] },
      user: userRef,
      actor: userRef,
      reason: { type: "string", nullable: true },
    }),
  },
});
