import { ConfigService } from "@nestjs/config";
import { envSchema } from "@/config/env.schema";
import { EstimationConfig } from "./estimation-config";

/** F12-EST-05: the worker's configuration is validated at start, like the rest of the environment. */
describe("EstimationConfig (F12-EST-05)", () => {
  const base = { DATABASE_URL: "postgresql://synthetic/db", JWT_SECRET: "x".repeat(12), JWT_REFRESH_SECRET: "y".repeat(32) };
  const configFrom = (env: Record<string, string>) => new EstimationConfig(new ConfigService(envSchema.parse({ ...base, ...env })));

  it("defaults to a worker that starts with the process, every 5 s, with a 5 min lease, 200 products and 3 attempts", () => {
    expect({ ...configFrom({}) }).toEqual({ maxProducts: 200, maxAttempts: 3, leaseMs: 300000, intervalMs: 5000, workerEnabled: true });
    expect({ ...configFrom({ ESTIMATION_WORKER: "", ESTIMATION_LEASE_MS: "" }) }).toMatchObject({ leaseMs: 300000, workerEnabled: true });
  });

  it("reads the validated values of the deployment", () => {
    expect({ ...configFrom({ ESTIMATION_WORKER: "disabled", ESTIMATION_WORKER_INTERVAL_MS: "1000", ESTIMATION_LEASE_MS: "60000", ESTIMATION_MAX_PRODUCTS: "50", ESTIMATION_MAX_ATTEMPTS: "5" }) }).toEqual({
      maxProducts: 50,
      maxAttempts: 5,
      leaseMs: 60000,
      intervalMs: 1000,
      workerEnabled: false,
    });
  });

  it("refuses to start with an invalid value instead of falling back silently", () => {
    for (const env of [
      { ESTIMATION_WORKER: "off" },
      { ESTIMATION_LEASE_MS: "abc" },
      { ESTIMATION_LEASE_MS: "50" },
      { ESTIMATION_WORKER_INTERVAL_MS: "1.5" },
      { ESTIMATION_MAX_PRODUCTS: "0" },
      { ESTIMATION_MAX_ATTEMPTS: "21" },
    ]) {
      expect(() => envSchema.parse({ ...base, ...env })).toThrow();
    }
  });
});
