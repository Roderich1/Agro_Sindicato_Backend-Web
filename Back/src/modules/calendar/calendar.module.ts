import { Module } from '@nestjs/common';
import { CalendarEventsController } from './api/rest/calendar-events.controller';
import { CalendarEventsUseCase } from './application/use-cases/calendar-events.use-case';

@Module({
  controllers: [CalendarEventsController],
  providers: [CalendarEventsUseCase],
})
export class CalendarModule {}
