import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsService } from '@/services/patients.service';

export const PATIENT_KEYS = {
  all: ['patients'],
  list: (params) => [...PATIENT_KEYS.all, 'list', params],
  detail: (id) => [...PATIENT_KEYS.all, 'detail', id],
};

export function usePatients(params = {}, options = {}) {
  return useQuery({
    queryKey: PATIENT_KEYS.list(params),
    queryFn: () => patientsService.getPatients(params),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function usePatient(patientId, options = {}) {
  return useQuery({
    queryKey: PATIENT_KEYS.detail(patientId),
    queryFn: () => patientsService.getPatientById(patientId),
    enabled: Boolean(patientId),
    ...options,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => patientsService.createPatient(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENT_KEYS.all });
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientId, data }) => patientsService.updatePatient(patientId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: PATIENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: PATIENT_KEYS.detail(variables.patientId) });
    },
  });
}
