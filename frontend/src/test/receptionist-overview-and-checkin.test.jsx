import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { ReceptionistHome } from '@/features/receptionist/receptionist-home';
import { CheckInPage } from '@/features/receptionist/check-in-page';
import { appointmentsService } from '@/services/appointments.service';
import { doctorsService } from '@/services/doctors.service';
import { queueService } from '@/services/queue.service';
import * as AuthContextModule from '@/app/providers/auth.context';

function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: { id: 'rec-1', fullName: 'Receptionist User', role: 'RECEPTIONIST' },
    role: 'RECEPTIONIST',
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const mockAppointments = [
  {
    id: 'appt-1',
    patientName: 'Rohan Mehra',
    doctorName: 'Dr. Sarah Jenkins',
    slotStart: '2026-11-13T10:00:00Z',
    status: 'BOOKED',
    tokenNumber: null,
  },
  {
    id: 'appt-2',
    patientName: 'Priya Sharma',
    doctorName: 'Dr. Sarah Jenkins',
    slotStart: '2026-11-13T09:30:00Z',
    status: 'CHECKED_IN',
    tokenNumber: 1,
  },
  {
    id: 'appt-3',
    patientName: 'Deepak Verma',
    doctorName: 'Dr. Sarah Jenkins',
    slotStart: '2026-11-13T09:00:00Z',
    status: 'COMPLETED',
    tokenNumber: null,
  },
];

const mockDoctors = [
  {
    id: 'doc-1',
    fullName: 'Dr. Sarah Jenkins',
    active: true,
    consultationFee: '900.00 INR',
    slotMinutes: 15,
    specialization: { id: 'spec-1', name: 'Cardiology' },
    clinic: { id: 'c-1', name: 'Main Clinic', timeZone: 'Asia/Kolkata' },
  },
];

describe('Receptionist Overview Dashboard & Check-In Desk', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(doctorsService, 'getDoctors').mockResolvedValue({
      content: mockDoctors,
      totalElements: 1,
      totalPages: 1,
    });
    vi.spyOn(doctorsService, 'getClinics').mockResolvedValue([
      { id: 'c-1', name: 'Main Clinic', timeZone: 'Asia/Kolkata' },
    ]);
    vi.spyOn(queueService, 'getQueueBoard').mockResolvedValue({
      clinicId: 'c-1',
      doctors: [],
    });
  });

  it('renders ReceptionistHome KPI cards and schedule table from live queries', async () => {
    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValueOnce({
      content: mockAppointments,
      totalElements: 3,
      totalPages: 1,
    });

    renderWithProviders(<ReceptionistHome />);

    expect(await screen.findByText('Rohan Mehra')).toBeInTheDocument();
    expect(screen.getByText('Receptionist Front Desk')).toBeInTheDocument();
    expect(screen.getAllByText('Priya Sharma').length).toBeGreaterThan(0);
    // Quick action buttons
    expect(screen.getByText('Register Patient')).toBeInTheDocument();
    expect(screen.getByText('Book Appointment')).toBeInTheDocument();
    expect(screen.getByText('Fast Check-In')).toBeInTheDocument();
  });

  it('renders CheckInPage arrival list and completes patient arrival with token issuance', async () => {
    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValueOnce({
      content: mockAppointments,
      totalElements: 3,
      totalPages: 1,
    });
    const checkInSpy = vi.spyOn(appointmentsService, 'checkInAppointment').mockResolvedValueOnce({
      id: 'appt-1',
      patientName: 'Rohan Mehra',
      doctorName: 'Dr. Sarah Jenkins',
      slotStart: '2026-11-13T10:00:00Z',
      status: 'CHECKED_IN',
      tokenNumber: 2,
    });

    const user = userEvent.setup();
    renderWithProviders(<CheckInPage />);

    expect(await screen.findByText('Rohan Mehra')).toBeInTheDocument();
    expect(screen.getByText('Patient Arrival & Check-In Desk')).toBeInTheDocument();

    const checkInButtons = screen.getAllByRole('button', { name: /check in/i });
    await user.click(checkInButtons[0]);

    expect(await screen.findByText('Execute Check-In')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /confirm arrival/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(checkInSpy).toHaveBeenCalledWith('appt-1');
    });

    // Prominent token banner appears
    expect(await screen.findByText(/Token Issued Just Now/i)).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print token slip/i })).toBeInTheDocument();
  });

  it('handles large appointment volume pagination and displays honest volume notice', async () => {
    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValueOnce({
      content: mockAppointments,
      totalElements: 185,
      totalPages: 2,
    });

    renderWithProviders(<ReceptionistHome />);

    const matching185 = await screen.findAllByText('185');
    expect(matching185.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/Displaying the first 100 of/i)
    ).toBeInTheDocument();
  });

  it('correctly separates active encounters from cancelled encounters in KPI cards', async () => {
    const appointmentsWithCancelled = [
      ...mockAppointments,
      {
        id: 'appt-4',
        patientName: 'Kavita Patel',
        doctorName: 'Dr. Sarah Jenkins',
        slotStart: '2026-11-13T11:00:00Z',
        status: 'CANCELLED',
        tokenNumber: null,
      },
    ];

    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValueOnce({
      content: appointmentsWithCancelled,
      totalElements: 4,
      totalPages: 1,
    });

    renderWithProviders(<ReceptionistHome />);

    expect(await screen.findByText('4')).toBeInTheDocument();
    // Subtitle indicates active vs cancelled
    expect(screen.getByText(/3 active · 1 cancelled/i)).toBeInTheDocument();
  });
});
