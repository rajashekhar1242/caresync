import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { departmentsService } from '@/services/departments.service';

export const DEPARTMENT_KEYS = {
  all: ['departments'],
  list: () => [...DEPARTMENT_KEYS.all, 'list'],
};

export function useDepartments(options = {}) {
  return useQuery({
    queryKey: DEPARTMENT_KEYS.list(),
    queryFn: () => departmentsService.getDepartments(),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => departmentsService.createDepartment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEPARTMENT_KEYS.all });
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ departmentId, data }) => departmentsService.updateDepartment(departmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEPARTMENT_KEYS.all });
    },
  });
}
