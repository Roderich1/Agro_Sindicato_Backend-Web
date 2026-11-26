import { CollectiveConfig, storedDisclosureMode, storedPolicy, thresholdOf } from "./collective-config";

describe("collective disclosure", () => {
  it("applies the approved rule without a runtime configuration gate", () => {
    expect(new CollectiveConfig()).toMatchObject({
      mode: "APPROVED",
      policy: "F07-POL-02",
      threshold: null,
    });
  });

  it("preserves the provenance of earlier snapshots", () => {
    expect(storedPolicy(null)).toBe("F07-POL-01");
    expect(thresholdOf(storedPolicy(null))).toBe(3);
    expect(storedPolicy("F07-POL-02")).toBe("F07-POL-02");
    expect(storedDisclosureMode("PROVISIONAL_SYNTHETIC")).toBe("PROVISIONAL_SYNTHETIC");
    expect(storedDisclosureMode("APPROVED")).toBe("APPROVED");
  });
});
