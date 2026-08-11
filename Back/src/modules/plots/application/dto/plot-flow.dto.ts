import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CropAssignmentStatus, PlotStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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

export class ListPlotsQueryDto {
  @ApiPropertyOptional({ example: 'Campo norte' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: PlotStatus })
  @IsOptional()
  @IsEnum(PlotStatus)
  status?: PlotStatus;

  @ApiPropertyOptional({ description: 'Filtro para directiva o administrador' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class CreatePlotDto {
  @ApiProperty({ example: 'Campo norte' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Comunidad 19 de Agosto, lote 3', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiPropertyOptional({ example: 12.5, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  area?: number | null;

  @ApiPropertyOptional({ example: 'ha' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  areaUnit?: string;

  @ApiPropertyOptional({ example: 'Parcela principal del agricultor.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdatePlotDto {
  @ApiPropertyOptional({ example: 'Campo norte' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Comunidad 19 de Agosto, lote 3', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiPropertyOptional({ example: 12.5, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  area?: number | null;

  @ApiPropertyOptional({ example: 'ha' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  areaUnit?: string;

  @ApiPropertyOptional({ example: 'Parcela principal del agricultor.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ListCropsQueryDto {
  @ApiPropertyOptional({ example: 'soya' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCropDto {
  @ApiProperty({ example: 'Soya' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Munasqa', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  variety?: string | null;

  @ApiPropertyOptional({ example: 'Cultivo habilitado para campanas de verano.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateCropDto {
  @ApiPropertyOptional({ example: 'Soya' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Munasqa', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  variety?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Cultivo habilitado para campanas de verano.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ListPlotCropAssignmentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  plotId?: string;

  @ApiPropertyOptional({ description: 'Filtro para directiva o administrador' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ enum: CropAssignmentStatus })
  @IsOptional()
  @IsEnum(CropAssignmentStatus)
  status?: CropAssignmentStatus;
}

export class CreatePlotCropAssignmentDto {
  @ApiPropertyOptional({ description: 'Si se omite, se usa la campana activa.' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiProperty()
  @IsUUID()
  plotId: string;

  @ApiProperty()
  @IsUUID()
  cropId: string;

  @ApiPropertyOptional({ example: 10.5, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  plantedArea?: number | null;

  @ApiPropertyOptional({ example: '2026-04-15', nullable: true })
  @IsOptional()
  @IsDateString()
  plantedAt?: string | null;

  @ApiPropertyOptional({ example: 'Cultivo principal de la parcela.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdatePlotCropAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cropId?: string;

  @ApiPropertyOptional({ enum: CropAssignmentStatus })
  @IsOptional()
  @IsEnum(CropAssignmentStatus)
  status?: CropAssignmentStatus;

  @ApiPropertyOptional({ example: 10.5, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  plantedArea?: number | null;

  @ApiPropertyOptional({ example: '2026-04-15', nullable: true })
  @IsOptional()
  @IsDateString()
  plantedAt?: string | null;

  @ApiPropertyOptional({ example: 'Cambio de cultivo registrado.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
