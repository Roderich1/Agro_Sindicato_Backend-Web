import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type DisclosureMode = "POLICY_PENDING" | "PROVISIONAL_SYNTHETIC";

/**
 * E4 §5.1: the disclosure policy of the collective figures.
 * - `F07-POL-01`: provisional threshold of 3 Members and rule of differences
 *   and combinations (F07_AGGREGATE_DISCLOSURE_POLICY). The default.
 * - `F07-POL-02`: no farmer threshold (F06 §5 amended on 2026-11-13, D-00);
 *   withdrawals, zero versus absence, units and overflow are kept.
 */
export type DisclosurePolicy = "F07-POL-01" | "F07-POL-02";
export const DISCLOSURE_POLICIES: readonly DisclosurePolicy[] = ["F07-POL-01", "F07-POL-02"];
export const DEFAULT_DISCLOSURE_POLICY: DisclosurePolicy = "F07-POL-01";

/** The threshold of a policy: 3 for F07-POL-01, none (null) for F07-POL-02. */
export function thresholdOf(policy: DisclosurePolicy): number | null {
  return policy === "F07-POL-01" ? 3 : null;
}

/** A stored policy (NULL = before E4, F07-POL-01). */
export function storedPolicy(value: string | null | undefined): DisclosurePolicy {
  return value === "F07-POL-02" ? "F07-POL-02" : "F07-POL-01";
}

/**
 * Disclosure of collective figures (F06 contract §5, F07-POL-01 #107). Without
 * an approved policy there is no numeric disclosure: the default is
 * `POLICY_PENDING`. `provisional-synthetic` applies the provisional policy so
 * that D4 can be built and tested with synthetic data; it is refused in
 * production, which stays without figures.
 *
 * E4 §5.1 (D-03): which provisional policy applies is chosen explicitly with
 * `COLLECTIVE_DISCLOSURE_POLICY`; without it nothing changes (`F07-POL-01`),
 * and an unknown value stops the start. Each change is traced at start in
 * `CollectiveDisclosurePolicyActivation` (`collective-policy-activation.ts`).
 */
@Injectable()
export class CollectiveConfig {
  private readonly logger = new Logger(CollectiveConfig.name);
  readonly mode: DisclosureMode;
  /** E4 §5.1: the provisional policy in force (default F07-POL-01). */
  readonly policy: DisclosurePolicy;
  /** E4 §5.1: `COLLECTIVE_DISCLOSURE_POLICY` was set (only then is a first activation recorded). */
  readonly policyExplicit: boolean;
  /**
   * F07 manual seal (F07_SEALED_HISTORY_CONTRACT §3.2). Off unless
   * `COLLECTIVE_SEALING=enabled`: a seal makes new publications terminal
   * (`CAMPAIGN_SEALED`), so it stays off until the Mobile build that handles
   * that code is the one in use. Reading sealed versions never depends on it.
   */
  readonly sealingEnabled: boolean;

  constructor(config: ConfigService) {
    this.sealingEnabled = config.get<string>("COLLECTIVE_SEALING") === "enabled";
    const requested = config.get<string>("COLLECTIVE_DISCLOSURE_MODE");
    const production = config.get<string>("NODE_ENV") === "production";
    if (requested === "provisional-synthetic" && production) {
      this.logger.warn(
        "COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic ignored in production: no figures until F07-POL-01 is approved",
      );
    }
    this.mode =
      requested === "provisional-synthetic" && !production
        ? "PROVISIONAL_SYNTHETIC"
        : "POLICY_PENDING";
    const policy = config.get<string>("COLLECTIVE_DISCLOSURE_POLICY");
    if (policy === undefined || policy === "") {
      this.policy = DEFAULT_DISCLOSURE_POLICY;
      this.policyExplicit = false;
    } else if ((DISCLOSURE_POLICIES as readonly string[]).includes(policy)) {
      this.policy = policy as DisclosurePolicy;
      this.policyExplicit = true;
    } else {
      // Never a silent fallback: an unknown policy does not start (D-03).
      throw new Error("COLLECTIVE_DISCLOSURE_POLICY must be F07-POL-01 or F07-POL-02");
    }
  }

  /** The threshold of the policy in force: 3 (F07-POL-01) or null (F07-POL-02). */
  get threshold(): number | null {
    return thresholdOf(this.policy);
  }
}
