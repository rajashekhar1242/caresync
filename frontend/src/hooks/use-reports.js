import { useQuery } from '@tanstack/react-query';
import { reportsService } from '@/services/reports.service';

export const REPORT_KEYS = {
  all: ['reports'],
  dashboard: (clinicId) => [...REPORT_KEYS.all, 'dashboard', clinicId || 'all'],
  revenue: (params) => [...REPORT_KEYS.all, 'revenue', params],
  departmentAppointments: (params) => [...REPORT_KEYS.all, 'department-appointments', params],
  noShowRate: (params) => [...REPORT_KEYS.all, 'no-show-rate', params],
  topDoctors: (params) => [...REPORT_KEYS.all, 'top-doctors', params],
};

export function useDashboardSummary(clinicId, options = {}) {
  return useQuery({
    queryKey: REPORT_KEYS.dashboard(clinicId),
    queryFn: () => reportsService.getDashboardSummary(clinicId),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

export function useRevenueReport({ from, to, clinicId, groupBy = 'DAY' }, options = {}) {
  return useQuery({
    queryKey: REPORT_KEYS.revenue({ from, to, clinicId, groupBy }),
    queryFn: () => reportsService.getRevenueReport({ from, to, clinicId, groupBy }),
    enabled: Boolean(from && to),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useAppointmentsByDepartment({ from, to, clinicId }, options = {}) {
  return useQuery({
    queryKey: REPORT_KEYS.departmentAppointments({ from, to, clinicId }),
    queryFn: () => reportsService.getAppointmentsByDepartment({ from, to, clinicId }),
    enabled: Boolean(from && to),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useNoShowRate({ from, to, clinicId }, options = {}) {
  return useQuery({
    queryKey: REPORT_KEYS.noShowRate({ from, to, clinicId }),
    queryFn: () => reportsService.getNoShowRate({ from, to, clinicId }),
    enabled: Boolean(from && to),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useTopDoctors({ from, to, clinicId, rankBy, limit }, options = {}) {
  return useQuery({
    queryKey: REPORT_KEYS.topDoctors({ from, to, clinicId, rankBy, limit }),
    queryFn: () => reportsService.getTopDoctors({ from, to, clinicId, rankBy, limit }),
    enabled: Boolean(from && to),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
