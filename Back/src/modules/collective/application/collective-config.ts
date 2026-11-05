import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeclaredNeedRule } from "../domain/disclosure-policy";

export type DisclosureMode = "POLICY_PENDING" | "PROVISIONAL_SYNTHETIC";

/**
 * Disclosure of collective figures (F06 contract §5, F07-POL-01 #107). Without
 * an approved policy there is no numeric disclosure: the default is
 * `POLICY_PENDING`. `provisional-synthetic` applies the provisional policy so
 * that D4 can be built and tested with synthetic data; it is refused in
 * production, which stays without figures.
 */
@Injectable()
export class CollectiveConfig {
  private readonly logger = new Logger(CollectiveConfig.name);
  readonly mode: DisclosureMode;
  /**
   * F07 manual seal (F07_SEALED_HISTORY_CONTRACT §3.2). Off unless
   * `COLLECTIVE_SEALING=enabled`: a seal makes new publications terminal
   * (`CAMPAIGN_SEALED`), so it stays off until the Mobile build that handles
   * that code is the one in use. Reading sealed versions never depends on it.
   */
  readonly sealingEnabled: boolean;
  /**
   * Experimental variant for DECLARED_NEED (2026-11-05, not approved; #107
   * stays open): `COLLECTIVE_DECLARED_NEED_RULE=threshold-only` publishes the
   * current total as soon as k Members contributed, on every read. Refused in
   * production, where the combinations rule always applies. Seals keep the
   * combinations rule whatever this says.
   */
  readonly declaredNeedRule: DeclaredNeedRule;

  constructor(config: ConfigService) {
    this.sealingEnabled = config.get<string>("COLLECTIVE_SEALING") === "enabled";
    const requested = config.get<string>("COLLECTIVE_DISCLOSURE_MODE");
    const production = config.get<string>("NODE_ENV") === "production";
    const requestedRule = config.get<string>("COLLECTIVE_DECLARED_NEED_RULE");
    if (requestedRule === "threshold-only" && production) {
      this.logger.warn("COLLECTIVE_DECLARED_NEED_RULE=threshold-only ignored in production: combinations rule applies");
    }
    this.declaredNeedRule = requestedRule === "threshold-only" && !production ? "threshold-only" : "combinations";
    if (this.declaredNeedRule === "threshold-only") {
      this.logger.warn("DECLARED_NEED disclosure variant threshold-only active (experimental, synthetic data only)");
    }
    if (requested === "provisional-synthetic" && production) {
      this.logger.warn(
        "COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic ignored in production: no figures until F07-POL-01 is approved",
      );
    }
    this.mode =
      requested === "provisional-synthetic" && !production
        ? "PROVISIONAL_SYNTHETIC"
        : "POLICY_PENDING";
  }
}
