import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchasePaymentMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import { ProductReferenceDto } from '../../../inventory/application/dto/product-reference.dto';

export class SupplierReferenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ example: 'Agroservicios San Julian' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @ApiPropertyOptional({ example: '70000000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: 'San Julian, Santa Cruz' })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  address?: string;
}

export class CreatePurchaseItemDto {
  @ApiProperty({ type: ProductReferenceDto })
  @ValidateNested()
  @Type(() => ProductReferenceDto)
  product: ProductReferenceDto;

  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ example: 45.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ example: 'LOTE-COMPRA-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}

export class CreatePurchaseDto {
  @ApiProperty({ type: SupplierReferenceDto })
  @ValidateNested()
  @Type(() => SupplierReferenceDto)
  supplier: SupplierReferenceDto;

  @ApiProperty({ enum: PurchasePaymentMode, example: PurchasePaymentMode.CREDITO })
  @IsEnum(PurchasePaymentMode)
  paymentMode: PurchasePaymentMode;

  @ApiProperty({ type: [CreatePurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items: CreatePurchaseItemDto[];

  @ApiPropertyOptional({ example: '2026-05-28' })
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiPropertyOptional({ example: '2026-06-28', description: 'Obligatorio cuando paymentMode=CREDITO.' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Galpon principal' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Compra registrada desde formulario' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
