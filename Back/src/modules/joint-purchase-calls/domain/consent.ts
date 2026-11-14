/**
 * E2-D9, E2-P3 (§10.2), P-C (§10.6) and E4 §4 (2026-11-13): versioned consent
 * of a participation. A new text (or help) needs a new version; an accepted
 * consent is never rewritten.
 *
 * The consent has a SCOPE, decided by the farmer on its own and never by
 * sending quantities. Since E4 the identified detail is consulted by role,
 * not by the responsible:
 * - `ADMINISTRATION` (CONV-4): the eligible Administración of the tenant sees
 *   the farmer's name and quantities; the totals are covered;
 * - `TOTALS_ONLY` (D-05): the farmer withdrew that authorization; nobody sees
 *   the detail, the totals are still covered (the totals clause was accepted);
 * - `RESPONSIBLE_ONLY` and `COLLABORATORS` (earlier texts): kept as accepted.
 *   They reach nobody's detail any more (their texts named the responsible,
 *   who no longer has access) and do not cover totals below the earlier rule.
 *
 * Versions:
 * - `CONV-4` (current, E4): the access by role. A first confirmation with it
 *   gives `ADMINISTRATION`.
 * - `CONV-3` (N5 of 2026-11-12): responsible, and collaborators if widened.
 *   Still accepted from operations prepared before updating: `RESPONSIBLE_ONLY`.
 * - `CONV-2` (2026-11-11, never published outside the isolated environment):
 *   a first confirmation with it gives `COLLABORATORS`.
 * - `CONV-1` (E2-D9): only the responsible; `RESPONSIBLE_ONLY`.
 */
export const CONSENT_V4_VERSION = "CONV-4";
export const CONSENT_V4_TEXT =
  "Las personas de Administración habilitadas de su sindicato podrán ver su nombre y las cantidades que solicita para coordinar esta compra conjunta y su entrega. La Directiva podrá consultar los totales por producto, sin el detalle identificado de su participación. Los totales pueden mostrarse aunque participe una sola persona. Esta participación no genera una deuda.";
export const CONSENT_V4_HELP =
  "Aunque el total no muestre nombres, con pocas participaciones podría deducirse cuánto solicitó una persona.";

/** The version served to every farmer read (E4 §7.1). */
export const CONSENT_VERSION = CONSENT_V4_VERSION;
export const CONSENT_TEXT = CONSENT_V4_TEXT;
export const CONSENT_HELP = CONSENT_V4_HELP;

export const CONSENT_V3_VERSION = "CONV-3";
export const CONSENT_V3_TEXT =
  "La persona responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas. Si tú lo autorizas, también podrán verlos las personas de la Directiva o la Administración que ella autorice para esta convocatoria. Los datos se usan para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

export const CONSENT_V2_VERSION = "CONV-2";
export const CONSENT_V2_TEXT =
  "La persona responsable de esta compra conjunta y quienes ella autorice para coordinarla podrán ver tu nombre y las cantidades que solicitas, para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

/** The earlier text (E2-D9), kept to read and to accept it from phones not yet updated. */
export const CONSENT_V1_VERSION = "CONV-1";
export const CONSENT_V1_TEXT =
  "El responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

export const ACCEPTED_CONSENT_VERSIONS: readonly string[] = [CONSENT_V1_VERSION, CONSENT_V2_VERSION, CONSENT_V3_VERSION, CONSENT_V4_VERSION];

/** The scopes of the texts before E4 (the only ones contracts 1–3 know). */
export type ConsentScope = "RESPONSIBLE_ONLY" | "COLLABORATORS";

/** E4 §4.2: every scope a participation may hold. */
export type ParticipationScope = "RESPONSIBLE_ONLY" | "COLLABORATORS" | "ADMINISTRATION" | "TOTALS_ONLY";
export const PARTICIPATION_SCOPES: readonly ParticipationScope[] = ["RESPONSIBLE_ONLY", "COLLABORATORS", "ADMINISTRATION", "TOTALS_ONLY"];

/** Scopes unknown to contracts 1–3 (E4 §7.2: their writes get 409 APP_UPDATE_REQUIRED). */
export function isNewScope(scope: string): boolean {
  return scope === "ADMINISTRATION" || scope === "TOTALS_ONLY";
}

/** A first confirmation is accepted with any of the known versions. */
export function isAcceptedConsent(version: unknown): boolean {
  return typeof version === "string" && ACCEPTED_CONSENT_VERSIONS.includes(version);
}

/** The scope a first confirmation gives, by the text the farmer accepted (never CONV-4 for an older text). */
export function initialScopeOf(version: string): ParticipationScope {
  if (version === CONSENT_V4_VERSION) return "ADMINISTRATION";
  return version === CONSENT_V2_VERSION ? "COLLABORATORS" : "RESPONSIBLE_ONLY";
}

/** E4 §2: only `ADMINISTRATION` reaches the eligible Administración's identified detail (nobody else's). */
export function coversDetail(scope: string): boolean {
  return scope === "ADMINISTRATION";
}

/** E4 §5.2: the scopes whose text accepted that totals may be shown with any number of persons. */
export function coversTotals(scope: string): boolean {
  return scope === "ADMINISTRATION" || scope === "TOTALS_ONLY";
}
