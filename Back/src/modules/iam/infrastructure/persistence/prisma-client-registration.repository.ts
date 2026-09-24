import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  AuthenticatedClientContext,
  ClientRegistrationRecord,
  ClientRegistrationRepositoryPort,
  ListClientsResult,
  RegisterClientResult,
  RevokeClientResult,
} from "../../domain/ports/client-registration.repository.port";

const REGISTRATION_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  lastSeenAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class PrismaClientRegistrationRepository implements ClientRegistrationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    context: AuthenticatedClientContext,
    clientIdHash: string,
    now: Date,
  ): Promise<RegisterClientResult> {
    const attempt = (): Promise<RegisterClientResult> =>
      this.prisma.$transaction(async (tx): Promise<RegisterClientResult> => {
        const member = await this.activeMember(tx, context);
        if (!member) return { outcome: "inactive-context" };

        const where = {
          tenantId_memberId_clientIdHash: {
            tenantId: context.tenantId,
            memberId: member.id,
            clientIdHash,
          },
        };
        const existing = await tx.clientRegistration.findUnique({
          where,
          select: REGISTRATION_SELECT,
        });
        if (existing?.status === "REVOKED") {
          return {
            outcome: "revoked",
            registration: existing as ClientRegistrationRecord,
          };
        }
        if (existing) {
          const registration = await tx.clientRegistration.update({
            where,
            data: { lastSeenAt: now },
            select: REGISTRATION_SELECT,
          });
          return {
            outcome: "existing",
            registration: registration as ClientRegistrationRecord,
          };
        }

        const registration = await tx.clientRegistration.create({
          data: {
            tenantId: context.tenantId,
            memberId: member.id,
            clientIdHash,
            lastSeenAt: now,
          },
          select: REGISTRATION_SELECT,
        });
        return {
          outcome: "registered",
          registration: registration as ClientRegistrationRecord,
        };
      });

    try {
      return await attempt();
    } catch (error) {
      // Dos requests simultáneos pueden observar ausencia antes del CREATE.
      // La constraint decide el ganador; el perdedor relee y devuelve la misma
      // registration lógica en vez de convertir idempotencia en un 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return attempt();
      }
      throw error;
    }
  }

  async list(context: AuthenticatedClientContext): Promise<ListClientsResult> {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.activeMember(tx, context);
      if (!member) return { outcome: "inactive-context" };

      const registrations = await tx.clientRegistration.findMany({
        where: { tenantId: context.tenantId, memberId: member.id },
        orderBy: { createdAt: "desc" },
        select: REGISTRATION_SELECT,
      });
      return {
        outcome: "ok",
        registrations: registrations as ClientRegistrationRecord[],
      };
    });
  }

  async revoke(
    context: AuthenticatedClientContext,
    registrationId: string,
    now: Date,
  ): Promise<RevokeClientResult> {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.activeMember(tx, context);
      if (!member) return { outcome: "inactive-context" };

      const existing = await tx.clientRegistration.findFirst({
        where: {
          id: registrationId,
          tenantId: context.tenantId,
          memberId: member.id,
        },
        select: REGISTRATION_SELECT,
      });
      if (!existing) return { outcome: "not-found" };
      if (existing.status === "REVOKED") {
        await this.revokeBoundSessions(tx, existing.id, now);
        return {
          outcome: "already-revoked",
          registration: existing as ClientRegistrationRecord,
        };
      }

      const registration = await tx.clientRegistration.update({
        where: { id: existing.id },
        data: { status: "REVOKED", revokedAt: now },
        select: REGISTRATION_SELECT,
      });
      await this.revokeBoundSessions(tx, registration.id, now);
      return {
        outcome: "revoked",
        registration: registration as ClientRegistrationRecord,
      };
    });
  }

  private activeMember(
    tx: Prisma.TransactionClient,
    context: AuthenticatedClientContext,
  ) {
    return tx.member
      .findUnique({
        where: {
          tenantId_userId: {
            tenantId: context.tenantId,
            userId: context.userId,
          },
        },
        select: {
          id: true,
          isActive: true,
          tenant: { select: { isActive: true } },
        },
      })
      .then((member) =>
        member?.isActive && member.tenant.isActive ? member : null,
      );
  }

  private async revokeBoundSessions(
    tx: Prisma.TransactionClient,
    registrationId: string,
    now: Date,
  ): Promise<void> {
    const sessions = await tx.authSession.findMany({
      where: {
        clientRegistrationId: registrationId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (sessions.length === 0) return;

    const sessionIds = sessions.map((session) => session.id);
    await tx.authSession.updateMany({
      where: { id: { in: sessionIds }, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });
    await tx.refreshToken.updateMany({
      where: {
        sessionId: { in: sessionIds },
        contractVersion: 2,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  }
}
