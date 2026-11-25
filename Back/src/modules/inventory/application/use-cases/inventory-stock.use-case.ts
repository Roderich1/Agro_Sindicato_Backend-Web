import { Injectable } from '@nestjs/common';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListGlobalStockQueryDto } from '../dto/list-global-stock-query.dto';
import { ListStockMovementsQueryDto } from '../dto/list-stock-movements-query.dto';
import {
  ListStockQueryDto,
  UpdateProductInventorySettingsDto,
} from '../dto/list-stock-query.dto';
import { RegisterInitialStockDto } from '../dto/register-initial-stock.dto';
import { RegisterStockEntryDto } from '../dto/register-stock-entry.dto';
import { RegisterStockExitDto } from '../dto/register-stock-exit.dto';
import {
  registerEntry,
  registerExit,
  registerInitialStock,
  updateProductSettings,
} from './stock/inventory-stock.mutations';
import {
  listAlerts,
  listGlobalStock,
  listMovements,
  listStock,
} from './stock/inventory-stock.queries';

@Injectable()
export class InventoryStockUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async registerInitialStock(tenantId: string, userId: string, dto: RegisterInitialStockDto) {
    return registerInitialStock(
      { prisma: this.prisma, campaignContext: this.campaignContext },
      tenantId,
      userId,
      dto,
    );
  }

  async registerEntry(tenantId: string, userId: string, dto: RegisterStockEntryDto) {
    return registerEntry(
      { prisma: this.prisma, campaignContext: this.campaignContext },
      tenantId,
      userId,
      dto,
    );
  }

  async registerExit(tenantId: string, userId: string, dto: RegisterStockExitDto) {
    return registerExit(
      { prisma: this.prisma, campaignContext: this.campaignContext },
      tenantId,
      userId,
      dto,
    );
  }

  async listStock(tenantId: string, userId: string, query: ListStockQueryDto = {}) {
    return listStock(this.prisma, tenantId, userId, query);
  }

  async listGlobalStock(tenantId: string, query: ListGlobalStockQueryDto = {}) {
    return listGlobalStock(this.prisma, tenantId, query);
  }

  async updateProductSettings(
    tenantId: string,
    productId: string,
    dto: UpdateProductInventorySettingsDto,
  ) {
    return updateProductSettings(this.prisma, tenantId, productId, dto);
  }

  async listAlerts(tenantId: string, userId: string) {
    return listAlerts(this.prisma, tenantId, userId);
  }

  async listMovements(tenantId: string, userId: string, query: ListStockMovementsQueryDto) {
    return listMovements(this.prisma, tenantId, userId, query);
  }
}
