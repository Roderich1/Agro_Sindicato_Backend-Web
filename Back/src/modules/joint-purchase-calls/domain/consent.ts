/**
 * E2-D9 and E2-P3 (§10.2): versioned consent shown on the phone before
 * confirming a participation. A new text needs a new version and a contract
 * change.
 *
 * - `CONV-2` is the current text: the responsible and whoever the responsible
 *   authorizes to coordinate the purchase may see the farmer's name and
 *   quantities.
 * - `CONV-1` (the earlier text: only the responsible) is still accepted from
 *   phones not yet updated. It is never extended retroactively: a
 *   participation whose last accepted confirmation carried `CONV-1` is seen
 *   only by the responsible (see `domain/visibility.ts`).
 */
export const CONSENT_VERSION = "CONV-2";

export const CONSENT_TEXT =
  "La persona responsable de esta compra conjunta y quienes ella autorice para coordinarla podrán ver tu nombre y las cantidades que solicitas, para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

/** The earlier text (E2-D9), kept to read and to accept it from phones not yet updated. */
export const CONSENT_V1_VERSION = "CONV-1";
export const CONSENT_V1_TEXT =
  "El responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

export const ACCEPTED_CONSENT_VERSIONS: readonly string[] = [CONSENT_V1_VERSION, CONSENT_VERSION];

/** A confirmation is accepted with the current version or with `CONV-1`. */
export function isAcceptedConsent(version: unknown): boolean {
  return typeof version === "string" && ACCEPTED_CONSENT_VERSIONS.includes(version);
}

/** Only `CONV-2` (and later texts that say so) covers collaborators authorized by the responsible. */
export function consentCoversCollaborators(version: string): boolean {
  return version === CONSENT_VERSION;
}
