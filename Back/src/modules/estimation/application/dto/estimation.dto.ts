import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";

/** INT-09 `GenerateRequest` (CU-20): what to estimate; the tenant is never sent. */
export class GenerateEstimationDto {
  @ApiProperty({ enum: [1] })
  @IsIn([1])
  contract_version!: 1;

  @ApiProperty({ format: "uuid", description: "Idempotencia: el mismo identificador con la misma petición devuelve el mismo trabajo" })
  @IsUUID()
  request_id!: string;

  @ApiProperty({ format: "uuid", description: "Campaña objetivo del sindicato autenticado" })
  @IsUUID()
  target_campaign_ref!: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", description: "Productos canónicos; sin ellos, los estimables con consumo publicado en la temporada (ESTIMATION_MAX_PRODUCTS)" })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  product_refs?: string[];
}

/** `GET /estimation/runs`: earlier runs, newest first, with an opaque cursor. */
export class RunsQueryDto {
  @ApiPropertyOptional({ format: "uuid", description: "Campaña objetivo (período) dentro del sindicato autenticado" })
  @IsOptional()
  @IsUUID()
  target_campaign_ref?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: "Cursor opaco de next_cursor" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  cursor?: string;
}

export class ResultsQueryDto {
  @ApiProperty({ format: "uuid", description: "Campaña objetivo (período) dentro del sindicato autenticado" })
  @IsUUID()
  target_campaign_ref!: string;
}

/** INT-09 `ClassificationCorrectionRequest` (EST-D-14): the next version, with its reason. */
export class CorrectClassificationDto {
  @ApiProperty({ enum: [1] })
  @IsIn([1])
  contract_version!: 1;

  @ApiProperty({ format: "uuid", description: "Versión vigente que se corrige" })
  @IsUUID()
  previous_classification_ref!: string;

  @ApiProperty({ format: "uuid", nullable: true, description: "Temporada nueva; null deja la campaña sin clasificar" })
  @ValidateIf((body: CorrectClassificationDto) => body.season_ref !== null)
  @IsUUID()
  season_ref!: string | null;

  @ApiProperty({ maxLength: 500, description: "Motivo de la corrección" })
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  reason!: string;
}
