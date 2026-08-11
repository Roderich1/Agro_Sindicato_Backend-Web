import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementReasonType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class RegisterStockExitDto {
  @ApiProperty({ description: 'Producto del que se descontara stock.' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ description: 'Si se omite, se usa la campana activa.' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({
    description: 'Lote especifico a descontar. Si no se envia, se descuentan primero los lotes con vencimiento mas cercano.',
  })
  @IsOptional()
  @IsUUID()
  inventoryLotId?: string;

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ enum: StockMovementReasonType, example: StockMovementReasonType.OTRO })
  @IsEnum(StockMovementReasonType)
  reasonType: StockMovementReasonType;

  @ApiProperty({ example: 'Aplicacion en parcela norte' })
  @IsString()
  @MaxLength(250)
  reason: string;
}
