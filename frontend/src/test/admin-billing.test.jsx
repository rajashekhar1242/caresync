import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillingPage } from '@/features/admin/billing-page';
import { AuthContext } from '@/app/providers/auth.context';
import * as BillingHookModule from '@/hooks/use-billing';
import * as ToastHookModule from '@/hooks/use-toast';
import { billingService } from '@/services/billing.service';

describe('BillingPage Management', () => {
  let queryClient;
  const mockToast = vi.fn();
  const mockVoid = vi.fn();
  const mockCreditNote = vi.fn();

  const sampleInvoices = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-001',
      patientName: 'Alice Springs',
      totalAmount: '1500.00',
      amountPaid: '0.00',
      balanceDue: '1500.00',
      status: 'ISSUED',
      createdAt: '2026-11-13T10:00:00Z',
    },
    {
      id: 'inv-2',
      invoiceNumber: 'INV-2026-002',
      patientName: 'Bob Marley',
      totalAmount: '2000.00',
      amountPaid: '2000.00',
      balanceDue: '0.00',
      status: 'PAID',
      createdAt: '2026-11-13T11:00:00Z',
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(ToastHookModule, 'useToast').mockReturnValue({ toast: mockToast });

    vi.spyOn(BillingHookModule, 'useInvoices').mockReturnValue({
      data: {
        content: sampleInvoices,
        page: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    vi.spyOn(BillingHookModule, 'useInvoice').mockReturnValue({
      data: {
        ...sampleInvoices[0],
        items: [{ description: 'General Consultation', unitPrice: '1500.00', quantity: 1, totalPrice: '1500.00' }],
        payments: [],
        creditNotes: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    vi.spyOn(BillingHookModule, 'useVoidInvoice').mockReturnValue({
      mutateAsync: mockVoid,
      isPending: false,
    });

    vi.spyOn(BillingHookModule, 'useCreateCreditNote').mockReturnValue({
      mutateAsync: mockCreditNote,
      isPending: false,
    });
  });

  it('renders invoices list with invoice numbers, patient names, amounts, and statuses', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <BillingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Alice Springs')).toBeInTheDocument();
    expect(screen.getAllByText('₹1500.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Issued').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('INV-2026-002')).toBeInTheDocument();
    expect(screen.getAllByText('Paid').length).toBeGreaterThanOrEqual(1);
  });

  it('triggers PDF download when PDF button is clicked', async () => {
    const downloadSpy = vi.spyOn(billingService, 'downloadInvoicePdf').mockResolvedValueOnce();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <BillingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const pdfButtons = screen.getAllByRole('button', { name: /pdf/i });
    fireEvent.click(pdfButtons[0]);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith('inv-1', 'INV-2026-001');
    });
  });

  it('opens void dialog and executes void mutation on unpaid invoice', async () => {
    mockVoid.mockResolvedValueOnce({ id: 'inv-1', status: 'VOID' });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ isAuthenticated: true, role: 'ADMIN', user: { role: 'ADMIN' }, isLoading: false }}>
          <MemoryRouter>
            <BillingPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    const voidBtn = screen.getByRole('button', { name: /void invoice inv-2026-001/i });
    fireEvent.click(voidBtn);

    expect(screen.getByText(/marking an invoice as void renders it non-collectible/i)).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/created in error/i);
    fireEvent.change(reasonInput, { target: { value: 'Duplicate billing created' } });

    const confirmBtn = screen.getByRole('button', { name: /confirm void/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockVoid).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        reason: 'Duplicate billing created',
      });
    });
  });

  it('renders void and credit note buttons for authenticated ADMIN role', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ isAuthenticated: true, role: 'ADMIN', user: { role: 'ADMIN' }, isLoading: false }}>
          <MemoryRouter>
            <BillingPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /void invoice inv-2026-001/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /credit note for inv-2026-002/i })).toBeInTheDocument();
  });

  it('hides void and credit note buttons for RECEPTIONIST role', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ isAuthenticated: true, role: 'RECEPTIONIST', user: { role: 'RECEPTIONIST' }, isLoading: false }}>
          <MemoryRouter>
            <BillingPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /credit note/i })).not.toBeInTheDocument();
  });

  it('hides void and credit note buttons when AuthContext is missing (fail-closed)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <BillingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /credit note/i })).not.toBeInTheDocument();
  });

  it('hides void and credit note buttons for unknown or non-admin role (fail-closed)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ isAuthenticated: true, role: 'GUEST', user: { role: 'GUEST' }, isLoading: false }}>
          <MemoryRouter>
            <BillingPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /credit note/i })).not.toBeInTheDocument();
  });

  it('hides void and credit note buttons when auth is still loading (fail-closed)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ isAuthenticated: false, role: 'ADMIN', user: null, isLoading: true }}>
          <MemoryRouter>
            <BillingPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /credit note/i })).not.toBeInTheDocument();
  });
});
