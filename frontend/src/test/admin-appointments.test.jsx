import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppointmentsPage } from '@/features/admin/appointments-page';
import * as AppointmentsHookModule from '@/hooks/use-appointments';
import * as DoctorsHookModule from '@/hooks/use-doctors';
import * as ToastHookModule from '@/hooks/use-toast';
import {
  getStartOfDayUtc,
  getExclusiveEndOfDayUtc,
  getNextDateStringUtc,
  CLINIC_TIMEZONE,
} from '@/lib/utils';

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

  it('initializes appointment filters from URL search parameters and queries backend with converted timezone ISO timestamps', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            '/admin/appointments?status=COMPLETED&doctorId=doc-1&patientId=pat-123&fromDate=2026-11-15&toDate=2026-11-15',
          ]}
        >
          <AppointmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Form inputs reflect URL parameters
    expect(screen.getByLabelText(/Filter by appointment status/i)).toHaveValue('COMPLETED');
    expect(screen.getByLabelText(/Filter by physician/i)).toHaveValue('doc-1');
    expect(screen.getByLabelText(/Filter from date/i)).toHaveValue('2026-11-15');
    expect(screen.getByLabelText(/Filter to date/i)).toHaveValue('2026-11-15');
    expect(screen.getByText(/Filtering by Patient ID:/i)).toBeInTheDocument();
    expect(screen.getByText('pat-123')).toBeInTheDocument();

    // Query parameters passed to backend hook:
    // Asia/Kolkata (+05:30) 2026-11-15 00:00:00 -> 2026-11-14T18:30:00.000Z
    // Asia/Kolkata (+05:30) 2026-11-16 00:00:00 -> 2026-11-15T18:30:00.000Z (exclusive end)
    expect(AppointmentsHookModule.useAppointments).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 0,
        size: 10,
        sort: 'slotStart,desc',
        status: 'COMPLETED',
        doctorId: 'doc-1',
        patientId: 'pat-123',
        from: '2026-11-14T18:30:00.000Z',
        to: '2026-11-15T18:30:00.000Z',
      })
    );
  });

  it('handles composite Pending Queue status filter (BOOKED,CHECKED_IN,IN_CONSULTATION)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            '/admin/appointments?status=BOOKED,CHECKED_IN,IN_CONSULTATION&fromDate=2026-11-15&toDate=2026-11-15',
          ]}
        >
          <AppointmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByLabelText(/Filter by appointment status/i)).toHaveValue(
      'BOOKED,CHECKED_IN,IN_CONSULTATION'
    );

    expect(AppointmentsHookModule.useAppointments).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'BOOKED,CHECKED_IN,IN_CONSULTATION',
        from: '2026-11-14T18:30:00.000Z',
        to: '2026-11-15T18:30:00.000Z',
      })
    );
  });

  it('clears filter states and resets query when Reset Filters button is clicked', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            '/admin/appointments?status=COMPLETED&doctorId=doc-1&fromDate=2026-11-15&toDate=2026-11-15',
          ]}
        >
          <AppointmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const resetBtn = screen.getByRole('button', { name: /Reset Filters/i });
    expect(resetBtn).not.toBeDisabled();
    fireEvent.click(resetBtn);

    // Filter controls cleared
    expect(screen.getByLabelText(/Filter by appointment status/i)).toHaveValue('');
    expect(screen.getByLabelText(/Filter by physician/i)).toHaveValue('');
    expect(screen.getByLabelText(/Filter from date/i)).toHaveValue('');
    expect(screen.getByLabelText(/Filter to date/i)).toHaveValue('');
    expect(resetBtn).toBeDisabled();

    // Query parameters reset to defaults
    expect(AppointmentsHookModule.useAppointments).toHaveBeenLastCalledWith({
      page: 0,
      size: 10,
      sort: 'slotStart,desc',
    });
  });

  it('synchronizes filter states with browser Back and Forward navigation', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/admin/appointments',
          element: <AppointmentsPage />,
        },
      ],
      {
        initialEntries: [
          '/admin/appointments',
          '/admin/appointments?status=COMPLETED&fromDate=2026-11-15&toDate=2026-11-15',
        ],
        initialIndex: 1,
      }
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    // Initial state at index 1: filtered
    expect(screen.getByLabelText(/Filter by appointment status/i)).toHaveValue('COMPLETED');
    expect(screen.getByLabelText(/Filter from date/i)).toHaveValue('2026-11-15');
    expect(screen.getByLabelText(/Filter to date/i)).toHaveValue('2026-11-15');

    // Simulate browser Back button to index 0: /admin/appointments
    await act(async () => {
      await router.navigate(-1);
    });

    expect(screen.getByLabelText(/Filter by appointment status/i)).toHaveValue('');
    expect(screen.getByLabelText(/Filter from date/i)).toHaveValue('');
    expect(screen.getByLabelText(/Filter to date/i)).toHaveValue('');

    // Simulate browser Forward button back to index 1: /admin/appointments?...
    await act(async () => {
      await router.navigate(1);
    });

    expect(screen.getByLabelText(/Filter by appointment status/i)).toHaveValue('COMPLETED');
    expect(screen.getByLabelText(/Filter from date/i)).toHaveValue('2026-11-15');
    expect(screen.getByLabelText(/Filter to date/i)).toHaveValue('2026-11-15');
  });
});

