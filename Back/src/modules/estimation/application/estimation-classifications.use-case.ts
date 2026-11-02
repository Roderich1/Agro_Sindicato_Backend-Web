import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { AuthenticatedPrincipal } from "../../iam/application/types/authenticated-principal.type";
import { campaignRefOf, seasonRefOf } from "./estimation-views";

export interface CorrectionCommand {
  campaignId: string;
  previousClassificationId: string;
  seasonId: string | null;
  reason: string;
}

const CLASSIFIERS: UserRole[] = [UserRole.DIRECTIVA, UserRole.ADMINISTRADOR];
const CAMPAIGN = { id: true, name: true, status: true, startDate: true, estimatedEndDate: true, closedAt: true } as const;

/**
 * F12-EST-05 (#178; contract §4.1, EST-D-14): correcting the classification
 * of a campaign inserts the next version, with its reason, who corrects and
 * their role; no version is rewritten. Series and runs keep citing the
 * version they used, and their results read as OUTDATED with
 * CLASSIFICATION_CORRECTED (§8). Two simultaneous corrections of the same
 * version do not overwrite each other: the second is CLASSIFICATION_STALE.
 */
@Injectable()
export class EstimationClassificationsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async correct(principal: AuthenticatedPrincipal, command: CorrectionCommand) {
    if (!CLASSIFIERS.includes(principal.role)) throw new ForbiddenException();
    const tenantId = principal.tenantId;
    const campaign = await this.prisma.agriculturalCampaign.findFirst({ where: { id: command.campaignId, tenantId }, select: { id: true } });
    if (!campaign) throw new NotFoundException("CAMPAIGN_NOT_FOUND");
    const previous = await this.prisma.campaignSeasonClassification.findFirst({
      where: { id: command.previousClassificationId, campaignId: campaign.id, tenantId },
      select: { id: true, version: true, seasonId: true, nextClassification: { select: { id: true } } },
    });
    if (!previous) throw new NotFoundException("CLASSIFICATION_NOT_FOUND");
    if (command.seasonId !== null) {
      const season = await this.prisma.comparabilitySeason.findFirst({ where: { id: command.seasonId, tenantId }, select: { id: true } });
      if (!season) throw new NotFoundException("SEASON_NOT_FOUND");
    }
    if (previous.nextClassification) throw new ConflictException("CLASSIFICATION_STALE");
    if (previous.seasonId === command.seasonId) throw new UnprocessableEntityException("CLASSIFICATION_UNCHANGED");
    try {
      const created = await this.prisma.campaignSeasonClassification.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          version: previous.version + 1,
          previousClassificationId: previous.id,
          seasonId: command.seasonId,
          reason: command.reason,
          classifiedByUserId: principal.sub,
          classifiedByRole: principal.role,
        },
        select: { id: true },
      });
      return this.view(created.id);
    } catch (error) {
      // Another correction of the same version won: one successor per version.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("CLASSIFICATION_STALE");
      throw error;
    }
  }

  async history(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.agriculturalCampaign.findFirst({ where: { id: campaignId, tenantId }, select: { id: true } });
    if (!campaign) throw new NotFoundException("CAMPAIGN_NOT_FOUND");
    const versions = await this.prisma.campaignSeasonClassification.findMany({ where: { campaignId, tenantId }, orderBy: { version: "asc" }, select: { id: true } });
    const items = [];
    for (const { id } of versions) items.push(await this.view(id));
    return { contract_version: 1, items };
  }

  private async view(id: string) {
    const k = await this.prisma.campaignSeasonClassification.findUniqueOrThrow({
      where: { id },
      include: { campaign: { select: CAMPAIGN }, season: true, nextClassification: { select: { id: true } } },
    });
    return {
      contract_version: 1,
      classification_ref: k.id,
      version: k.version,
      campaign: campaignRefOf(k.campaign),
      season: k.season ? seasonRefOf(k.season) : null,
      previous_classification_ref: k.previousClassificationId,
      reason: k.reason,
      current: k.nextClassification === null,
      classified_by_role: k.classifiedByRole as "DIRECTIVA" | "ADMINISTRADOR",
      classified_at: k.classifiedAt.toISOString(),
    };
  }
}
