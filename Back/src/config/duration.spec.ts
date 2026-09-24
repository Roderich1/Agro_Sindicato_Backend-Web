import { envSchema } from "./env.schema";
import { parseDurationMs } from "./duration";

describe("auth duration configuration", () => {
  it.each([
    ["30s", 30_000],
    ["15m", 900_000],
    ["8h", 28_800_000],
    ["7d", 604_800_000],
  ])("parses %s exactly", (value, expected) => {
    expect(parseDurationMs(value, "TEST_TTL")).toBe(expected);
  });

  it.each(["", "0s", "15", "1w", "1.5h", "-1d", "invalid"])(
    "fails fast for invalid duration %p",
    (value) => {
      expect(() => parseDurationMs(value, "TEST_TTL")).toThrow();
    },
  );

  it("rejects invalid JWT configuration instead of falling back silently", () => {
    expect(() =>
      envSchema.parse({
        DATABASE_URL: "postgresql://example",
        JWT_SECRET: "twelve-chars-minimum",
        JWT_REFRESH_SECRET: "x".repeat(32),
        JWT_EXPIRES_IN: "15 minutes",
        JWT_REFRESH_EXPIRES_IN: "7d",
      }),
    ).toThrow();
  });
});
