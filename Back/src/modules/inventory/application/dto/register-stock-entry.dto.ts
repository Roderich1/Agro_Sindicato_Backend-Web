import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductReferenceDto } from './product-reference.dto';

export enum StockEntryReason {
  COMPRA = 'COMPRA',
  DEVOLUCION = 'DEVOLUCION',
  AJUSTE = 'AJUSTE',
}

export class RegisterStockEntryDto {
  @ApiProperty({ type: ProductReferenceDto })
  @ValidateNested()
  @Type(() => ProductReferenceDto)
  product: ProductReferenceDto;

  @ApiProperty({ enum: StockEntryReason, example: StockEntryReason.COMPRA })
  @IsEnum(StockEntryReason)
  entryReason: StockEntryReason;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ example: 'LOTE-2026-02' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Galpon principal' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseName?: string;

  @ApiPropertyOptional({ example: 'Compra semanal o devolucion de campaña' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
