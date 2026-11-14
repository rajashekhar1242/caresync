import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentsService } from '@/services/appointments.service';

export const APPOINTMENT_KEYS = {
  all: ['appointments'],
  list: (params) => [...APPOINTMENT_KEYS.all, 'list', params],
  detail: (id) => [...APPOINTMENT_KEYS.all, 'detail', id],
};

export function useAppointments(params = {}, options = {}) {
  return useQuery({
    queryKey: APPOINTMENT_KEYS.list(params),
    queryFn: () => appointmentsService.getAppointments(params),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

export function useAppointment(appointmentId, options = {}) {
  return useQuery({
    queryKey: APPOINTMENT_KEYS.detail(appointmentId),
    queryFn: () => appointmentsService.getAppointmentById(appointmentId),
    enabled: Boolean(appointmentId),
    ...options,
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, reason }) =>
      appointmentsService.cancelAppointment(appointmentId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.detail(variables.appointmentId) });
    },
  });
}

export function useBookAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => appointmentsService.bookAppointment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.all });
    },
  });
}

export function useCheckInAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointmentId) => appointmentsService.checkInAppointment(appointmentId),
    onSuccess: (_, appointmentId) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.detail(appointmentId) });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, status, reason }) =>
      appointmentsService.updateAppointmentStatus(appointmentId, status, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.detail(variables.appointmentId) });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}
