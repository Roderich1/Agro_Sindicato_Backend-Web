import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

export const backupErrorSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["errorCode"],
  properties: {
    errorCode: {
      type: "string",
      enum: [
        "INVALID_REQUEST",
        "AUTH_REQUIRED",
        "AUTH_CONTEXT_FORBIDDEN",
        "BACKUP_NOT_FOUND",
        "BACKUP_QUOTA_EXCEEDED",
        "BACKUP_UPLOAD_IN_PROGRESS",
        "BACKUP_TOO_LARGE",
        "UNSUPPORTED_MEDIA_TYPE",
        "BACKUP_SHA256_MISMATCH",
        "BACKUP_FORMAT_INVALID",
        "BACKUP_ENCRYPTION_REQUIRED",
        "BACKUP_TRANSFER_INCOMPLETE",
        "RATE_LIMITED",
        "BACKUP_INTEGRITY_FAILED",
        "BACKUP_STORAGE_UNAVAILABLE",
      ],
    },
  },
};

export const backupViewSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["id", "sha256", "sizeBytes", "contentType", "formatVersion", "schemaVersion", "createdAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    sha256: { type: "string", pattern: "^[0-9a-f]{64}$", description: "SHA-256 calculado por el servidor al recibir el archivo (de los bytes cifrados en el formato 2): integridad de transporte, no del contenido descifrado." },
    sizeBytes: { type: "integer", minimum: 1 },
    contentType: { type: "string", enum: ["application/octet-stream"] },
    formatVersion: { type: "integer", enum: [1, 2], description: "1: contenedor sin cifrar (anterior). 2: cifrado en el teléfono con la clave de recuperación del agricultor (F08-ADR-003); el servidor sólo comprobó su forma exterior y el SHA-256 de los bytes cifrados, nunca su contenido." },
    schemaVersion: { type: "integer", minimum: 0, description: "Versión del esquema SQLite declarada por el cliente (compatibilidad)." },
    createdAt: { type: "string", format: "date-time" },
  },
};

export const backupListSchema: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["backups"],
  properties: { backups: { type: "array", items: backupViewSchema } },
};
