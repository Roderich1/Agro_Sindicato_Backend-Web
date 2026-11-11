import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { CONSENT_VERSION } from "../../domain/consent";
import { MAX_LINES } from "../../domain/participation-input";

/**
 * DTOs of E2 §4. The global ValidationPipe (`whitelist`,
 * `forbidNonWhitelisted`) refuses any extra key with 400 PAYLOAD_INVALID.
 * Lengths, ids, quantities, consent and confirmation are checked by the use
 * cases so that they answer the contract's own codes.
 */
export class CallProductRefDto {
  @ApiProperty({ description: "Producto colectivo del catálogo del tenant (activo, L o KG, canónico)" })
  @IsString()
  @MaxLength(64)
  product_ref!: string;
}

export class CreateCallDto {
  @ApiProperty({ description: "Campaña agrícola del tenant (PLANIFICADA o ABIERTA)" })
  @IsString()
  @MaxLength(64)
  campaign_id!: string;

  @ApiProperty({ minLength: 1, maxLength: 120, description: "1–120 caracteres tras recortar espacios" })
  @IsString()
  @MaxLength(400)
  name!: string;

  @ApiProperty({ format: "date-time", description: "Hora del servidor; debe ser posterior a ahora (y a la apertura)" })
  @IsISO8601({ strict: true, strictSeparator: true })
  deadline_at!: string;

  @ApiProperty({ description: "Usuario DIRECTIVA o ADMINISTRADOR activo del tenant (ver eligible-responsibles)" })
  @IsString()
  @MaxLength(64)
  responsible_user_id!: string;

  @ApiProperty({ type: [CallProductRefDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CallProductRefDto)
  products!: CallProductRefDto[];

  @ApiPropertyOptional({
    nullable: true,
    format: "uuid",
    description:
      "Borrador de propuesta (F07) de la misma campaña: cada producto que tenga línea en él guarda la referencia (propuesta, posición)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source_proposal_id?: string | null;
}

export class PatchCallDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  name?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  deadline_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  responsible_user_id?: string;

  @ApiPropertyOptional({ type: [CallProductRefDto], minItems: 1, maxItems: 50, description: "Reemplaza la lista completa" })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CallProductRefDto)
  products?: CallProductRefDto[];

  @ApiPropertyOptional({ nullable: true, format: "uuid", description: "null quita el origen" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source_proposal_id?: string | null;
}

export class ConfirmActionDto {
  @ApiProperty({ description: "Confirmación explícita; distinto de true: 422 CONFIRMATION_REQUIRED" })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class CancelCallDto extends ConfirmActionDto {
  @ApiProperty({ minLength: 1, maxLength: 280, description: "Vacío o > 280: 422 REASON_REQUIRED" })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListCallsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignId?: string;

  @ApiPropertyOptional({ enum: ["DRAFT", "OPEN", "CLOSED", "CANCELLED"] })
  @IsOptional()
  @IsIn(["DRAFT", "OPEN", "CLOSED", "CANCELLED"])
  status?: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
}

export class ParticipationConsentDto {
  @ApiProperty({
    example: CONSENT_VERSION,
    description: "Versión del texto mostrado: CONV-2 (vigente) o CONV-1 (teléfonos sin actualizar); otra: 409 CONSENT_REQUIRED",
  })
  @IsString()
  @MaxLength(16)
  version!: string;

  @ApiProperty({ format: "date-time", description: "Fecha de aceptación en el teléfono" })
  @IsISO8601({ strict: true, strictSeparator: true })
  accepted_at!: string;
}

export class ParticipationLineDto {
  @ApiProperty({ description: "Producto de la convocatoria; otro: 422 PRODUCT_NOT_IN_CALL" })
  @IsString()
  @MaxLength(64)
  product_ref!: string;

  @ApiProperty({
    example: "2500",
    pattern: "^[1-9][0-9]*$",
    description: "Entero decimal > 0 en la unidad base (ML/G), como Sync v1; inválido: 422 QUANTITY_INVALID",
  })
  @IsString()
  @MaxLength(32)
  quantity_base!: string;
}

export class ConfirmParticipationDto {
  @ApiProperty({ format: "uuid", description: "UUID v4 en minúsculas generado por el teléfono (idempotencia)" })
  @IsString()
  @MaxLength(64)
  operation_id!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647, description: "Creciente por convocatoria en ese teléfono" })
  @IsInt()
  sequence!: number;

  @ApiPropertyOptional({ type: ParticipationConsentDto, nullable: true, description: "Obligatorio si hay líneas" })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ParticipationConsentDto)
  consent?: ParticipationConsentDto | null;

  @ApiProperty({ type: [ParticipationLineDto], maxItems: MAX_LINES, description: "Vacía = retiro (E2-D8)" })
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => ParticipationLineDto)
  lines!: ParticipationLineDto[];
}

export class WithdrawParticipationDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  @MaxLength(64)
  operation_id!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  sequence!: number;
}

/** E2-P3 (§10.2): `POST /joint-purchase-calls/{id}/collaborators`. */
export class GrantCollaboratorDto {
  @ApiProperty({ description: "Otro usuario DIRECTIVA o ADMINISTRADOR activo del tenant, distinto del responsable" })
  @IsString()
  @MaxLength(64)
  user_ref!: string;

  @ApiProperty({ enum: ["PARTICIPANTS", "MANAGE"], description: "PARTICIPANTS: consultar participantes y cantidades; MANAGE: administrar la convocatoria" })
  @IsString()
  @MaxLength(16)
  grant!: string;

  @ApiProperty({ description: "Confirmación explícita; distinto de true: 422 CONFIRMATION_REQUIRED" })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

/** E2-P3 (§10.2): `POST /joint-purchase-calls/{id}/collaborators/revoke` (el responsable, o el propio colaborador para renunciar). */
export class RevokeCollaboratorDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  user_ref!: string;

  @ApiProperty({ enum: ["PARTICIPANTS", "MANAGE"] })
  @IsString()
  @MaxLength(16)
  grant!: string;
}

/** E2-P2 (§10.1): `GET /me/joint-purchase-calls/history`. */
export class FarmerHistoryQueryDto {
  @ApiPropertyOptional({ description: "Cursor opaco emitido por el servidor (next_cursor); otro: 400 PAYLOAD_INVALID" })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
