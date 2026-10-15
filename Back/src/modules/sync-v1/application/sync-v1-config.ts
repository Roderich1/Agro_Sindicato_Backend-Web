import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FingerprintKeyring } from "../domain/fingerprint";

/**
 * Admission of Sync v1 writes (contract §5, §12). Without a fingerprint key
 * the endpoint cannot prove replay equality, so it answers 503 instead of
 * accepting unknown intentions as new. In production it also stays closed
 * until `SYNC_V1_PRODUCTION_ADMISSION=enabled`: the retention and disclosure
 * policies (PERIOD_DELEGATED) are not approved yet.
 */
@Injectable()
export class SyncV1Config {
  readonly keyring: FingerprintKeyring | null;
  readonly admissionOpen: boolean;

  constructor(config: ConfigService) {
    this.keyring = FingerprintKeyring.fromEnvironment({
      key: config.get<string>("SYNC_V1_FINGERPRINT_KEY"),
      version: config.get<number>("SYNC_V1_FINGERPRINT_KEY_VERSION"),
      previous: config.get<string>("SYNC_V1_FINGERPRINT_PREVIOUS_KEYS"),
    });
    const production = config.get<string>("NODE_ENV") === "production";
    this.admissionOpen =
      this.keyring !== null &&
      (!production ||
        config.get<string>("SYNC_V1_PRODUCTION_ADMISSION") === "enabled");
  }
}
