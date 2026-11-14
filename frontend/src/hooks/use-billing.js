import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingService } from '@/services/billing.service';

export const BILLING_KEYS = {
  all: ['invoices'],
  list: (params) => [...BILLING_KEYS.all, 'list', params],
  detail: (id) => [...BILLING_KEYS.all, 'detail', id],
};

export function useInvoices(params = {}, options = {}) {
  return useQuery({
    queryKey: BILLING_KEYS.list(params),
    queryFn: () => billingService.getInvoices(params),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useInvoice(invoiceId, options = {}) {
  return useQuery({
    queryKey: BILLING_KEYS.detail(invoiceId),
    queryFn: () => billingService.getInvoiceById(invoiceId),
    enabled: Boolean(invoiceId),
    ...options,
  });
}

export function useVoidInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, reason }) => billingService.voidInvoice(invoiceId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: BILLING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: BILLING_KEYS.detail(variables.invoiceId) });
    },
  });
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, data }) => billingService.createCreditNote(invoiceId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: BILLING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: BILLING_KEYS.detail(variables.invoiceId) });
    },
  });
}
