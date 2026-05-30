import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ProductReferenceDto {
  @ApiPropertyOptional({
    description: 'ID de un producto existente. Si no se envia, se crea/busca por nombre.',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: 'Glifosato 48%' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  productName?: string;

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
