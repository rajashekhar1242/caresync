import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { AppointmentsPage } from '@/features/receptionist/appointments-page';
import { BookAppointmentPage } from '@/features/receptionist/book-appointment-page';
import { appointmentsService } from '@/services/appointments.service';
import { doctorsService } from '@/services/doctors.service';
import { patientsService } from '@/services/patients.service';
import { departmentsService } from '@/services/departments.service';
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
    patientName: 'Kavita Iyer',
    doctorName: 'Dr. Sarah Jenkins',
    slotStart: '2026-11-13T10:30:00Z',
    slotEnd: '2026-11-13T10:45:00Z',
    status: 'BOOKED',
    tokenNumber: null,
  },
  {
    id: 'appt-2',
    patientName: 'Arjun Das',
    doctorName: 'Dr. Sarah Jenkins',
    slotStart: '2026-11-13T09:00:00Z',
    slotEnd: '2026-11-13T09:15:00Z',
    status: 'CHECKED_IN',
    tokenNumber: 1,
  },
];

const mockDoctors = [
  {
    id: 'doc-1',
    fullName: 'Dr. Sarah Jenkins',
    consultationFee: '900.00 INR',
    slotMinutes: 15,
    active: true,
    specialization: { id: 'spec-1', name: 'Cardiology' },
    clinic: { id: 'c-1', name: 'Main Clinic', timeZone: 'Asia/Kolkata' },
  },
];

describe('Receptionist Appointments Management & Booking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(doctorsService, 'getDoctors').mockResolvedValue({
      content: mockDoctors,
      totalElements: 1,
      totalPages: 1,
    });
    vi.spyOn(departmentsService, 'getDepartments').mockResolvedValue([]);
  });

  it('renders appointments list with patient names, doctor names, and tokens', async () => {
    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValueOnce({
      content: mockAppointments,
      totalElements: 2,
      totalPages: 1,
    });

    renderWithProviders(<AppointmentsPage />);

    expect(await screen.findByText('Kavita Iyer')).toBeInTheDocument();
    expect(screen.getByText('Arjun Das')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('triggers check-in confirmation and executes check-in mutation', async () => {
    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValueOnce({
      content: mockAppointments,
      totalElements: 2,
      totalPages: 1,
    });
    const checkInSpy = vi.spyOn(appointmentsService, 'checkInAppointment').mockResolvedValueOnce({
      id: 'appt-1',
      patientName: 'Kavita Iyer',
      doctorName: 'Dr. Sarah Jenkins',
      status: 'CHECKED_IN',
      tokenNumber: 2,
    });

    const user = userEvent.setup();
    renderWithProviders(<AppointmentsPage />);

    expect(await screen.findByText('Kavita Iyer')).toBeInTheDocument();
    const checkInBtn = screen.getAllByRole('button', { name: /check in/i })[0];
    await user.click(checkInBtn);

    expect(await screen.findByText('Check-In Patient')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /confirm check-in/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(checkInSpy).toHaveBeenCalledWith('appt-1');
    });
  });

  it('executes booking appointment workflow when slot is chosen', async () => {
    vi.spyOn(patientsService, 'getPatientById').mockResolvedValueOnce({
      id: 'pat-1',
      fullName: 'Kavita Iyer',
      phone: '+919876543210',
    });
    vi.spyOn(doctorsService, 'getDoctorSlots').mockResolvedValueOnce({
      doctorId: 'doc-1',
      clinicId: 'c-1',
      date: '2026-11-13',
      slotMinutes: 15,
      slots: [
        { start: '2026-11-13T10:00:00Z', end: '2026-11-13T10:15:00Z', available: true },
      ],
    });

    const bookSpy = vi.spyOn(appointmentsService, 'bookAppointment').mockResolvedValueOnce({
      id: '10000000-0000-0000-0000-000000000999',
      patientName: 'Kavita Iyer',
      doctorName: 'Dr. Sarah Jenkins',
      slotStart: '2026-11-13T10:00:00Z',
      slotEnd: '2026-11-13T10:15:00Z',
      status: 'BOOKED',
    });

    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/receptionist/appointments/book?patientId=pat-1']}>
            <BookAppointmentPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Wait for doctor options to load
    await screen.findByText(/Dr\. Sarah Jenkins/i);
    const doctorSelect = screen.getByDisplayValue('Choose a Doctor');
    await user.selectOptions(doctorSelect, 'doc-1');

    // Slot button appears
    const slotBtn = await screen.findByRole('button', { name: /10:00|03:30/i });
    await user.click(slotBtn);

    const submitBtn = screen.getByRole('button', { name: /confirm appointment/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/Appointment Successfully Confirmed/i)).toBeInTheDocument();
    expect(screen.getByText('10000000-0000-0000-0000-000000000999')).toBeInTheDocument();
    expect(bookSpy).toHaveBeenCalled();
  });
});
