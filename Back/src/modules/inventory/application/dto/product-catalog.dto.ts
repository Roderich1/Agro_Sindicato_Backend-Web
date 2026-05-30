import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
