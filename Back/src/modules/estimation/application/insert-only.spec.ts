import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * F12-EST-05 (#178, first criterion): in the routes and data access of the
 * estimation module there is no update nor delete of runs and results, and
 * no write outside the estimation tables (inventories, needs, proposals or
 * purchases, contract §7). The base enforces the same with triggers; this
 * reads the code that would have to call them.
 */
const root = resolve("src/modules/estimation");
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test-support" ? [] : sources(path);
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
  });
}

describe("estimation module: insert-only runs and results (F12-EST-05)", () => {
  const files = sources(root).map((path) => ({ path: relative(root, path), text: readFileSync(path, "utf8") }));

  it("reads the module's sources", () => {
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining([join("application", "estimation-worker.ts"), join("api", "rest", "estimation.controller.ts")]));
  });

  it("never updates nor deletes runs, results, series or points", () => {
    for (const { path, text } of files) {
      expect([path, text.match(/\.(estimationRun|estimationResult|consumptionSeries|seriesPoint)\.(update|updateMany|upsert|delete|deleteMany)\b/g)]).toEqual([path, null]);
      expect([path, text.match(/(UPDATE|DELETE FROM|TRUNCATE)\s+"(EstimationRun|EstimationResult|ConsumptionSeries|SeriesPoint)"/gi)]).toEqual([path, null]);
    }
  });

  it("only changes a job's operational state and never deletes it", () => {
    for (const { path, text } of files) {
      expect([path, text.match(/\.estimationJob\.(upsert|delete|deleteMany|updateMany)\b|DELETE FROM\s+"EstimationJob"/g)]).toEqual([path, null]);
    }
  });

  it("writes nothing outside the estimation tables", () => {
    const write = /\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g;
    const allowed = new Set(["campaignSeasonClassification", "consumptionSeries", "estimationJob", "estimationRun"]);
    for (const { path, text } of files) {
      const models = [...text.matchAll(write)].map((m) => m[1]!).filter((model) => !allowed.has(model));
      expect([path, models]).toEqual([path, []]);
    }
    expect(files.some(({ text }) => /\b(INSERT INTO|UPDATE)\s+"(?!EstimationJob")/.test(text))).toBe(false);
  });

  it("exposes no PUT, PATCH or DELETE route", () => {
    const controllers = files.filter(({ path }) => path.endsWith(".controller.ts"));
    expect(controllers.length).toBeGreaterThan(0);
    for (const { text } of controllers) expect(text).not.toMatch(/@(Put|Patch|Delete)\(/);
  });
});
