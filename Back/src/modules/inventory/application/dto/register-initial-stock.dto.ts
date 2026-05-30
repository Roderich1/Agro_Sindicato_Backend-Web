import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductReferenceDto } from './product-reference.dto';

export class RegisterInitialStockDto {
  @ApiProperty({ type: ProductReferenceDto })
  @ValidateNested()
  @Type(() => ProductReferenceDto)
  product: ProductReferenceDto;

  @ApiProperty({ example: 25 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ example: 'LOTE-2026-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-10-30' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiPropertyOptional({ description: 'Almacen existente donde se guardara el producto.' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Galpon principal' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseName?: string;

  @ApiPropertyOptional({ example: 'Inventario cargado al iniciar el sistema' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
