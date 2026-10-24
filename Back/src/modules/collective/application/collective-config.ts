import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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
  }
}
