import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListLotsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class UpdateInventoryLotDto {
  @ApiPropertyOptional({ example: 'LOTE-2026-01' })
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
}
