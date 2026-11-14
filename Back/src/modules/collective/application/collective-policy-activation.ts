import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig, DisclosurePolicy } from "./collective-config";

const ACTIVATION_LOCK = "collective-disclosure-policy-activation";

export interface PolicyActivationResult {
  /** A row was inserted by this start. */
  inserted: boolean;
  policy: DisclosurePolicy;
  previousPolicy: string | null;
}

/**
 * E4 §5.1 (D-03): explicit and traced activation of the collective
 * disclosure policy. At each start the configured policy is compared with
 * the last recorded activation:
 * - with no activation recorded, a row is written only when
 *   `COLLECTIVE_DISCLOSURE_POLICY` is set (the default F07-POL-01 is what
 *   always ran, so nothing changed);
 * - otherwise a row is written whenever the configured policy differs from
 *   the last one (also back to the default).
 * The table is insert-only (trigger). A start that writes a row says so in
 * the start log. Sealed campaigns are never reopened by it.
 */
@Injectable()
export class CollectivePolicyActivation implements OnApplicationBootstrap {
  private readonly logger = new Logger("CollectiveDisclosurePolicy");

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CollectiveConfig,
  ) {}

  /**
   * Without the E4 migration (a base migrated before it) the table does not
   * exist. With the default policy nothing changed, so the start goes on and
   * says so; with `COLLECTIVE_DISCLOSURE_POLICY` set the start is refused: a
   * policy is never applied without its trace.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.activate();
    } catch (error) {
      const missing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
      if (!missing || this.config.policyExplicit) throw error;
      this.logger.warn(
        `[COLLECTIVE DISCLOSURE POLICY] policy=${this.config.policy} (default) not traced: CollectiveDisclosurePolicyActivation is missing (E4 migration not applied)`,
      );
    }
  }

  async activate(at: Date = new Date()): Promise<PolicyActivationResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Two instances starting at once record the change once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ACTIVATION_LOCK}, 0))`;
      const last = await tx.collectiveDisclosurePolicyActivation.findFirst({
        orderBy: [{ activatedAt: "desc" }, { id: "desc" }],
        select: { policy: true },
      });
      const configured = this.config.policy;
      const changed = last === null ? this.config.policyExplicit : last.policy !== configured;
      if (!changed) return { inserted: false, policy: configured, previousPolicy: last?.policy ?? null };
      await tx.collectiveDisclosurePolicyActivation.create({
        data: { policy: configured, previousPolicy: last?.policy ?? null, activatedAt: at, source: "CONFIG" },
      });
      return { inserted: true, policy: configured, previousPolicy: last?.policy ?? null };
    });
    if (result.inserted) {
      this.logger.log(
        `[COLLECTIVE DISCLOSURE POLICY ACTIVATED] policy=${result.policy} previous=${result.previousPolicy ?? "none"} source=CONFIG at=${at.toISOString()}`,
      );
    } else {
      this.logger.log(`[COLLECTIVE DISCLOSURE POLICY] policy=${result.policy} (unchanged)`);
    }
    return result;
  }
}
