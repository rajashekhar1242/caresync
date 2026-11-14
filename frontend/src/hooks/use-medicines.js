import { useQuery } from '@tanstack/react-query';
import { medicinesService } from '@/services/medicines.service';

export const MEDICINE_KEYS = {
  all: ['medicines'],
  search: (params) => [...MEDICINE_KEYS.all, 'search', params],
};

export function useMedicines(params = {}, options = {}) {
  const hasSearch = !params.name || params.name.trim().length >= 2;

  return useQuery({
    queryKey: MEDICINE_KEYS.search(params),
    queryFn: () => medicinesService.searchMedicines(params),
    enabled: hasSearch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}
