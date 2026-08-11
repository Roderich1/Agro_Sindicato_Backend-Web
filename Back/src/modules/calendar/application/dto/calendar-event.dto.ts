import { ApiPropertyOptional } from '@nestjs/swagger';
import { CalendarEventStatus, CalendarEventType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListCalendarEventsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Filtro para directiva o administrador' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ enum: CalendarEventType })
  @IsOptional()
  @IsEnum(CalendarEventType)
  type?: CalendarEventType;

  @ApiPropertyOptional({ enum: CalendarEventStatus })
  @IsOptional()
  @IsEnum(CalendarEventStatus)
  status?: CalendarEventStatus;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
