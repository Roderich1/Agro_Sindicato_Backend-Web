import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  CLIENT_REGISTRATION_REPOSITORY,
  ClientRegistrationRecord,
  ClientRegistrationRepositoryPort,
} from "../../domain/ports/client-registration.repository.port";

export interface ClientRegistrationResponse {
  registrationId: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

function toResponse(
  record: ClientRegistrationRecord,
): ClientRegistrationResponse {
  return {
    registrationId: record.id,
    status: record.status,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
    revokedAt: record.revokedAt,
  };
}

@Injectable()
export class ManageClientRegistrationsUseCase {
  constructor(
    @Inject(CLIENT_REGISTRATION_REPOSITORY)
    private readonly registrations: ClientRegistrationRepositoryPort,
  ) {}

  async register(userId: string, tenantId: string, clientId: string) {
    const canonicalClientId = clientId.toLowerCase();
    const clientIdHash = createHash("sha256")
      .update(canonicalClientId, "utf8")
      .digest("hex");
    const result = await this.registrations.register(
      { tenantId, userId },
      clientIdHash,
      new Date(),
    );

    if (result.outcome === "inactive-context") {
      throw new ForbiddenException(
        "No existe una membership activa en el tenant autenticado.",
      );
    }
    if (result.outcome === "revoked") {
      throw new ConflictException(
        "El clientId fue revocado y no puede reactivarse. Genere una identidad de instalación nueva.",
      );
    }
    return toResponse(result.registration);
  }

  async list(userId: string, tenantId: string) {
    const result = await this.registrations.list({ tenantId, userId });
    if (result.outcome === "inactive-context") {
      throw new ForbiddenException(
        "No existe una membership activa en el tenant autenticado.",
      );
    }
    return result.registrations.map(toResponse);
  }

  async revoke(userId: string, tenantId: string, registrationId: string) {
    const result = await this.registrations.revoke(
      { tenantId, userId },
      registrationId,
      new Date(),
    );
    if (result.outcome === "inactive-context") {
      throw new ForbiddenException(
        "No existe una membership activa en el tenant autenticado.",
      );
    }
    if (result.outcome === "not-found") {
      throw new NotFoundException("Registro de cliente no encontrado.");
    }
    return toResponse(result.registration);
  }
}
