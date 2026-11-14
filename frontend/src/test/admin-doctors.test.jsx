import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorsPage } from '@/features/admin/doctors-page';
import * as DoctorsHookModule from '@/hooks/use-doctors';
import * as DepartmentsHookModule from '@/hooks/use-departments';
import * as ToastHookModule from '@/hooks/use-toast';

describe('DoctorsPage Management', () => {
  let queryClient;
  const mockToast = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();

  const sampleDoctors = [
    {
      id: 'doc-1',
      userId: 'user-doc-1',
      fullName: 'Dr. Gregory House',
      specializationId: 'spec-1',
      clinicId: 'clinic-1',
      departmentId: 'dept-1',
      consultationFee: '750.00',
      slotMinutes: 20,
      active: true,
    },
    {
      id: 'doc-2',
      userId: 'user-doc-2',
      fullName: 'Dr. James Wilson',
      specializationId: 'spec-2',
      clinicId: 'clinic-1',
      departmentId: 'dept-2',
      consultationFee: '500.00',
      slotMinutes: 15,
      active: false,
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(ToastHookModule, 'useToast').mockReturnValue({ toast: mockToast });

    vi.spyOn(DoctorsHookModule, 'useDoctors').mockReturnValue({
      data: {
        content: sampleDoctors,
        page: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    vi.spyOn(DoctorsHookModule, 'useSpecializations').mockReturnValue({
      data: [{ id: 'spec-1', name: 'Diagnostic Medicine' }, { id: 'spec-2', name: 'Oncology' }],
      isLoading: false,
    });

    vi.spyOn(DoctorsHookModule, 'useClinics').mockReturnValue({
      data: [{ id: 'clinic-1', name: 'Princeton-Plainsboro' }],
      isLoading: false,
    });

    vi.spyOn(DepartmentsHookModule, 'useDepartments').mockReturnValue({
      data: [{ id: 'dept-1', name: 'Diagnostics' }, { id: 'dept-2', name: 'Oncology' }],
      isLoading: false,
    });

    vi.spyOn(DoctorsHookModule, 'useCreateDoctor').mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    });

    vi.spyOn(DoctorsHookModule, 'useUpdateDoctor').mockReturnValue({
      mutateAsync: mockUpdate,
      isPending: false,
    });
  });

  it('renders doctors list with names, specialization, fee, and active status', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DoctorsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Dr. Gregory House')).toBeInTheDocument();
    expect(screen.getByText('Dr. James Wilson')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText(/₹750.00/)).toBeInTheDocument();
  });

  it('opens doctor details dialog upon clicking Details button', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DoctorsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const detailsButtons = screen.getAllByRole('button', { name: /view dr\./i });
    fireEvent.click(detailsButtons[0]);

    expect(screen.getByText('Physician Information')).toBeInTheDocument();
    expect(screen.getByText('Full clinical profile and assignment records.')).toBeInTheDocument();
  });

  it('opens provision doctor dialog with required form fields', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DoctorsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByLabelText(/add new doctor/i));

    expect(screen.getByText('Provision Physician Account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Dr. Jane Doe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('doctor@caresync.com')).toBeInTheDocument();
  });
});
