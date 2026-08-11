import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { CampaignContextService } from './campaign-context.service';

describe('CampaignContextService', () => {
  const tenantId = 'tenant-1';
  const campaignId = 'campaign-1';

  function createService(tx: Record<string, unknown>) {
    return new CampaignContextService(tx as never);
  }

  it('returns the active campaign for a tenant', async () => {
    const campaign = {
      id: campaignId,
      tenantId,
      status: CampaignStatus.ABIERTA,
      isActive: true,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    };
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(campaign),
      },
    };
    const service = createService(tx);

    await expect(service.requireActiveCampaign(tenantId)).resolves.toBe(campaign);
    expect(tx.agriculturalCampaign.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId,
        isActive: true,
        status: CampaignStatus.ABIERTA,
      },
      orderBy: { startDate: 'desc' },
    });
  });

  it('rejects operations when there is no active campaign', async () => {
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createService(tx);

    await expect(service.requireActiveCampaign(tenantId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an explicit campaign from another tenant', async () => {
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createService(tx);

    await expect(service.resolveCampaignForOperation(tenantId, campaignId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects operations against a closed campaign', async () => {
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue({
          id: campaignId,
          tenantId,
          status: CampaignStatus.CERRADA,
          isActive: false,
        }),
      },
    };
    const service = createService(tx);

    await expect(service.resolveCampaignForOperation(tenantId, campaignId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects another active campaign for the same tenant', async () => {
    const tx = {
      agriculturalCampaign: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'other-campaign',
          tenantId,
          status: CampaignStatus.ABIERTA,
          isActive: true,
        }),
      },
    };
    const service = createService(tx);

    await expect(service.ensureNoOtherActiveCampaign(tenantId, campaignId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
