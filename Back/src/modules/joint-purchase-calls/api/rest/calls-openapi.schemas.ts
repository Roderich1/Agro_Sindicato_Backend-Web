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
        scope: { type: "string", enum: ["RESPONSIBLE_ONLY", "COLLABORATORS"] },
        version: { type: "string", example: "CONV-3", description: "Texto citado por la decisión que fijó el alcance" },
        decided_at: { ...dateTime, description: "Declarada por el teléfono" },
        received_at: { ...dateTime, description: "Hora del servidor" },
        sequence: { type: "integer", minimum: 0, description: "Orden de la decisión (0 = la aceptación inicial)" },
      },
      {
        description:
          "§10.6 (P-C): alcance vigente del consentimiento. Sólo en los contratos 2 y 3 (cabecera X-Joint-Purchase-Contract); las cantidades nunca lo cambian",
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
          "P-A C1 (§12): sólo en el contrato 3 (cabecera X-Joint-Purchase-Contract: 3). Puede faltar en la respuesta repetida de una operación registrada antes",
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
        responsible: closed(["name"], {
          name: { type: "string" },
          version: { type: "integer", minimum: 1, description: "P-A (§12): versión de la responsabilidad; sólo en el contrato 3" },
        }),
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

const consentSchema = closed(["version", "text"], {
  version: {
    type: "string",
    example: "CONV-3",
    description: "Contratos 2 y 3: CONV-3 (vigente). Contrato 1 (teléfonos que no envían la cabecera): CONV-1, el texto que esas versiones muestran",
  },
  text: { type: "string" },
});

export const farmerListSchema: SchemaObject = closed(["contractVersion", "server_time", "consent", "calls"], {
  contractVersion: {
    type: "integer",
    enum: [1, 2, 3],
    description:
      "3 con la cabecera X-Joint-Purchase-Contract: 3 (P-A §12); 2 con la cabecera 2 (sin responsible.version ni responsible_authorization). Sin cabecera, la forma del contrato 1 (N7): consentimiento CONV-1, sin history ni consent_scope",
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
  contractVersion: { type: "integer", enum: [1, 2, 3] },
  server_time: dateTime,
  consent: consentSchema,
  calls: { type: "array", items: farmerCallSchema, description: "Sólo CLOSED/CANCELLED con participación propia, de la más reciente a la más antigua" },
  next_cursor: { type: "string", nullable: true, description: "Opaco; null en la última página" },
});

const productTotals: Record<string, SchemaObject> = {
  participant_count: { type: "integer" },
  total_quantity_base: { ...quantity, nullable: true, description: "null salvo VISIBLE" },
  visibility: {
    type: "string",
    enum: ["VISIBLE", "UNDER_THRESHOLD", "RESPONSIBLE_ONLY", "RESTRICTED"],
    description: "RESTRICTED (P-A C1): el producto tiene una participación aún no autorizada para la persona responsable actual",
  },
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
    "can_manage",
    "can_cancel_or_close",
    "delegations_suspended",
    "my_grants",
    "collaborator_count",
    "has_substitution_permission",
    "can_substitute_responsible",
    "pending_delegation_reviews",
    "pending_authorization_count",
    "responsible_changes",
    "products",
    "origin",
    "origin_differs_from_current",
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
    totals_source: { type: "string", enum: ["NONE", "LIVE", "CLOSING"] },
    totals_threshold: { type: "integer", example: 3 },
    can_view_participants: { type: "boolean", description: "Tiene PARTICIPANTS ahora (responsable o colaborador)" },
    is_responsible: { type: "boolean" },
    can_manage: { type: "boolean", description: "Responsable o MANAGE: editar el borrador, abrir, cancelar y cerrar (§10.2)" },
    can_cancel_or_close: {
      type: "boolean",
      description: "Igual a can_manage (N2 rechazada el 2026-11-12: ningún rol cancela ni cierra por defecto)",
    },
    delegations_suspended: { type: "boolean", description: "m6: la responsable no está habilitada; los permisos que concedió no se ejercen" },
    my_grants: { type: "array", items: { type: "string", enum: ["MANAGE", "PARTICIPANTS"] } },
    collaborator_count: { type: "integer", description: "Usuarios con algún permiso vigente concedido por la responsable" },
    has_substitution_permission: { type: "boolean", description: "P-A A1: quien consulta tiene «Sustituir responsable» y está habilitada" },
    can_substitute_responsible: {
      type: "boolean",
      description: "P-A B1: tiene el permiso, la responsable ya no está habilitada y la convocatoria no está cancelada",
    },
    pending_delegation_reviews: { type: "integer", description: "P-A: delegaciones de una versión anterior pendientes de la revisión de la sucesora" },
    pending_authorization_count: {
      type: "integer",
      description: "P-A C1: participaciones aún no autorizadas para la responsable actual (sólo para quien tiene PARTICIPANTS; 0 en otro caso)",
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
        totals: closed(["participant_count", "total_quantity_base", "visibility"], { ...productTotals }),
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

const hiddenFields: Record<string, SchemaObject> = {
  hidden_participant_count: {
    type: "integer",
    description: "Participaciones cuyo alcance vigente es RESPONSIBLE_ONLY (§10.6), que este colaborador no ve; 0 para el responsable",
  },
  hidden_notice: { type: "string", nullable: true },
  pending_authorization_count: {
    type: "integer",
    description: "P-A C1: participaciones cuyo agricultor aún no autorizó a la responsable actual; nadie las ve por nombre",
  },
  pending_authorization_notice: { type: "string", nullable: true },
};

export const participantsSchema: SchemaObject = closed(
  [
    "contractVersion",
    "call_id",
    "status",
    "provisional",
    "notice",
    "participant_count",
    "hidden_participant_count",
    "hidden_notice",
    "pending_authorization_count",
    "pending_authorization_notice",
    "participants",
  ],
  {
    contractVersion: { type: "integer", enum: [1] },
    call_id: { type: "string", format: "uuid" },
    status: callStatus,
    provisional: { type: "boolean" },
    notice: { type: "string", nullable: true },
    participant_count: { type: "integer", description: "Todas las participaciones vigentes, vistas o no" },
    ...hiddenFields,
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
    "hidden_participant_count",
    "hidden_notice",
    "pending_authorization_count",
    "pending_authorization_notice",
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
      description: "Sólo con PARTICIPANTS; un colaborador recibe sólo las de CONV-2 (§10.3); null en otro caso",
      items: closed(["participation_ref", "name", "accepted_at", "lines"], {
        participation_ref: { type: "string", format: "uuid" },
        name: { type: "string" },
        accepted_at: dateTime,
        lines: { type: "array", items: namedLine },
      }),
    },
    ...hiddenFields,
  },
);

const grantEnum: SchemaObject = { type: "string", enum: ["PARTICIPANTS", "MANAGE"] };

export const collaboratorsSchema: SchemaObject = closed(
  ["contractVersion", "call_id", "status", "responsible", "can_grant", "can_review", "responsible_version", "collaborators", "history"],
  {
    contractVersion: { type: "integer", enum: [1] },
    call_id: { type: "string", format: "uuid" },
    status: callStatus,
    responsible: userRef,
    can_grant: { type: "boolean", description: "Sólo el responsable concede y revoca" },
    can_review: { type: "boolean", description: "P-A: la responsable actual y habilitada revisa las delegaciones de versiones anteriores" },
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
            grant: grantEnum,
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
    history: {
      type: "array",
      items: closed(["at", "action", "grant", "user", "actor"], {
        at: dateTime,
        action: { type: "string", enum: ["GRANTED", "REVOKED", "SUSPENDED", "CONFIRMED"] },
        grant: grantEnum,
        user: userRef,
        actor: userRef,
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

/** P-A A1 (§12): `GET|POST /joint-purchase-substitution-permissions`. */
export const substitutionPermissionsSchema: SchemaObject = closed(["contractVersion", "can_grant", "holds_permission", "holders", "history"], {
  contractVersion: { type: "integer", enum: [1] },
  can_grant: { type: "boolean", description: "Sólo una persona ADMINISTRADOR habilitada concede y revoca" },
  holds_permission: { type: "boolean", description: "Quien consulta tiene el permiso y está habilitada" },
  holders: {
    type: "array",
    items: closed(["user_ref", "name", "role", "eligible", "granted_at", "granted_by", "reason"], {
      user_ref: { type: "string" },
      name: { type: "string" },
      role: { type: "string", nullable: true, enum: ["DIRECTIVA", "ADMINISTRADOR", "AGRICULTOR"] },
      eligible: { type: "boolean", description: "Habilitada ahora; si no, el permiso no se ejerce" },
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
