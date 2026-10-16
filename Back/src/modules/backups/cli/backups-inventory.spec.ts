import { parseArgs } from "./backups-inventory";

/** F10 (#40): the operator CLI never cleans without explicit arguments. */
describe("backups-inventory arguments", () => {
  it("inventory by default; cleanup only with an explicit age of at least 60 minutes", () => {
    expect(parseArgs([])).toEqual({ cleanup: false, olderThanMinutes: null, apply: false });
    expect(parseArgs(["--cleanup", "--older-than-minutes", "60"])).toEqual({
      cleanup: true,
      olderThanMinutes: 60,
      apply: false,
    });
    expect(parseArgs(["--cleanup", "--older-than-minutes", "1440", "--apply"]).apply).toBe(true);
  });

  it.each([
    [["--apply"]],
    [["--cleanup"]],
    [["--cleanup", "--apply"]],
    [["--cleanup", "--older-than-minutes", "59"]],
    [["--cleanup", "--older-than-minutes", "1h"]],
    [["--older-than-minutes", "120"]],
    [["--purge"]],
  ])("rejects %j", (argv) => {
    expect(() => parseArgs(argv)).toThrow("uso:");
  });
});
