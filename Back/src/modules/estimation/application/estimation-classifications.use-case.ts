import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { AuthenticatedPrincipal } from "../../iam/application/types/authenticated-principal.type";
import { campaignRefOf, seasonRefOf } from "./estimation-views";

function seasonViewOf(s: { id: string; tenantId: string; key: string; definition: string; durationDays: number; createdByRole: string; createdAt: Date }) {
  return {
    contract_version: 1,
    season: seasonRefOf(s),
    scope: { tenant_ref: s.tenantId },
    created_by_role: s.createdByRole as "DIRECTIVA" | "ADMINISTRADOR",
    created_at: s.createdAt.toISOString(),
  };
}

export interface SeasonCommand {
  key: string;
  definition: string;
  durationDays: number;
}

export interface CorrectionCommand {
  campaignId: string;
  previousClassificationId: string;
  seasonId: string | null;
  reason: string;
}

const CLASSIFIERS: UserRole[] = [UserRole.DIRECTIVA, UserRole.ADMINISTRADOR];
const CAMPAIGN = { id: true, name: true, status: true, startDate: true, estimatedEndDate: true, closedAt: true } as const;

/**
 * Contract §4.1 (EST-D-02, EST-D-14). The Directiva defines seasons and
 * classifies each campaign explicitly; nothing is inferred from names or
 * dates, and nothing is rewritten:
 * - a season is registered once: another definition is another season with
 *   another key (SEASON_KEY_TAKEN in the tenant);
 * - the first classification of a campaign is version 1; a campaign that
 *   already has one is corrected (CAMPAIGN_ALREADY_CLASSIFIED);
 * - the list gives the current classification of each classified campaign;
 *   a campaign that is absent is unclassified.
 *
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

  async createSeason(principal: AuthenticatedPrincipal, command: SeasonCommand) {
    if (!CLASSIFIERS.includes(principal.role)) throw new ForbiddenException();
    const taken = await this.prisma.comparabilitySeason.count({ where: { tenantId: principal.tenantId, key: command.key } });
    if (taken > 0) throw new ConflictException("SEASON_KEY_TAKEN");
    try {
      const season = await this.prisma.comparabilitySeason.create({
        data: {
          tenantId: principal.tenantId,
          key: command.key,
          definition: command.definition,
          durationDays: command.durationDays,
          createdByUserId: principal.sub,
          createdByRole: principal.role,
        },
      });
      return seasonViewOf(season);
    } catch (error) {
      // Two requests with the same key at once: one key per tenant.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("SEASON_KEY_TAKEN");
      throw error;
    }
  }

  async seasons(tenantId: string) {
    const seasons = await this.prisma.comparabilitySeason.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return { contract_version: 1, items: seasons.map(seasonViewOf) };
  }

  async classify(principal: AuthenticatedPrincipal, command: { campaignId: string; seasonId: string }) {
    if (!CLASSIFIERS.includes(principal.role)) throw new ForbiddenException();
    const tenantId = principal.tenantId;
    const campaign = await this.prisma.agriculturalCampaign.findFirst({ where: { id: command.campaignId, tenantId }, select: { id: true } });
    if (!campaign) throw new NotFoundException("CAMPAIGN_NOT_FOUND");
    const season = await this.prisma.comparabilitySeason.findFirst({ where: { id: command.seasonId, tenantId }, select: { id: true } });
    if (!season) throw new NotFoundException("SEASON_NOT_FOUND");
    const existing = await this.prisma.campaignSeasonClassification.count({ where: { campaignId: campaign.id } });
    if (existing > 0) throw new ConflictException("CAMPAIGN_ALREADY_CLASSIFIED");
    try {
      const created = await this.prisma.campaignSeasonClassification.create({
        data: { tenantId, campaignId: campaign.id, version: 1, seasonId: season.id, classifiedByUserId: principal.sub, classifiedByRole: principal.role },
        select: { id: true },
      });
      return this.view(created.id);
    } catch (error) {
      // Two first classifications at once: one version 1 per campaign.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("CAMPAIGN_ALREADY_CLASSIFIED");
      throw error;
    }
  }

  /** The current classification of each classified campaign, optionally of one season. */
  async classifications(tenantId: string, seasonId?: string) {
    if (seasonId) {
      const season = await this.prisma.comparabilitySeason.findFirst({ where: { id: seasonId, tenantId }, select: { id: true } });
      if (!season) throw new NotFoundException("SEASON_NOT_FOUND");
    }
    const current = await this.prisma.campaignSeasonClassification.findMany({
      where: { tenantId, nextClassification: { is: null }, ...(seasonId ? { seasonId } : { seasonId: { not: null } }) },
      orderBy: [{ campaign: { startDate: "asc" } }, { campaignId: "asc" }],
      select: { id: true },
    });
    const items = [];
    for (const { id } of current) items.push(await this.view(id));
    return { contract_version: 1, items };
  }

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
