import { api } from '../lib/axios';
import type { AuditLog, ListAuditLogsQuery } from '../types/audit-logs';

export const auditLogsService = {
  list: (params?: ListAuditLogsQuery) =>
    api.get<AuditLog[]>('/audit-logs', { params }).then((r) => r.data),
};
