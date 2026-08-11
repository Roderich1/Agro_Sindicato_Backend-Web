import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ListCampaignsQueryDto {
  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({ example: 'Invierno' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateCampaignDto {
  @ApiProperty({ example: 'Invierno 2026' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-08-31', nullable: true })
  @IsOptional()
  @IsDateString()
  estimatedEndDate?: string | null;

  @ApiPropertyOptional({ example: 'Campana de invierno para el sindicato.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional({ example: 'Invierno 2026' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-31', nullable: true })
  @IsOptional()
  @IsDateString()
  estimatedEndDate?: string | null;

  @ApiPropertyOptional({ example: 'Campana de invierno para el sindicato.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CloseCampaignDto {
  @ApiPropertyOptional({ example: 'Cierre administrativo de campana.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
