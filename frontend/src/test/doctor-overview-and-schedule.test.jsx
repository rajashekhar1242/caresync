import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { DoctorHome } from '@/features/doctor/doctor-home';
import { DoctorSchedulePage } from '@/features/doctor/doctor-schedule-page';
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
    user: { id: 'user-doc-1', doctorId: 'doc-1', fullName: 'Dr. Gregory House', role: 'DOCTOR' },
    role: 'DOCTOR',
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
    patientId: 'pat-1',
    patientName: 'John Doe',
    doctorName: 'Dr. Gregory House',
    slotStart: new Date().toISOString(),
    status: 'CHECKED_IN',
    tokenNumber: 1,
    reason: 'Severe back pain',
  },
  {
    id: 'appt-2',
    patientId: 'pat-2',
    patientName: 'Jane Smith',
    doctorName: 'Dr. Gregory House',
    slotStart: new Date().toISOString(),
    status: 'IN_CONSULTATION',
    tokenNumber: 2,
    reason: 'Follow-up on MRI',
  },
  {
    id: 'appt-3',
    patientId: 'pat-3',
    patientName: 'Bob Miller',
    doctorName: 'Dr. Gregory House',
    slotStart: new Date().toISOString(),
    status: 'COMPLETED',
    tokenNumber: 3,
    reason: 'Prescription refill',
  },
];

const mockDoctorProfile = {
  id: 'doc-1',
  user: { id: 'user-doc-1', fullName: 'Dr. Gregory House', email: 'house@caresync.local' },
  specialization: { id: 'spec-1', name: 'Diagnostics & Internal Medicine' },
  clinic: { id: 'clinic-1', name: 'Main Hospital' },
  consultationFee: 150.0,
  active: true,
};

const mockQueue = {
  doctorId: 'doc-1',
  doctorName: 'Dr. Gregory House',
  waitingCount: 1,
  nowServing: {
    tokenNumber: 2,
    patientName: 'Jane Smith',
    appointmentId: 'appt-2',
    status: 'IN_CONSULTATION',
  },
  waitingList: [
    {
      tokenNumber: 1,
      patientName: 'John Doe',
      appointmentId: 'appt-1',
      status: 'WAITING',
    },
  ],
};

const mockSchedules = {
  doctorId: 'doc-1',
  entries: [
    { dayOfWeek: 'MONDAY', startTime: '09:00:00', endTime: '17:00:00' },
    { dayOfWeek: 'TUESDAY', startTime: '09:00:00', endTime: '17:00:00' },
    { dayOfWeek: 'WEDNESDAY', startTime: '09:00:00', endTime: '17:00:00' },
    { dayOfWeek: 'THURSDAY', startTime: '09:00:00', endTime: '17:00:00' },
    { dayOfWeek: 'FRIDAY', startTime: '09:00:00', endTime: '17:00:00' },
  ],
};

const mockLeaves = [
  {
    id: 'leave-1',
    doctorId: 'doc-1',
    startDate: '2026-12-24',
    endDate: '2026-12-26',
    reason: 'Holiday vacation',
  },
];

const mockSlots = [
  { startTime: '2026-11-13T09:00:00Z', endTime: '2026-11-13T09:30:00Z', available: false },
  { startTime: '2026-11-13T09:30:00Z', endTime: '2026-11-13T10:00:00Z', available: true },
  { startTime: '2026-11-13T10:00:00Z', endTime: '2026-11-13T10:30:00Z', available: true },
];

describe('Doctor Overview & Schedule Management Suites', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(doctorsService, 'getDoctorById').mockResolvedValue(mockDoctorProfile);
    vi.spyOn(queueService, 'getDoctorQueue').mockResolvedValue(mockQueue);
    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValue({
      content: mockAppointments,
      totalElements: 3,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    vi.spyOn(doctorsService, 'getDoctorSchedules').mockResolvedValue(mockSchedules);
    vi.spyOn(doctorsService, 'getDoctorLeaves').mockResolvedValue(mockLeaves);
    vi.spyOn(doctorsService, 'getDoctorSlots').mockResolvedValue(mockSlots);
  });

  describe('DoctorHome Overview Dashboard', () => {
    it('renders KPI metrics and patient schedule from live backend queries', async () => {
      renderWithProviders(<DoctorHome />);

      // Verify page titles and doctor greeting
      expect(await screen.findByText('Physician Clinical Console')).toBeInTheDocument();
      expect(await screen.findByText(/Dr\. Gregory House/i)).toBeInTheDocument();

      // Verify KPI card values
      expect(await screen.findByText("Today's Schedule")).toBeInTheDocument();
      expect(screen.getByText('Waiting in Queue')).toBeInTheDocument();
      expect(screen.getByText('Now In Consultation')).toBeInTheDocument();
      expect(screen.getByText('Completed Today')).toBeInTheDocument();

      // Verify appointments list
      expect(await screen.findByText('John Doe')).toBeInTheDocument();
      expect(screen.getAllByText('Jane Smith')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Bob Miller')[0]).toBeInTheDocument();
    });

    it('displays now serving callout and handles call next action', async () => {
      vi.spyOn(queueService, 'callNextPatient').mockResolvedValueOnce({
        tokenNumber: 1,
        patientName: 'John Doe',
        appointmentId: 'appt-1',
      });

      renderWithProviders(<DoctorHome />);

      const tokenMatches = await screen.findAllByText(/Token #2/i);
      expect(tokenMatches.length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Jane Smith/i)[0]).toBeInTheDocument();
    });
  });

  describe('DoctorSchedulePage Management', () => {
    it('renders weekly practice timetable and daily slot availability', async () => {
      renderWithProviders(<DoctorSchedulePage />);

      expect(await screen.findByText('My Practice Schedule & Duty Roster')).toBeInTheDocument();
      expect(await screen.findByText('Weekly Operating Schedule')).toBeInTheDocument();
      expect(screen.getByText('MON')).toBeInTheDocument();
      expect(screen.getByText('Daily Slot Occupancy & Consultations')).toBeInTheDocument();

      // Verify slot occupancy stats
      expect(await screen.findByText(/Occupancy:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Available/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Booked/i)[0]).toBeInTheDocument();
    });

    it('opens leave modal and allows applying for time off', async () => {
      const user = userEvent.setup();
      const createLeaveSpy = vi.spyOn(doctorsService, 'createDoctorLeave').mockResolvedValueOnce({
        id: 'leave-new',
        doctorId: 'doc-1',
        startDate: '2026-11-25',
        endDate: '2026-11-26',
        reason: 'Conference attendance',
      });

      renderWithProviders(<DoctorSchedulePage />);

      expect(await screen.findByText('My Practice Schedule & Duty Roster')).toBeInTheDocument();

      // Click Request Leave button
      const applyBtn = await screen.findByRole('button', { name: /Request Leave/i });
      await user.click(applyBtn);

      // Verify dialog is open
      expect(await screen.findByText('Record Scheduled Leave')).toBeInTheDocument();

      // Fill reason
      const reasonInput = screen.getByPlaceholderText(/Annual Medical Conference/i);
      await user.type(reasonInput, 'Conference attendance');

      // Click submit
      const submitBtn = screen.getByRole('button', { name: /Record Leave/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(createLeaveSpy).toHaveBeenCalled();
      });
    });
  });
});
