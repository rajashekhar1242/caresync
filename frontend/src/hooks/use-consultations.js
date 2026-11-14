import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consultationsService } from '@/services/consultations.service';
import { APPOINTMENT_KEYS } from './use-appointments';

export const CONSULTATION_KEYS = {
  all: ['consultations'],
  byAppointment: (appointmentId) => [...CONSULTATION_KEYS.all, 'appointment', appointmentId],
  detail: (id) => [...CONSULTATION_KEYS.all, 'detail', id],
};

export function useAppointmentConsultation(appointmentId, options = {}) {
  return useQuery({
    queryKey: CONSULTATION_KEYS.byAppointment(appointmentId),
    queryFn: () => consultationsService.getAppointmentConsultation(appointmentId),
    enabled: Boolean(appointmentId),
    retry: false, // 404 is normal before consultation is created
    ...options,
  });
}

export function useConsultation(consultationId, options = {}) {
  return useQuery({
    queryKey: CONSULTATION_KEYS.detail(consultationId),
    queryFn: () => consultationsService.getConsultation(consultationId),
    enabled: Boolean(consultationId),
    ...options,
  });
}

export function useCreateConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, data }) => consultationsService.createConsultation(appointmentId, data),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(CONSULTATION_KEYS.byAppointment(variables.appointmentId), data);
      queryClient.setQueryData(CONSULTATION_KEYS.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.all });
    },
  });
}

export function useUpdateConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ consultationId, data }) => consultationsService.updateConsultation(consultationId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(CONSULTATION_KEYS.detail(data.id), data);
      if (data.appointmentId) {
        queryClient.setQueryData(CONSULTATION_KEYS.byAppointment(data.appointmentId), data);
      }
      queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.all });
    },
  });
}
