import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListAuditLogsQueryDto } from '../dto/list-audit-logs-query.dto';

@Injectable()
export class ListAuditLogsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(tenantId: string, userId: string, role: string, query: ListAuditLogsQueryDto = {}) {
    const logs = await this.prisma.auditLog.findMany({
      where: this.buildWhere(tenantId, userId, role, query),
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        actor: { select: { id: true, name: true, email: true, role: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      campaignId: log.campaignId,
      campaign: log.campaign,
      actorUserId: log.actorUserId,
      actor: log.actor,
      ownerUserId: log.ownerUserId,
      owner: log.owner,
      action: log.action,
      entityName: log.entityName,
      entityId: log.entityId,
      summary: log.summary,
      before: log.before,
      after: log.after,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  private buildWhere(
    tenantId: string,
    userId: string,
    role: string,
    query: ListAuditLogsQueryDto,
  ): Prisma.AuditLogWhereInput {
    return {
      tenantId,
      ...(role === UserRole.AGRICULTOR
        ? { OR: [{ ownerUserId: userId }, { actorUserId: userId }] }
        : {}),
      ...(role !== UserRole.AGRICULTOR && query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(role !== UserRole.AGRICULTOR && query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityName ? { entityName: query.entityName } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }
}
