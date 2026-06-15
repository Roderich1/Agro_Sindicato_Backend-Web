import { ApiPropertyOptional } from '@nestjs/swagger';
import { PurchasePaymentMode, PurchaseStatus, PurchaseType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListPurchasesQueryDto {
  @ApiPropertyOptional({ enum: PurchaseType })
  @IsOptional()
  @IsEnum(PurchaseType)
  type?: PurchaseType;

  @ApiPropertyOptional({ enum: PurchaseStatus })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @ApiPropertyOptional({ enum: PurchasePaymentMode })
  @IsOptional()
  @IsEnum(PurchasePaymentMode)
  paymentMode?: PurchasePaymentMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
