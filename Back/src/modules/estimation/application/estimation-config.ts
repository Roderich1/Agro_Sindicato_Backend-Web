import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * F12-EST-05 deployment parameters and technical limits (contract §4.2,
 * EST-D-16). None of them is a business rule:
 * - ESTIMATION_MAX_PRODUCTS (200): products per job;
 * - ESTIMATION_MAX_ATTEMPTS (3): attempts of a job, fixed when it is queued;
 * - ESTIMATION_LEASE_MS (300000): how long a worker owns a job it took;
 * - ESTIMATION_WORKER_INTERVAL_MS (5000): how often the worker looks for a job;
 * - ESTIMATION_WORKER=disabled: the worker does not start with the
 *   application (tests drive it explicitly; jobs then wait in the queue).
 * The values are validated at start by `envSchema` (src/config/env.schema.ts).
 */
@Injectable()
export class EstimationConfig {
  readonly maxProducts: number;
  readonly maxAttempts: number;
  readonly leaseMs: number;
  readonly intervalMs: number;
  readonly workerEnabled: boolean;

  constructor(config: ConfigService) {
    const positive = (name: string, fallback: number) => {
      const value = Number(config.get<string>(name) ?? fallback);
      return Number.isInteger(value) && value >= 1 ? value : fallback;
    };
    this.maxProducts = positive("ESTIMATION_MAX_PRODUCTS", 200);
    this.maxAttempts = positive("ESTIMATION_MAX_ATTEMPTS", 3);
    this.leaseMs = positive("ESTIMATION_LEASE_MS", 300000);
    this.intervalMs = positive("ESTIMATION_WORKER_INTERVAL_MS", 5000);
    this.workerEnabled = config.get<string>("ESTIMATION_WORKER") !== "disabled";
  }
}
