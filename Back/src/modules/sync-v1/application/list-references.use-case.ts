import { Injectable } from "@nestjs/common";
import type { CampaignStatus, SyncV1BaseUnit } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { baseUnitForCentralUnit } from "../domain/units";
import type { SyncV1Context } from "./sync-v1-http-error";

/** Closed whitelist of F05-SYNC-07 (#106): no stock, sheets, notes or users. */
export interface SyncV1CampaignReference {
  campaign_ref: string;
  name: string;
  status: CampaignStatus;
  start_date: string;
  /** Closing date if closed, otherwise the estimated end; null if neither. */
  end_date: string | null;
  /** `ABIERTA` and `isActive` (contract F06 §6). */
  accepts_contributions: boolean;
}

export interface SyncV1ProductReference {
  product_ref: string;
  name: string;
  /** Central unit as stored in the catalogue. */
  unit: string;
  /** `ML`/`G` only for `L`/`KG`; null means not linkable. */
  base_unit: SyncV1BaseUnit | null;
  is_active: boolean;
  linkable: boolean;
}

export interface SyncV1References {
  contractVersion: 1;
  campaigns: SyncV1CampaignReference[];
  products: SyncV1ProductReference[];
}

/**
 * Read-only central references of the effective tenant, so that Mobile can
 * bind its local records explicitly (#106). It never matches names, creates
 * catalogue entries or writes anything.
 */
@Injectable()
export class ListReferencesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(context: SyncV1Context): Promise<SyncV1References> {
    const campaigns = await this.prisma.agriculturalCampaign.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ startDate: "desc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        isActive: true,
        startDate: true,
        estimatedEndDate: true,
        closedAt: true,
      },
    });
    const products = await this.prisma.product.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, unit: true, isActive: true },
    });
    return {
      contractVersion: 1,
      campaigns: campaigns.map((campaign) => ({
        campaign_ref: campaign.id,
        name: campaign.name,
        status: campaign.status,
        start_date: campaign.startDate.toISOString(),
        end_date:
          (campaign.closedAt ?? campaign.estimatedEndDate)?.toISOString() ?? null,
        accepts_contributions:
          campaign.status === "ABIERTA" && campaign.isActive,
      })),
      products: products.map((product) => {
        const baseUnit = baseUnitForCentralUnit(product.unit);
        return {
          product_ref: product.id,
          name: product.name,
          unit: product.unit,
          base_unit: baseUnit,
          is_active: product.isActive,
          linkable: baseUnit !== null,
        };
      }),
    };
  }
}
