import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export enum StockAdjustmentDirection {
  INCREMENTO = 'INCREMENTO',
  DECREMENTO = 'DECREMENTO',
}

export enum StockAdjustmentReason {
  PERDIDA = 'PERDIDA',
  DANO = 'DANO',
  CORRECCION = 'CORRECCION',
}

export class RegisterStockAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  inventoryLotId?: string;

  @ApiProperty({ enum: StockAdjustmentDirection })
  @IsEnum(StockAdjustmentDirection)
  direction: StockAdjustmentDirection;

  @ApiProperty({ enum: StockAdjustmentReason })
  @IsEnum(StockAdjustmentReason)
  reasonType: StockAdjustmentReason;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ example: 'Envase roto durante transporte' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;

  @ApiPropertyOptional({ example: 'LOTE-AJUSTE-01', description: 'Usado cuando direction=INCREMENTO y no se envia inventoryLotId.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiPropertyOptional({ example: 'Galpon principal' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseName?: string;
}
