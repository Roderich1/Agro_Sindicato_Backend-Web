import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayableStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListPayablesQueryDto {
  @ApiPropertyOptional({ enum: PayableStatus })
  @IsOptional()
  @IsEnum(PayableStatus)
  status?: PayableStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
