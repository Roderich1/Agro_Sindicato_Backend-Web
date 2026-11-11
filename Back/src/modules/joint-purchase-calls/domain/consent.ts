/**
 * E2-D9: versioned consent shown on the phone before confirming a
 * participation. A new text needs a new version (CONV-2, …) and a contract
 * change; the server only accepts the current one.
 */
export const CONSENT_VERSION = "CONV-1";

export const CONSENT_TEXT =
  "El responsable de esta compra conjunta podrá ver tu nombre y las cantidades que solicitas para coordinar la compra y la entrega. Esta confirmación no genera una deuda.";

export function isCurrentConsent(version: unknown): boolean {
  return version === CONSENT_VERSION;
}
