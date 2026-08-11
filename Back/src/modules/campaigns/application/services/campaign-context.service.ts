import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgriculturalCampaign, CampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CampaignContextService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveCampaign(tenantId: string, client: PrismaClientLike = this.prisma) {
    return client.agriculturalCampaign.findFirst({
      where: {
        tenantId,
        isActive: true,
        status: CampaignStatus.ABIERTA,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async requireActiveCampaign(tenantId: string, client: PrismaClientLike = this.prisma) {
    const campaign = await this.findActiveCampaign(tenantId, client);
    if (!campaign) {
      throw new BadRequestException('No existe una campana activa para registrar la operacion.');
    }

    return campaign;
  }

  async resolveCampaignForOperation(
    tenantId: string,
    campaignId?: string | null,
    client: PrismaClientLike = this.prisma,
  ) {
    if (!campaignId) {
      return this.requireActiveCampaign(tenantId, client);
    }

    const campaign = await client.agriculturalCampaign.findFirst({
      where: { id: campaignId, tenantId },
    });
    if (!campaign) {
      throw new NotFoundException('La campana no existe en este sindicato.');
    }

    this.ensureCampaignIsOpen(campaign);
    return campaign;
  }

  ensureCampaignIsOpen(campaign: Pick<AgriculturalCampaign, 'status' | 'isActive'>) {
    if (campaign.status !== CampaignStatus.ABIERTA || !campaign.isActive) {
      throw new BadRequestException('La campana no esta abierta para registrar operaciones.');
    }
  }

  async ensureNoOtherActiveCampaign(
    tenantId: string,
    campaignId?: string,
    client: PrismaClientLike = this.prisma,
  ) {
    const activeCampaign = await this.findActiveCampaign(tenantId, client);
    if (activeCampaign && activeCampaign.id !== campaignId) {
      throw new BadRequestException('Ya existe una campana activa para este sindicato.');
    }
  }
}
