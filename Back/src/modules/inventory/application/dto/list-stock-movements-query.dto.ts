import { ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListStockMovementsQueryDto {
  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
