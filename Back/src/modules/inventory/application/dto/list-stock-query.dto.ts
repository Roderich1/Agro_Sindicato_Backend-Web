import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum InventoryCriticality {
  BAJO_MINIMO = 'BAJO_MINIMO',
  VENCIDO = 'VENCIDO',
  POR_VENCER = 'POR_VENCER',
  OK = 'OK',
}

export class ListStockQueryDto {
  @ApiPropertyOptional({ example: 'glifosato' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: 'Herbicida' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ enum: InventoryCriticality })
  @IsOptional()
  @IsEnum(InventoryCriticality)
  criticality?: InventoryCriticality;

  @ApiPropertyOptional({ enum: ['name', 'stock', 'expiration'] })
  @IsOptional()
  @IsIn(['name', 'stock', 'expiration'])
  orderBy?: 'name' | 'stock' | 'expiration';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  orderDirection?: 'asc' | 'desc';
}

export class UpdateProductInventorySettingsDto {
  @ApiPropertyOptional({ example: 'Herbicida' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

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
