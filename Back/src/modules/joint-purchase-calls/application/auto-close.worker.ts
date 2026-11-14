import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { clearInterval, setInterval } from "node:timers";
import { CallClosingService } from "./call-closing.service";
import { JointPurchaseConfig } from "./joint-purchase-config";

/**
 * E2-D12: automatic close of OPEN calls whose deadline passed, inside this
 * process (`JOINT_PURCHASE_CLOSE_INTERVAL_MS`, default 60000 ms; `0` or
 * `disabled` = off). The cutoff is the deadline: operations received after
 * it were already refused by the server, so a late close never extends it.
 */
@Injectable()
export class JointPurchaseAutoCloseWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("JointPurchaseCalls");
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly closing: CallClosingService,
    private readonly config: JointPurchaseConfig,
  ) {}

  onApplicationBootstrap() {
    if (this.config.closeIntervalMs === null) return;
    this.timer = setInterval(() => void this.tick(), this.config.closeIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass: closes every due call; returns their ids. Tests call it directly. */
  runOnce(): Promise<string[]> {
    return this.closing.closeDue();
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`[JOINT PURCHASE AUTO-CLOSE] ${error instanceof Error ? error.name : typeof error}`);
    } finally {
      this.busy = false;
    }
  }
}
