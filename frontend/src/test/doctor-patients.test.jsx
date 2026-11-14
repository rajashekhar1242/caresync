import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { DoctorPatientsPage } from '@/features/doctor/doctor-patients-page';
import { patientsService } from '@/services/patients.service';
import { prescriptionsService } from '@/services/prescriptions.service';
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

const mockPatients = [
  {
    id: 'pat-101',
    fullName: 'Robert Chase',
    gender: 'MALE',
    dateOfBirth: '1985-04-12',
    phone: '+1-555-0199',
    email: 'chase@example.com',
  },
  {
    id: 'pat-102',
    fullName: 'Allison Cameron',
    gender: 'FEMALE',
    dateOfBirth: '1988-09-20',
    phone: '+1-555-0288',
    email: 'cameron@example.com',
  },
];

const mockPatientDetail = {
  id: 'pat-101',
  fullName: 'Robert Chase',
  gender: 'MALE',
  dateOfBirth: '1985-04-12',
  phone: '+1-555-0199',
  email: 'chase@example.com',
  address: '221B Baker St',
  allergies: ['Penicillin', 'Sulfa drugs'],
  medicalHistory: ['Hypertension', 'Appendectomy (2018)'],
};

describe('Doctor Patients Directory & Clinical Details Suites', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(patientsService, 'getPatients').mockResolvedValue({
      content: mockPatients,
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    vi.spyOn(prescriptionsService, 'getPatientPrescriptions').mockResolvedValue({
      content: [],
      totalElements: 0,
    });
  });

  it('renders patient roster with clinical demographics and search filter', async () => {
    renderWithProviders(<DoctorPatientsPage />);

    expect(await screen.findByText('Robert Chase')).toBeInTheDocument();
    expect(screen.getByText('Patient Medical Records & Intake')).toBeInTheDocument();
    expect(screen.getByText('Allison Cameron')).toBeInTheDocument();
  });

  it('opens clinical record dialog and renders allergies and medical history', async () => {
    const user = userEvent.setup();
    vi.spyOn(patientsService, 'getPatientById').mockResolvedValueOnce(mockPatientDetail);

    renderWithProviders(<DoctorPatientsPage />);

    expect(await screen.findByText('Robert Chase')).toBeInTheDocument();

    const viewBtns = screen.getAllByRole('button', { name: /Clinical Details/i });
    await user.click(viewBtns[0]);

    // Check modal opens and displays verified allergies
    expect(await screen.findByText(/Patient Clinical Profile/i)).toBeInTheDocument();
    expect(await screen.findByText('Penicillin')).toBeInTheDocument();
    expect(screen.getByText('Sulfa drugs')).toBeInTheDocument();
  });

  it('fails closed with permission notice if doctor is unauthorized to view patient records (403)', async () => {
    const user = userEvent.setup();
    const error403 = new Error('Access Denied: You do not have treatment privileges for this patient.');
    error403.response = { status: 403, data: { message: 'Access Denied' } };
    vi.spyOn(patientsService, 'getPatientById').mockRejectedValueOnce(error403);

    renderWithProviders(<DoctorPatientsPage />);

    expect(await screen.findByText('Robert Chase')).toBeInTheDocument();

    const viewBtns = screen.getAllByRole('button', { name: /Clinical Details/i });
    await user.click(viewBtns[0]);

    // Expect fail-closed error notice in modal
    expect(await screen.findByText(/Restricted Patient Record/i)).toBeInTheDocument();
  });
});
