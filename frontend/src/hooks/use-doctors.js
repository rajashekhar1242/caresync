import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doctorsService } from '@/services/doctors.service';

export const DOCTOR_KEYS = {
  all: ['doctors'],
  list: (params) => [...DOCTOR_KEYS.all, 'list', params],
  detail: (id) => [...DOCTOR_KEYS.all, 'detail', id],
  specializations: ['specializations'],
  clinics: ['clinics'],
  schedules: (doctorId) => [...DOCTOR_KEYS.all, 'schedules', doctorId],
  leaves: (doctorId, from, to) => [...DOCTOR_KEYS.all, 'leaves', doctorId, { from, to }],
  slots: (doctorId, date) => [...DOCTOR_KEYS.all, 'slots', doctorId, date],
};

export function useDoctors(params = {}, options = {}) {
  return useQuery({
    queryKey: DOCTOR_KEYS.list(params),
    queryFn: () => doctorsService.getDoctors(params),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useDoctor(doctorId, options = {}) {
  return useQuery({
    queryKey: DOCTOR_KEYS.detail(doctorId),
    queryFn: () => doctorsService.getDoctorById(doctorId),
    enabled: Boolean(doctorId),
    ...options,
  });
}

export function useCreateDoctor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => doctorsService.createDoctor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.all });
    },
  });
}

export function useUpdateDoctor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ doctorId, data }) => doctorsService.updateDoctor(doctorId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.detail(variables.doctorId) });
    },
  });
}

export function useSpecializations(options = {}) {
  return useQuery({
    queryKey: DOCTOR_KEYS.specializations,
    queryFn: () => doctorsService.getSpecializations(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

export function useClinics(options = {}) {
  return useQuery({
    queryKey: DOCTOR_KEYS.clinics,
    queryFn: () => doctorsService.getClinics(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

export function useDoctorSchedules(doctorId, options = {}) {
  return useQuery({
    queryKey: DOCTOR_KEYS.schedules(doctorId),
    queryFn: () => doctorsService.getDoctorSchedules(doctorId),
    enabled: Boolean(doctorId),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useDoctorLeaves(doctorId, from, to, options = {}) {
  return useQuery({
    queryKey: DOCTOR_KEYS.leaves(doctorId, from, to),
    queryFn: () => doctorsService.getDoctorLeaves(doctorId, from, to),
    enabled: Boolean(doctorId),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useDoctorSlots(doctorId, date, options = {}) {
  return useQuery({
    queryKey: DOCTOR_KEYS.slots(doctorId, date),
    queryFn: () => doctorsService.getDoctorSlots(doctorId, date),
    enabled: Boolean(doctorId && date),
    staleTime: 15 * 1000, // 15 seconds (dynamic availability)
    ...options,
  });
}

export function useCreateDoctorLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ doctorId, data }) => doctorsService.createDoctorLeave(doctorId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.leaves(variables.doctorId) });
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.slots(variables.doctorId) });
    },
  });
}

export function useDeleteDoctorLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ doctorId, leaveId }) => doctorsService.deleteDoctorLeave(doctorId, leaveId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.leaves(variables.doctorId) });
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.slots(variables.doctorId) });
    },
  });
}

export function useUpdateDoctorSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ doctorId, data }) => doctorsService.updateDoctorSchedule(doctorId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.schedules(variables.doctorId) });
      queryClient.invalidateQueries({ queryKey: DOCTOR_KEYS.slots(variables.doctorId) });
    },
  });
}
