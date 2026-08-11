import { api } from '../lib/axios';
import type { CalendarEvent, ListCalendarEventsQuery } from '../types/calendar';

export const calendarService = {
  list: (params?: ListCalendarEventsQuery) =>
    api.get<CalendarEvent[]>('/calendar/events', { params }).then((r) => r.data),
  complete: (id: string) =>
    api.post<CalendarEvent>(`/calendar/events/${id}/complete`).then((r) => r.data),
  cancel: (id: string) =>
    api.post<CalendarEvent>(`/calendar/events/${id}/cancel`).then((r) => r.data),
};
