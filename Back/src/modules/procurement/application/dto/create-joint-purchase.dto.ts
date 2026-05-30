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
import { SupplierReferenceDto } from './create-purchase.dto';

export class JointPurchaseAllocationDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;
}

export class CreateJointPurchaseItemDto {
  @ApiProperty({ type: ProductReferenceDto })
  @ValidateNested()
  @Type(() => ProductReferenceDto)
  product: ProductReferenceDto;

  @ApiProperty({ example: 50 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ example: 42 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ example: 'LOTE-CONJ-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiProperty({ type: [JointPurchaseAllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JointPurchaseAllocationDto)
  allocations: JointPurchaseAllocationDto[];
}

export class CreateJointPurchaseDto {
  @ApiProperty({ type: SupplierReferenceDto })
  @ValidateNested()
  @Type(() => SupplierReferenceDto)
  supplier: SupplierReferenceDto;

  @ApiProperty({ enum: PurchasePaymentMode, example: PurchasePaymentMode.CREDITO })
  @IsEnum(PurchasePaymentMode)
  paymentMode: PurchasePaymentMode;

  @ApiProperty({ type: [CreateJointPurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateJointPurchaseItemDto)
  items: CreateJointPurchaseItemDto[];

  @ApiPropertyOptional({ example: '2026-05-28' })
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiPropertyOptional({ example: '2026-06-28', description: 'Obligatorio si paymentMode=CREDITO.' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Deposito comun del sindicato' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Compra conjunta para aprovechar descuento por volumen' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
