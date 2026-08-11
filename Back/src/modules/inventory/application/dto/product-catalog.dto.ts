import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ListProductsQueryDto {
  @ApiPropertyOptional({ example: 'glifosato' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 'Herbicida' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

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

export class CreateProductDto {
  @ApiProperty({ example: 'Glifosato 48%' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'Glifosato Max' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  commercialName?: string;

  @ApiPropertyOptional({ example: 'Glifosato' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  activeIngredient?: string;

  @ApiPropertyOptional({ example: 'Herbicida' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ example: 'II - Moderadamente peligroso', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toxicologicalCategory?: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/fds/glifosato.pdf', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  safetyDataSheetUrl?: string | null;

  @ApiPropertyOptional({ example: 'FDS Glifosato 48%', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  safetyDataSheetName?: string | null;

  @ApiPropertyOptional({ example: 'Usar guantes, mascara y evitar deriva.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  safetyInstructions?: string | null;

  @ApiPropertyOptional({ example: 'AGRO-PRODUCT-GLIFOSATO-48', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  qrCodeValue?: string | null;

  @ApiProperty({ example: 'L' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3650)
  expirationWarningDays?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Glifosato 48%' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'Glifosato Max' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  commercialName?: string;

  @ApiPropertyOptional({ example: 'Glifosato' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  activeIngredient?: string;

  @ApiPropertyOptional({ example: 'Herbicida' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ example: 'II - Moderadamente peligroso', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toxicologicalCategory?: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/fds/glifosato.pdf', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  safetyDataSheetUrl?: string | null;

  @ApiPropertyOptional({ example: 'FDS Glifosato 48%', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  safetyDataSheetName?: string | null;

  @ApiPropertyOptional({ example: 'Usar guantes, mascara y evitar deriva.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  safetyInstructions?: string | null;

  @ApiPropertyOptional({ example: 'AGRO-PRODUCT-GLIFOSATO-48', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  qrCodeValue?: string | null;

  @ApiPropertyOptional({ example: 'L' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3650)
  expirationWarningDays?: number;
}
