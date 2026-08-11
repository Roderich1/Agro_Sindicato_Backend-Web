import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import { ListCalendarEventsQueryDto } from '../../application/dto/calendar-event.dto';
import { CalendarEventsUseCase } from '../../application/use-cases/calendar-events.use-case';

@ApiTags('calendar')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('calendar/events')
export class CalendarEventsController {
  constructor(private readonly calendarEventsUseCase: CalendarEventsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar eventos de calendario visibles para el usuario autenticado' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListCalendarEventsQueryDto) {
    return this.calendarEventsUseCase.list(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      query,
    );
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar evento de calendario como completado' })
  async complete(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.calendarEventsUseCase.complete(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar evento de calendario' })
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.calendarEventsUseCase.cancel(
      user.tenantId,
      { userId: user.sub, role: user.role as UserRole },
      id,
    );
  }
}
