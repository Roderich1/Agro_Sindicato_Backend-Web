import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgrochemicalApplicationStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListApplicationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  plotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filtro para directiva o administrador' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ enum: AgrochemicalApplicationStatus })
  @IsOptional()
  @IsEnum(AgrochemicalApplicationStatus)
  status?: AgrochemicalApplicationStatus;
}

export class CreateApplicationDto {
  @ApiPropertyOptional({ description: 'Si se omite, se usa la campana activa.' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiProperty()
  @IsUUID()
  plotId: string;

  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({
    description: 'Lote especifico a descontar. Si se omite, se usa el lote con vencimiento mas cercano.',
  })
  @IsOptional()
  @IsUUID()
  inventoryLotId?: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ example: '1 L/ha', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  dose?: string | null;

  @ApiPropertyOptional({ example: 'Malezas de hoja ancha', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  targetPest?: string | null;

  @ApiPropertyOptional({ example: 'Sin lluvia, viento leve', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  weatherConditions?: string | null;

  @ApiPropertyOptional({ example: 'Juan Perez', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleName?: string | null;

  @ApiPropertyOptional({ example: '2026-05-10T08:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  appliedAt?: string;

  @ApiPropertyOptional({ example: 'Aplicacion preventiva.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CancelApplicationDto {
  @ApiProperty({ example: 'Registro duplicado o error de cantidad.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
