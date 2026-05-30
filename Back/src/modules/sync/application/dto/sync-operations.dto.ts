import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum OfflineOperationType {
  INITIAL_STOCK = 'INITIAL_STOCK',
  STOCK_ENTRY = 'STOCK_ENTRY',
  STOCK_EXIT = 'STOCK_EXIT',
}

export class OfflineOperationDto {
  @ApiProperty({ example: 'device-op-001' })
  @IsString()
  @MaxLength(120)
  clientOperationId: string;

  @ApiProperty({ enum: OfflineOperationType })
  @IsEnum(OfflineOperationType)
  operation: OfflineOperationType;

  @ApiProperty()
  @IsObject()
  payload: Record<string, unknown>;
}

export class SyncOperationsDto {
  @ApiProperty({ example: 'android-juan-001' })
  @IsString()
  @MaxLength(120)
  clientId: string;

  @ApiProperty({ type: [OfflineOperationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfflineOperationDto)
  operations: OfflineOperationDto[];
}

export class ListSyncOperationsQueryDto {
  @ApiPropertyOptional({ example: 'android-juan-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientId?: string;
}
