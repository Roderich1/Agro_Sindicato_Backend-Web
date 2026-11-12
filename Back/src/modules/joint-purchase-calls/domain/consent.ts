/**
 * E2-D9, E2-P3 (§10.2) and P-C (§10.6): versioned consent of a participation.
 * A new text needs a new version; an accepted consent is never rewritten.
 *
 * The consent has a SCOPE, decided by the farmer on its own and never by
 * sending quantities:
 * - `RESPONSIBLE_ONLY`: only the responsible sees the farmer's name and
 *   quantities;
 * - `COLLABORATORS`: also the people of the Directiva or the Administración
 *   the responsible authorizes for that call.
 *
 * Versions:
 * - `CONV-3` (current, N5 of 2026-11-12): one text that explains both scopes.
 *   Accepting it when confirming the first time gives `RESPONSIBLE_ONLY`;
 *   widening to `COLLABORATORS` is a separate, explicit decision.
 * - `CONV-2` (2026-11-11, never published outside the isolated environment):
 *   its text covered collaborators, so a first confirmation with it gives
 *   `COLLABORATORS`. Kept so that what was accepted keeps its meaning.
 * - `CONV-1` (E2-D9): only the responsible. Still accepted from phones not
 *   yet updated, with `RESPONSIBLE_ONLY`.
 */
export const CONSENT_VERSION = "CONV-3";

export const CONSENT_TEXT =
  "La persona responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas. Si tú lo autorizas, también podrán verlos las personas de la Directiva o la Administración que ella autorice para esta convocatoria. Los datos se usan para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

export const CONSENT_V2_VERSION = "CONV-2";
export const CONSENT_V2_TEXT =
  "La persona responsable de esta compra conjunta y quienes ella autorice para coordinarla podrán ver tu nombre y las cantidades que solicitas, para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

/** The earlier text (E2-D9), kept to read and to accept it from phones not yet updated. */
export const CONSENT_V1_VERSION = "CONV-1";
export const CONSENT_V1_TEXT =
  "El responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

export const ACCEPTED_CONSENT_VERSIONS: readonly string[] = [CONSENT_V1_VERSION, CONSENT_V2_VERSION, CONSENT_VERSION];

export type ConsentScope = "RESPONSIBLE_ONLY" | "COLLABORATORS";

/** A first confirmation is accepted with any of the known versions. */
export function isAcceptedConsent(version: unknown): boolean {
  return typeof version === "string" && ACCEPTED_CONSENT_VERSIONS.includes(version);
}

/** The scope a first confirmation gives, by the text the farmer accepted. */
export function initialScopeOf(version: string): ConsentScope {
  return version === CONSENT_V2_VERSION ? "COLLABORATORS" : "RESPONSIBLE_ONLY";
}

/**
 * §10.6: which text a separate decision may cite. Widening needs the text
 * that explains it (`CONV-3`); a reduction is always respected, whatever
 * known text the phone showed.
 */
export function decisionVersionAccepted(scope: ConsentScope, version: string): boolean {
  if (scope === "COLLABORATORS") return version === CONSENT_VERSION;
  return ACCEPTED_CONSENT_VERSIONS.includes(version);
}

/** Only the `COLLABORATORS` scope reaches collaborators authorized by the responsible. */
export function scopeCoversCollaborators(scope: string): boolean {
  return scope === "COLLABORATORS";
}
