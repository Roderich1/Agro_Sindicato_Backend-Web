import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parseDurationMs } from "@/config/duration";

@Injectable()
export class AuthTtlPolicy {
  readonly accessTtl: string;
  readonly accessTtlMs: number;
  readonly refreshTtl: string;
  readonly refreshTtlMs: number;

  constructor(config: ConfigService) {
    this.accessTtl = config.get<string>("JWT_EXPIRES_IN") ?? "15m";
    this.refreshTtl = config.get<string>("JWT_REFRESH_EXPIRES_IN") ?? "7d";
    this.accessTtlMs = parseDurationMs(this.accessTtl, "JWT_EXPIRES_IN");
    this.refreshTtlMs = parseDurationMs(
      this.refreshTtl,
      "JWT_REFRESH_EXPIRES_IN",
    );
  }

  refreshExpiresAt(now = new Date()): Date {
    return new Date(now.getTime() + this.refreshTtlMs);
  }

  remainingSessionMs(expiresAt: Date, now = new Date()): number {
    return Math.max(0, expiresAt.getTime() - now.getTime());
  }
}
