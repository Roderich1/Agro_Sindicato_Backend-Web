import { ConfigService } from "@nestjs/config";
import { CollectiveConfig } from "./collective-config";
import { presentation } from "./collective-summary.use-case";

function config(values: Record<string, string | undefined>) {
  return new CollectiveConfig({ get: (key: string) => values[key] } as unknown as ConfigService);
}

describe("collective disclosure configuration (F06 §5, F07-POL-01)", () => {
  it("defaults to no figures", () => {
    expect(config({ NODE_ENV: "development" }).mode).toBe("POLICY_PENDING");
    expect(config({ NODE_ENV: "development", COLLECTIVE_DISCLOSURE_MODE: "disabled" }).mode).toBe("POLICY_PENDING");
  });

  it("allows the provisional policy only outside production", () => {
    expect(config({ NODE_ENV: "test", COLLECTIVE_DISCLOSURE_MODE: "provisional-synthetic" }).mode).toBe(
      "PROVISIONAL_SYNTHETIC",
    );
    expect(config({ NODE_ENV: "production", COLLECTIVE_DISCLOSURE_MODE: "provisional-synthetic" }).mode).toBe(
      "POLICY_PENDING",
    );
  });
});

describe("E4 §5.1: collective disclosure policy (D-03)", () => {
  it("defaults to F07-POL-01 (threshold 3) when the variable is absent or empty, not explicit", () => {
    for (const value of [undefined, ""]) {
      const c = config({ NODE_ENV: "test", COLLECTIVE_DISCLOSURE_POLICY: value });
      expect([c.policy, c.threshold, c.policyExplicit]).toEqual(["F07-POL-01", 3, false]);
    }
  });

  it("applies F07-POL-02 (no threshold) only when set explicitly; F07-POL-01 explicit is recorded as explicit", () => {
    const pol02 = config({ NODE_ENV: "test", COLLECTIVE_DISCLOSURE_POLICY: "F07-POL-02" });
    expect([pol02.policy, pol02.threshold, pol02.policyExplicit]).toEqual(["F07-POL-02", null, true]);
    const pol01 = config({ NODE_ENV: "test", COLLECTIVE_DISCLOSURE_POLICY: "F07-POL-01" });
    expect([pol01.policy, pol01.threshold, pol01.policyExplicit]).toEqual(["F07-POL-01", 3, true]);
  });

  it("an unknown value stops the start (never a silent fallback)", () => {
    for (const value of ["F07-POL-03", "f07-pol-02", "none", "K=1"]) {
      expect(() => config({ NODE_ENV: "test", COLLECTIVE_DISCLOSURE_POLICY: value })).toThrow(/COLLECTIVE_DISCLOSURE_POLICY/);
    }
  });
});

describe("collective seal configuration (F07, 2026-10-23)", () => {
  it("keeps the manual seal off unless explicitly enabled", () => {
    expect(config({ NODE_ENV: "test" }).sealingEnabled).toBe(false);
    expect(config({ NODE_ENV: "test", COLLECTIVE_SEALING: "disabled" }).sealingEnabled).toBe(false);
    expect(config({ NODE_ENV: "test", COLLECTIVE_SEALING: "yes" }).sealingEnabled).toBe(false);
    expect(config({ NODE_ENV: "test", COLLECTIVE_SEALING: "enabled" }).sealingEnabled).toBe(true);
  });
});

describe("collective figures presentation", () => {
  it("presents base units as L/KG exactly, without floats", () => {
    expect(presentation(0n)).toBe("0");
    expect(presentation(12500n)).toBe("12.5");
    expect(presentation(1n)).toBe("0.001");
    expect(presentation(9223372036854775807n)).toBe("9223372036854775.807");
  });
});