describe('Clinic Timezone and Calendar Boundaries', () => {
  it('advances calendar dates via pure UTC arithmetic across months, leap years, and year-ends', () => {
    expect(getNextDateStringUtc('2026-11-15')).toBe('2026-11-16');
    // Month transition in standard year (28-day Feb)
    expect(getNextDateStringUtc('2026-02-28')).toBe('2026-03-01');
    // Leap year transition (29-day Feb)
    expect(getNextDateStringUtc('2024-02-28')).toBe('2024-02-29');
    expect(getNextDateStringUtc('2024-02-29')).toBe('2024-03-01');
    // Year-end transition
    expect(getNextDateStringUtc('2026-12-31')).toBe('2027-01-01');
  });

  it('calculates exact ISO UTC boundaries for Asia/Kolkata calendar days', () => {
    const start = getStartOfDayUtc('2026-11-15', CLINIC_TIMEZONE);
    const end = getExclusiveEndOfDayUtc('2026-11-15', CLINIC_TIMEZONE);

    // Asia/Kolkata is UTC+05:30. Local midnight is UTC 18:30:00 the prior evening.
    expect(start).toBe('2026-11-14T18:30:00.000Z');
    // Next day midnight is UTC 18:30:00 on the day.
    expect(end).toBe('2026-11-15T18:30:00.000Z');

    // Day span must be exactly 24 hours (86,400,000 ms)
    const durationMs = new Date(end).getTime() - new Date(start).getTime();
    expect(durationMs).toBe(24 * 60 * 60 * 1000);
  });

  it('correctly includes midnight and end-of-day boundary instants while excluding adjacent days', () => {
    const startIso = getStartOfDayUtc('2026-11-15', CLINIC_TIMEZONE);
    const endIso = getExclusiveEndOfDayUtc('2026-11-15', CLINIC_TIMEZONE);
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();

    // 1. Midnight start in Asia/Kolkata: 2026-11-15 00:00:00.000+05:30
    const midnightKolkata = new Date('2026-11-15T00:00:00.000+05:30').getTime();
    expect(midnightKolkata).toBe(startMs);
    expect(midnightKolkata >= startMs && midnightKolkata < endMs).toBe(true);

    // 2. Final millisecond of the day in Asia/Kolkata: 2026-11-15 23:59:59.999+05:30
    const endOfDayKolkata = new Date('2026-11-15T23:59:59.999+05:30').getTime();
    expect(endOfDayKolkata >= startMs && endOfDayKolkata < endMs).toBe(true);
    expect(endMs - endOfDayKolkata).toBe(1); // Exactly 1 millisecond before exclusive end

    // 3. Next day midnight in Asia/Kolkata: 2026-11-16 00:00:00.000+05:30
    // Must be excluded by the exclusive < to condition
    const nextDayMidnightKolkata = new Date('2026-11-16T00:00:00.000+05:30').getTime();
    expect(nextDayMidnightKolkata >= endMs).toBe(true);
    expect(nextDayMidnightKolkata < endMs).toBe(false);

    // 4. Previous day last millisecond: 2026-11-14 23:59:59.999+05:30
    // Must be excluded by >= from condition
    const prevDayLateKolkata = new Date('2026-11-14T23:59:59.999+05:30').getTime();
    expect(prevDayLateKolkata < startMs).toBe(true);
  });

  it('supports configurable clinic timezones without hardcoding +05:30', () => {
    // US Eastern (UTC-5 in November standard time)
    const startNY = getStartOfDayUtc('2026-11-15', 'America/New_York');
    const endNY = getExclusiveEndOfDayUtc('2026-11-15', 'America/New_York');
    expect(startNY).toBe('2026-11-15T05:00:00.000Z');
    expect(endNY).toBe('2026-11-16T05:00:00.000Z');
    expect(new Date(endNY).getTime() - new Date(startNY).getTime()).toBe(24 * 60 * 60 * 1000);

    // UTC
    const startUtc = getStartOfDayUtc('2026-11-15', 'UTC');
    const endUtc = getExclusiveEndOfDayUtc('2026-11-15', 'UTC');
    expect(startUtc).toBe('2026-11-15T00:00:00.000Z');
    expect(endUtc).toBe('2026-11-16T00:00:00.000Z');
  });
});
