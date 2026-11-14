import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queueService } from '@/services/queue.service';

export const QUEUE_KEYS = {
  all: ['queue'],
  doctor: (doctorId) => [...QUEUE_KEYS.all, 'doctor', doctorId],
  board: (clinicId) => [...QUEUE_KEYS.all, 'board', clinicId],
};

export function useDoctorQueue(doctorId, options = {}) {
  return useQuery({
    queryKey: QUEUE_KEYS.doctor(doctorId),
    queryFn: () => queueService.getDoctorQueue(doctorId),
    enabled: Boolean(doctorId),
    staleTime: 5 * 1000, // 5 seconds
    ...options,
  });
}

export function useQueueBoard(clinicId, options = {}) {
  return useQuery({
    queryKey: QUEUE_KEYS.board(clinicId),
    queryFn: () => queueService.getQueueBoard(clinicId),
    enabled: Boolean(clinicId),
    staleTime: 5 * 1000, // 5 seconds
    ...options,
  });
}

export function useCallNext() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (doctorId) => queueService.callNext(doctorId),
    onSuccess: (_, doctorId) => {
      queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.doctor(doctorId) });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.all });
    },
  });
}
