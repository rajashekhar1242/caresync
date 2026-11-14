import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppointmentsPage } from '@/features/admin/appointments-page';
import * as AppointmentsHookModule from '@/hooks/use-appointments';
import * as DoctorsHookModule from '@/hooks/use-doctors';
import * as ToastHookModule from '@/hooks/use-toast';

describe('AppointmentsPage Monitoring', () => {
  let queryClient;
  const mockToast = vi.fn();
  const mockCancel = vi.fn();

  const sampleAppointments = [
    {
      id: 'apt-1',
      patientName: 'Jane Smith',
      doctorName: 'Gregory House',
      doctorId: 'doc-1',
      slotStart: '2026-11-20T10:00:00Z',
      slotEnd: '2026-11-20T10:15:00Z',
      tokenNumber: 4,
      status: 'BOOKED',
      reason: 'General checkup',
    },
    {
      id: 'apt-2',
      patientName: 'John Doe',
      doctorName: 'Allison Cameron',
      doctorId: 'doc-2',
      slotStart: '2026-11-20T11:00:00Z',
      slotEnd: '2026-11-20T11:15:00Z',
      tokenNumber: 5,
      status: 'COMPLETED',
      reason: 'Followup',
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(ToastHookModule, 'useToast').mockReturnValue({ toast: mockToast });

    vi.spyOn(DoctorsHookModule, 'useDoctors').mockReturnValue({
      data: { content: [{ id: 'doc-1', fullName: 'Dr. House' }] },
      isLoading: false,
    });

    vi.spyOn(AppointmentsHookModule, 'useAppointments').mockReturnValue({
      data: {
        content: sampleAppointments,
        page: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    vi.spyOn(AppointmentsHookModule, 'useCancelAppointment').mockReturnValue({
      mutateAsync: mockCancel,
      isPending: false,
    });
  });

  it('renders appointment list with patient names, doctor names, and status badges', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppointmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Gregory House/)).toBeInTheDocument();
    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getAllByText('Booked').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
  });

  it('opens appointment details modal upon clicking View', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppointmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const viewButtons = screen.getAllByRole('button', { name: /view/i });
    fireEvent.click(viewButtons[0]);

    expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    expect(screen.getByText('General checkup')).toBeInTheDocument();
  });

  it('opens cancellation dialog and executes administrative cancellation with reason', async () => {
    mockCancel.mockResolvedValueOnce({ id: 'apt-1', status: 'CANCELLED' });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppointmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel appointment apt-1/i });
    fireEvent.click(cancelBtn);

    expect(screen.getByText(/are you sure you want to administratively cancel/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /confirm cancellation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith({
        appointmentId: 'apt-1',
        reason: 'Administrative cancellation',
      });
    });
  });
});
