import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from "class-validator";
import { PHOTO_CONSENT_VERSION } from "../../domain/request-input";

/**
 * DTOs of E1 §4. The global ValidationPipe (`whitelist`,
 * `forbidNonWhitelisted`) refuses any extra key with 400 PAYLOAD_INVALID.
 * Lengths after trimming, the unit and the confirmation/reason rules are
 * checked by the use cases, so they answer the contract's own codes.
 */
export class PhotoConsentDto {
  @ApiProperty({ example: "FOTO-1", description: "Versión del texto de consentimiento mostrado en el teléfono" })
  @IsString()
  @Matches(PHOTO_CONSENT_VERSION)
  version!: string;

  @ApiProperty({ format: "date-time", example: "2026-11-11T18:20:00.000Z" })
  @IsISO8601({ strict: true, strictSeparator: true })
  accepted_at!: string;
}

export class UpsertIdentificationRequestDto {
  @ApiProperty({ enum: [1] })
  @IsIn([1])
  contractVersion!: number;

  @ApiProperty({ minLength: 1, maxLength: 120, description: "1–120 caracteres tras recortar espacios" })
  @IsString()
  local_name!: string;

  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  active_ingredient?: string | null;

  @ApiProperty({ enum: ["L", "KG"], description: "Otra unidad: 422 UNIT_UNSUPPORTED. Inmutable." })
  @IsString()
  unit!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: PhotoConsentDto,
    description: "Consentimiento aparte para la foto (E1-D11); una vez registrado no se borra con un PUT posterior",
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PhotoConsentDto)
  photo_consent?: PhotoConsentDto | null;
}

export class ListIdentificationRequestsQueryDto {
  @ApiPropertyOptional({
    enum: ["PENDING", "LINKED", "ALL"],
    description: "Sólo Directiva/Administrador; por defecto PENDING. El agricultor no envía parámetros.",
  })
  @IsOptional()
  @IsIn(["PENDING", "LINKED", "ALL"])
  status?: "PENDING" | "LINKED" | "ALL";
}

export class LinkIdentificationDto {
  @ApiProperty({ format: "uuid", description: "Producto del catálogo del tenant" })
  @IsUUID()
  product_ref!: string;

  @ApiProperty({ maxLength: 280, description: "Vacío o > 280: 422 REASON_REQUIRED" })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ description: "Confirmación explícita (RF-33); distinto de true: 422 CONFIRMATION_REQUIRED" })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class CreateIdentifiedProductDto {
  @ApiProperty({ minLength: 2, maxLength: 160, description: "Nombre del producto colectivo (2–160 tras recortar)" })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @IsOptional()
  @IsString()
  active_ingredient?: string | null;

  @ApiProperty({ maxLength: 280 })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class DeferIdentificationDto {
  @ApiProperty({ maxLength: 280, description: "Nota para el agricultor, sin nombre del autor hacia él" })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
