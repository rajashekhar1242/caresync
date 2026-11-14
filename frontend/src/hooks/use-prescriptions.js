import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { prescriptionsService } from '@/services/prescriptions.service';

export const PRESCRIPTION_KEYS = {
  all: ['prescriptions'],
  detail: (id) => [...PRESCRIPTION_KEYS.all, 'detail', id],
  patientList: (patientId, params) => [...PRESCRIPTION_KEYS.all, 'patient', patientId, params],
};

export function usePrescription(prescriptionId, options = {}) {
  return useQuery({
    queryKey: PRESCRIPTION_KEYS.detail(prescriptionId),
    queryFn: () => prescriptionsService.getPrescription(prescriptionId),
    enabled: Boolean(prescriptionId),
    ...options,
  });
}

export function usePatientPrescriptions(patientId, params = {}, options = {}) {
  return useQuery({
    queryKey: PRESCRIPTION_KEYS.patientList(patientId, params),
    queryFn: () => prescriptionsService.getPatientPrescriptions(patientId, params),
    enabled: Boolean(patientId),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useCheckPrescription() {
  return useMutation({
    mutationFn: (data) => prescriptionsService.checkPrescription(data),
  });
}

export function useCreatePrescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => prescriptionsService.createPrescription(data),
    onSuccess: (data) => {
      queryClient.setQueryData(PRESCRIPTION_KEYS.detail(data.id), data);
      if (data.patientId) {
        queryClient.invalidateQueries({ queryKey: [...PRESCRIPTION_KEYS.all, 'patient', data.patientId] });
      }
    },
  });
}
