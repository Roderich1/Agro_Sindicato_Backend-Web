import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { ListStockQueryDto } from './list-stock-query.dto';

export class ListGlobalStockQueryDto extends ListStockQueryDto {
  @ApiPropertyOptional({ description: 'Filtra el inventario global por agricultor.' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}
