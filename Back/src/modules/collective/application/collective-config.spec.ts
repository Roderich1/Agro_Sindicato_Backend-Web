import { ConfigService } from "@nestjs/config";
import { CollectiveConfig } from "./collective-config";
import { presentation, summaryCsv } from "./collective-summary.use-case";

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

describe("collective output channels", () => {
  it("presents base units as L/KG exactly, without floats", () => {
    expect(presentation(0n)).toBe("0");
    expect(presentation(12500n)).toBe("12.5");
    expect(presentation(1n)).toBe("0.001");
    expect(presentation(9223372036854775807n)).toBe("9223372036854775.807");
  });

  it("the CSV carries the same decisions and nothing more", () => {
    const csv = summaryCsv({
      contractVersion: 1,
      campaign: { campaign_ref: "camp", name: "Campaña, 2026", status: "ABIERTA" },
      disclosure: { mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", approved: false, threshold: 3 },
      coverage: { linked_members: 5, members_with_contribution: 3, suppressed_cells: true },
      cells: [
        {
          projection_type: "DECLARED_NEED",
          product_ref: "p",
          product_name: 'Glifosato "48"',
          base_unit: "ML",
          presentation_unit: "L",
          status: "SUPPRESSED_UNDER_THRESHOLD",
          total_base: null,
          total_presentation: null,
          contributors: null,
          data_as_of: null,
          released_at: null,
          pending_changes: false,
        },
      ],
    });
    expect(csv).toContain('"Campaña, 2026"');
    expect(csv).toContain('"Glifosato ""48"""');
    expect(csv).toContain("SUPPRESSED_UNDER_THRESHOLD,,,,,,false");
    // F10-SEC-02: the coverage line says that some row has no figure, without a count.
    const [header, values] = csv.split(/\r?\n/);
    expect(header!.endsWith("linked_members,members_with_contribution,suppressed_cells")).toBe(true);
    expect(values!.endsWith(",5,3,true")).toBe(true);
  });

  it("a name that starts like a formula is neutralized, not executed (CSV injection)", () => {
    const cell = {
      projection_type: "DECLARED_NEED" as const,
      product_ref: "p",
      base_unit: "ML" as const,
      presentation_unit: "L" as const,
      status: "DISCLOSED" as const,
      total_base: "6000",
      total_presentation: "6",
      contributors: 3,
      data_as_of: "2026-10-16T10:00:00.000Z",
      released_at: "2026-10-16T10:00:00.000Z",
      pending_changes: false,
    };
    const names = ['=HYPERLINK("http://x","y")', "+1+1", "-2+3", "@SUM(A1)", "\tTab", "\rCR"];
    const csv = summaryCsv({
      contractVersion: 1,
      campaign: { campaign_ref: "camp", name: "=1+1", status: "ABIERTA" },
      disclosure: { mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", approved: false, threshold: 3 },
      coverage: { linked_members: 5, members_with_contribution: 3, suppressed_cells: true },
      cells: names.map((product_name) => ({ ...cell, product_name })),
    });
    const fields = csv.split("\n").flatMap((line) => line.split(","));
    // No field may start with a formula trigger once parsed by a spreadsheet.
    for (const field of fields) expect(field.replace(/^"/, "")).not.toMatch(/^[=+\-@\t\r]/);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csv).toContain("\"'=1+1\"");
    expect(csv).toContain("\"'-2+3\"");
    // Figures and dates are untouched.
    expect(csv).toContain("DISCLOSED,6000,6,3,2026-10-16T10:00:00.000Z");
  });
});
