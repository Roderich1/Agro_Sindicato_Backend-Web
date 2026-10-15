import { createHmac } from "node:crypto";
import type { SyncV1Envelope } from "./envelope";
import {
  canonicalVector,
  FingerprintKeyring,
  FingerprintKeyringError,
} from "./fingerprint";

const keyA = Buffer.alloc(32, 0x41);
const keyB = Buffer.alloc(32, 0x42);

const envelope = (overrides: Partial<SyncV1Envelope["payload"]> = {}): SyncV1Envelope => ({
  contractVersion: 1,
  operationId: "11111111-1111-4111-8111-111111111111",
  projectionType: "DECLARED_NEED",
  action: "PUBLISH",
  causal: { predecessorOperationId: null, reconciliationReference: null },
  payload: {
    campaign_ref: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    product_ref: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    base_unit: "ML",
    quantity_base: "1250",
    ...overrides,
  },
});

describe("Sync v1 fingerprint (contract §5)", () => {
  it("uses the canonical compact vector in the contract's order", () => {
    expect(canonicalVector(envelope())).toBe(
      '[1,"11111111-1111-4111-8111-111111111111","DECLARED_NEED","PUBLISH",null,null,' +
        '"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","ML","1250"]',
    );
    expect(canonicalVector(envelope({ quantity_base: null }))).toMatch(/,null\]$/);
  });

  it("is an HMAC-SHA-256 of that vector under the versioned key", () => {
    const keyring = new FingerprintKeyring(1, keyA);
    const expected = createHmac("sha256", keyA)
      .update(canonicalVector(envelope()))
      .digest();
    expect(keyring.fingerprint(envelope())).toEqual(expected);
    expect(keyring.fingerprint(envelope())!.byteLength).toBe(32);
  });

  it("changes with any semantic field and depends on the key", () => {
    const keyring = new FingerprintKeyring(1, keyA);
    const base = keyring.fingerprint(envelope())!;
    expect(keyring.fingerprint(envelope({ quantity_base: "1251" }))).not.toEqual(base);
    expect(keyring.fingerprint(envelope({ base_unit: "G" }))).not.toEqual(base);
    expect(new FingerprintKeyring(1, keyB).fingerprint(envelope())).not.toEqual(base);
  });

  it("verifies with previous versions after a rotation and forgets unknown ones", () => {
    const before = new FingerprintKeyring(1, keyA);
    const after = new FingerprintKeyring(2, keyB, new Map([[1, keyA]]));
    expect(after.currentVersion).toBe(2);
    expect(after.fingerprint(envelope(), 1)).toEqual(before.fingerprint(envelope()));
    expect(after.fingerprint(envelope(), 3)).toBeNull();
  });

  it("reads base64 keys from the environment and rejects weak or malformed ones", () => {
    expect(FingerprintKeyring.fromEnvironment({})).toBeNull();
    const keyring = FingerprintKeyring.fromEnvironment({
      key: keyB.toString("base64"),
      version: 2,
      previous: `1=${keyA.toString("base64")}`,
    })!;
    expect(keyring.fingerprint(envelope(), 1)).toEqual(
      new FingerprintKeyring(1, keyA).fingerprint(envelope()),
    );
    for (const env of [
      { key: Buffer.alloc(16).toString("base64"), version: 1 },
      { key: keyA.toString("base64") },
      { key: "not base64!", version: 1 },
      { key: keyA.toString("base64"), version: 0 },
      { key: keyA.toString("base64"), version: 1, previous: `1=${keyB.toString("base64")}` },
      { key: keyA.toString("base64"), version: 2, previous: "garbage" },
    ]) {
      expect(() => FingerprintKeyring.fromEnvironment(env)).toThrow(
        FingerprintKeyringError,
      );
    }
  });

  it("never puts the key in its errors", () => {
    const secret = Buffer.from("short-secret-value").toString("base64");
    try {
      FingerprintKeyring.fromEnvironment({ key: secret, version: 1 });
      throw new Error("expected rejection");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
