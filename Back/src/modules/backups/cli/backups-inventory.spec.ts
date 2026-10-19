import { parseArgs } from "./backups-inventory";

/** F10 (#40): the operator CLI never cleans without explicit arguments. */
describe("backups-inventory arguments", () => {
  it("inventory by default; cleanup only with an explicit age of at least 60 minutes", () => {
    expect(parseArgs([])).toEqual({ cleanup: false, olderThanMinutes: null, reconcile: false, apply: false });
    expect(parseArgs(["--cleanup", "--older-than-minutes", "60"])).toEqual({
      cleanup: true,
      olderThanMinutes: 60,
      reconcile: false,
      apply: false,
    });
    expect(parseArgs(["--cleanup", "--older-than-minutes", "1440", "--apply"]).apply).toBe(true);
  });

  it("reconciles pending purges as a dry-run unless --apply is given", () => {
    expect(parseArgs(["--reconcile"])).toEqual({
      cleanup: false,
      olderThanMinutes: null,
      reconcile: true,
      apply: false,
    });
    expect(parseArgs(["--reconcile", "--apply"]).apply).toBe(true);
  });

  it.each([
    [["--apply"]],
    [["--cleanup"]],
    [["--cleanup", "--apply"]],
    [["--cleanup", "--older-than-minutes", "59"]],
    [["--cleanup", "--older-than-minutes", "1h"]],
    [["--older-than-minutes", "120"]],
    [["--cleanup", "--older-than-minutes", "60", "--reconcile"]],
    [["--reconcile", "--older-than-minutes", "60"]],
    [["--purge"]],
  ])("rejects %j", (argv) => {
    expect(() => parseArgs(argv)).toThrow("uso:");
  });
});
