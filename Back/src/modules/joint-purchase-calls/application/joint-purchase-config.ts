import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const DEFAULT_CLOSE_INTERVAL_MS = 60_000;

/**
 * `JOINT_PURCHASE_CLOSE_INTERVAL_MS` (E2-D12): how often the automatic close
 * looks for OPEN calls whose deadline passed. Empty = 60000; `0` or
 * `disabled` = off (tests drive it, or the Directiva closes by hand). The
 * value is validated at start by `envSchema`.
 */
export function closeIntervalFrom(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_CLOSE_INTERVAL_MS;
  if (raw === "disabled" || raw === "0" || raw === 0) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 100 ? value : DEFAULT_CLOSE_INTERVAL_MS;
}

@Injectable()
export class JointPurchaseConfig {
  /** Null: the automatic close does not run in this process. */
  readonly closeIntervalMs: number | null;

  constructor(config: ConfigService) {
    this.closeIntervalMs = closeIntervalFrom(config.get<string | number>("JOINT_PURCHASE_CLOSE_INTERVAL_MS"));
  }
}
