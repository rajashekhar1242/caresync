import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminHome } from '@/features/admin/admin-home';
import * as AuthContextModule from '@/app/providers/auth.context';
import * as ReportsHookModule from '@/hooks/use-reports';
import * as DoctorsHookModule from '@/hooks/use-doctors';
import * as PatientsHookModule from '@/hooks/use-patients';
import * as AppointmentsHookModule from '@/hooks/use-appointments';
import * as DepartmentsHookModule from '@/hooks/use-departments';
import * as AuditHookModule from '@/hooks/use-audit';
import { getClinicTodayDateString } from '@/lib/utils';

// Mock Recharts ResponsiveContainer to avoid 0x0 size in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  };
});

describe('AdminHome Overview Dashboard', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-1', fullName: 'Dr. Administrator', role: 'ADMIN' },
      role: 'ADMIN',
      isAuthenticated: true,
    });
  });

  it('renders all KPI cards with actual backend API data', () => {
    vi.spyOn(ReportsHookModule, 'useDashboardSummary').mockReturnValue({
      data: {
        activeDoctors: 8,
        appointmentsToday: { total: 24, booked: 10, checkedIn: 5, inConsultation: 2, completed: 7, cancelled: 0, noShow: 0 },
        waitingNow: 5,
        currency: 'INR',
        collectedThisMonth: '85000.00',
        collectedToday: '4500.00',
      },
      isLoading: false,
      isError: false,
    });

    vi.spyOn(DoctorsHookModule, 'useDoctors').mockReturnValue({
      data: { totalElements: 12 },
      isLoading: false,
      isError: false,
    });

    vi.spyOn(PatientsHookModule, 'usePatients').mockReturnValue({
      data: { totalElements: 142 },
      isLoading: false,
      isError: false,
    });

    vi.spyOn(AppointmentsHookModule, 'useAppointments').mockReturnValue({
      data: { totalElements: 310, content: [] },
      isLoading: false,
      isError: false,
    });

    vi.spyOn(DepartmentsHookModule, 'useDepartments').mockReturnValue({
      data: [{ id: '1', name: 'Cardiology' }, { id: '2', name: 'Neurology' }],
      isLoading: false,
      isError: false,
    });

    vi.spyOn(ReportsHookModule, 'useRevenueReport').mockReturnValue({
      data: { buckets: [] },
      isLoading: false,
      isError: false,
    });

    vi.spyOn(ReportsHookModule, 'useAppointmentsByDepartment').mockReturnValue({
      data: { departments: [] },
      isLoading: false,
      isError: false,
    });

    vi.spyOn(AuditHookModule, 'useAuditLogs').mockReturnValue({
      data: { content: [] },
      isLoading: false,
      isError: false,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminHome />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Assert KPI Card Values
    expect(screen.getByText('12')).toBeInTheDocument(); // Total Doctors
    expect(screen.getByText('142')).toBeInTheDocument(); // Total Patients
    expect(screen.getByText('310')).toBeInTheDocument(); // Total Bookings
    expect(screen.getByText(/INR 85000.00/)).toBeInTheDocument(); // Monthly Revenue
    expect(screen.getByText(/8 Active on duty/)).toBeInTheDocument();

    // Verify departments and today's schedule within their cards
    expect(screen.getAllByText('Departments').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Today's Schedule")).toBeInTheDocument();
  });

  it('renders loading skeletons while fetching API statistics', () => {
    vi.spyOn(ReportsHookModule, 'useDashboardSummary').mockReturnValue({ isLoading: true });
    vi.spyOn(DoctorsHookModule, 'useDoctors').mockReturnValue({ isLoading: true });
    vi.spyOn(PatientsHookModule, 'usePatients').mockReturnValue({ isLoading: true });
    vi.spyOn(AppointmentsHookModule, 'useAppointments').mockReturnValue({ isLoading: true });
    vi.spyOn(DepartmentsHookModule, 'useDepartments').mockReturnValue({ isLoading: true });
    vi.spyOn(ReportsHookModule, 'useRevenueReport').mockReturnValue({ isLoading: true });
    vi.spyOn(ReportsHookModule, 'useAppointmentsByDepartment').mockReturnValue({ isLoading: true });
    vi.spyOn(AuditHookModule, 'useAuditLogs').mockReturnValue({ isLoading: true });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminHome />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Header should still render
    expect(screen.getByText(/Hospital Administration Control Center/i)).toBeInTheDocument();
    // Multiple skeletons should be in document
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays N/A error state when API statistics fail to load', () => {
    vi.spyOn(ReportsHookModule, 'useDashboardSummary').mockReturnValue({ isError: true });
    vi.spyOn(DoctorsHookModule, 'useDoctors').mockReturnValue({ isError: true });
    vi.spyOn(PatientsHookModule, 'usePatients').mockReturnValue({ isError: true });
    vi.spyOn(AppointmentsHookModule, 'useAppointments').mockReturnValue({ isError: true });
    vi.spyOn(DepartmentsHookModule, 'useDepartments').mockReturnValue({ isError: true });
    vi.spyOn(ReportsHookModule, 'useRevenueReport').mockReturnValue({ isError: true });
    vi.spyOn(ReportsHookModule, 'useAppointmentsByDepartment').mockReturnValue({ isError: true });
    vi.spyOn(AuditHookModule, 'useAuditLogs').mockReturnValue({ isError: true });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminHome />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const naElements = screen.getAllByText('N/A');
    expect(naElements.length).toBeGreaterThanOrEqual(4);
  });

  it('renders dashboard KPI cards as links with correct target routes, dates, and status parameters', () => {
    vi.spyOn(ReportsHookModule, 'useDashboardSummary').mockReturnValue({
      data: {
        today: '2026-11-15',
        activeDoctors: 8,
        appointmentsToday: { total: 24, completed: 7, booked: 10, checkedIn: 5, inConsultation: 2 },
        waitingNow: 5,
        currency: 'USD',
        collectedThisMonth: '10000.00',
        collectedToday: '500.00',
      },
      isLoading: false,
      isError: false,
    });
    vi.spyOn(DoctorsHookModule, 'useDoctors').mockReturnValue({ data: { totalElements: 12 }, isLoading: false });
    vi.spyOn(PatientsHookModule, 'usePatients').mockReturnValue({ data: { totalElements: 142 }, isLoading: false });
    vi.spyOn(AppointmentsHookModule, 'useAppointments').mockReturnValue({ data: { totalElements: 310, content: [] }, isLoading: false });
    vi.spyOn(DepartmentsHookModule, 'useDepartments').mockReturnValue({ data: [], isLoading: false });
    vi.spyOn(ReportsHookModule, 'useRevenueReport').mockReturnValue({ data: { buckets: [] }, isLoading: false });
    vi.spyOn(ReportsHookModule, 'useAppointmentsByDepartment').mockReturnValue({ data: { departments: [] }, isLoading: false });
    vi.spyOn(AuditHookModule, 'useAuditLogs').mockReturnValue({ data: { content: [] }, isLoading: false });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminHome />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Total Patients link
    const patientsLink = screen.getByRole('link', { name: /Total Patients/i });
    expect(patientsLink).toHaveAttribute('href', '/admin/patients');

    // Total Doctors link
    const doctorsLink = screen.getByRole('link', { name: /Total Doctors/i });
    expect(doctorsLink).toHaveAttribute('href', '/admin/doctors');

    // Total Bookings link
    const totalBookingsLink = screen.getByRole('link', { name: /Total Bookings/i });
    expect(totalBookingsLink).toHaveAttribute('href', '/admin/appointments');

    // Today's Schedule link -> fromDate & toDate equal to backend today (2026-11-15)
    const todayScheduleLink = screen.getByRole('link', { name: /Today's Schedule/i });
    expect(todayScheduleLink).toHaveAttribute(
      'href',
      '/admin/appointments?fromDate=2026-11-15&toDate=2026-11-15'
    );

    // Completed Appointments link -> status=COMPLETED with fromDate & toDate
    const completedLink = screen.getByRole('link', { name: /Completed/i });
    expect(completedLink).toHaveAttribute(
      'href',
      '/admin/appointments?status=COMPLETED&fromDate=2026-11-15&toDate=2026-11-15'
    );

    // Pending Queue link -> composite active statuses (BOOKED,CHECKED_IN,IN_CONSULTATION)
    const pendingQueueLink = screen.getByRole('link', { name: /Pending Queue/i });
    expect(pendingQueueLink).toHaveAttribute(
      'href',
      '/admin/appointments?status=BOOKED,CHECKED_IN,IN_CONSULTATION&fromDate=2026-11-15&toDate=2026-11-15'
    );
  });

  it('falls back to getClinicTodayDateString() for KPI links when backend today is omitted', () => {
    vi.spyOn(ReportsHookModule, 'useDashboardSummary').mockReturnValue({
      data: {
        activeDoctors: 8,
        appointmentsToday: { total: 24, completed: 7 },
      },
      isLoading: false,
    });
    vi.spyOn(DoctorsHookModule, 'useDoctors').mockReturnValue({ data: { totalElements: 12 }, isLoading: false });
    vi.spyOn(PatientsHookModule, 'usePatients').mockReturnValue({ data: { totalElements: 142 }, isLoading: false });
    vi.spyOn(AppointmentsHookModule, 'useAppointments').mockReturnValue({ data: { totalElements: 310, content: [] }, isLoading: false });
    vi.spyOn(DepartmentsHookModule, 'useDepartments').mockReturnValue({ data: [], isLoading: false });
    vi.spyOn(ReportsHookModule, 'useRevenueReport').mockReturnValue({ data: { buckets: [] }, isLoading: false });
    vi.spyOn(ReportsHookModule, 'useAppointmentsByDepartment').mockReturnValue({ data: { departments: [] }, isLoading: false });
    vi.spyOn(AuditHookModule, 'useAuditLogs').mockReturnValue({ data: { content: [] }, isLoading: false });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminHome />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const clinicToday = getClinicTodayDateString();
    const todayScheduleLink = screen.getByRole('link', { name: /Today's Schedule/i });
    expect(todayScheduleLink).toHaveAttribute(
      'href',
      `/admin/appointments?fromDate=${clinicToday}&toDate=${clinicToday}`
    );
  });
});
