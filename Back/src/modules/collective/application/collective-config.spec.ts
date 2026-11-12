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
