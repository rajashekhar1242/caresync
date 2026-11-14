import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { PatientsPage } from '@/features/receptionist/patients-page';
import { RegisterPatientPage } from '@/features/receptionist/register-patient-page';
import { patientsService } from '@/services/patients.service';
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

const mockPatients = [
  {
    id: 'pat-1',
    fullName: 'Ananya Roy',
    phone: '+919876543210',
    dateOfBirth: '1992-04-10',
    gender: 'FEMALE',
  },
  {
    id: 'pat-2',
    fullName: 'Vikram Mehta',
    phone: '+919876543211',
    dateOfBirth: '1988-11-25',
    gender: 'MALE',
  },
];

const mockPatientDetail = {
  id: 'pat-1',
  fullName: 'Ananya Roy',
  phone: '+919876543210',
  email: 'ananya@example.com',
  dateOfBirth: '1992-04-10',
  gender: 'FEMALE',
  address: '12 Hospital Lane, Bangalore',
  allergies: ['Penicillin', 'Dust'],
  createdAt: '2026-11-13T09:00:00Z',
};

describe('Receptionist Patient Management & Registration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders patient directory list with names, phones, and genders', async () => {
    vi.spyOn(patientsService, 'getPatients').mockResolvedValueOnce({
      content: mockPatients,
      totalElements: 2,
      totalPages: 1,
    });

    renderWithProviders(<PatientsPage />);

    expect(await screen.findByText('Ananya Roy')).toBeInTheDocument();
    expect(screen.getByText('Vikram Mehta')).toBeInTheDocument();
    expect(screen.getByText('+919876543210')).toBeInTheDocument();
    expect(screen.getByText('FEMALE')).toBeInTheDocument();
  });

  it('opens patient detail modal and displays demographics and allergies', async () => {
    vi.spyOn(patientsService, 'getPatients').mockResolvedValueOnce({
      content: mockPatients,
      totalElements: 2,
      totalPages: 1,
    });
    vi.spyOn(patientsService, 'getPatientById').mockResolvedValueOnce(mockPatientDetail);

    const user = userEvent.setup();
    renderWithProviders(<PatientsPage />);

    expect(await screen.findByText('Ananya Roy')).toBeInTheDocument();
    const viewButtons = screen.getAllByRole('button', { name: /view/i });
    await user.click(viewButtons[0]);

    expect(await screen.findByText('Patient Profile Details')).toBeInTheDocument();
    expect(screen.getByText('12 Hospital Lane, Bangalore')).toBeInTheDocument();
    expect(screen.getByText('Penicillin')).toBeInTheDocument();
    expect(screen.getByText('Dust')).toBeInTheDocument();
    expect(screen.getByText(/Audited Access/i)).toBeInTheDocument();
    // Confirms no fabricated emergency contact field
    expect(screen.queryByText(/Emergency Contact/i)).not.toBeInTheDocument();
  });

  it('validates patient intake form and rejects short full name', async () => {
    renderWithProviders(<RegisterPatientPage />);

    const user = userEvent.setup();
    const submitBtn = screen.getByRole('button', { name: /register patient/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/Full name must be at least 2 characters/i)).toBeInTheDocument();
  });

  it('successfully registers patient and presents confirmation with patient UUID', async () => {
    const createdPatient = {
      id: '10000000-0000-0000-0000-000000000099',
      fullName: 'Rahul Dravid',
      phone: '+919876543299',
      gender: 'MALE',
      dateOfBirth: '1973-01-11',
      allergies: ['Shellfish'],
    };

    vi.spyOn(patientsService, 'createPatient').mockResolvedValueOnce(createdPatient);

    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);

    const nameInput = screen.getByPlaceholderText(/e\.g\. Anand Sharma/i);
    await user.type(nameInput, 'Rahul Dravid');

    const phoneInput = screen.getByPlaceholderText(/e\.g\. \+919876543210/i);
    await user.type(phoneInput, '+919876543299');

    const submitBtn = screen.getByRole('button', { name: /register patient/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/Patient Successfully Registered/i)).toBeInTheDocument();
    expect(screen.getByText('10000000-0000-0000-0000-000000000099')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /book appointment now/i })).toBeInTheDocument();
  });
});
