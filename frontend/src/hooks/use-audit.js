import { useQuery } from '@tanstack/react-query';
import { auditService } from '@/services/audit.service';

export const AUDIT_KEYS = {
  all: ['audit-logs'],
  list: (params) => [...AUDIT_KEYS.all, 'list', params],
};

export function useAuditLogs(params = {}, options = {}) {
  return useQuery({
    queryKey: AUDIT_KEYS.list(params),
    queryFn: () => auditService.getAuditLogs(params),
    staleTime: 30 * 1000,
    ...options,
  });
}
