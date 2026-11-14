import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DepartmentsPage } from '@/features/admin/departments-page';
import * as DepartmentsHookModule from '@/hooks/use-departments';
import * as ToastHookModule from '@/hooks/use-toast';

describe('DepartmentsPage Management', () => {
  let queryClient;
  const mockToast = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();

  const sampleDepartments = [
    { id: 'dept-1', name: 'Cardiology', description: 'Heart and vascular care' },
    { id: 'dept-2', name: 'Orthopedics', description: 'Musculoskeletal system' },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(ToastHookModule, 'useToast').mockReturnValue({ toast: mockToast });

    vi.spyOn(DepartmentsHookModule, 'useDepartments').mockReturnValue({
      data: sampleDepartments,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    vi.spyOn(DepartmentsHookModule, 'useCreateDepartment').mockReturnValue({
      mutateAsync: mockCreate,
      isPending: false,
    });

    vi.spyOn(DepartmentsHookModule, 'useUpdateDepartment').mockReturnValue({
      mutateAsync: mockUpdate,
      isPending: false,
    });
  });

  it('renders department listing with names and descriptions', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DepartmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.getByText('Heart and vascular care')).toBeInTheDocument();
    expect(screen.getByText('Orthopedics')).toBeInTheDocument();
    expect(screen.getByText(/department integrity guarantee/i)).toBeInTheDocument();
  });

  it('filters departments dynamically via search input', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DepartmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const searchInput = screen.getByLabelText(/search departments/i);
    fireEvent.change(searchInput, { target: { value: 'Cardio' } });

    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.queryByText('Orthopedics')).not.toBeInTheDocument();
  });

  it('opens create modal, validates required name, and rejects < 2 chars', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DepartmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const addBtn = screen.getByLabelText(/add new department/i);
    fireEvent.click(addBtn);

    expect(screen.getByText('Create New Department')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /create department/i });
    const nameInput = screen.getByPlaceholderText(/cardiology, orthopedics/i);

    // Type 1 char and submit
    fireEvent.change(nameInput, { target: { value: 'A' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/name must be at least 2 characters/i)).toBeInTheDocument();
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('submits valid department creation payload', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'dept-3', name: 'Pediatrics' });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DepartmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByLabelText(/add new department/i));

    const nameInput = screen.getByPlaceholderText(/cardiology, orthopedics/i);
    fireEvent.change(nameInput, { target: { value: 'Pediatrics' } });

    fireEvent.click(screen.getByRole('button', { name: /create department/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pediatrics' })
      );
    });
  });

  it('displays validation error when backend returns DEPARTMENT_NAME_EXISTS', async () => {
    const error = new Error('Conflict');
    error.response = { data: { code: 'DEPARTMENT_NAME_EXISTS', message: 'Department already exists' } };
    mockCreate.mockRejectedValueOnce(error);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DepartmentsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByLabelText(/add new department/i));
    fireEvent.change(screen.getByPlaceholderText(/cardiology, orthopedics/i), { target: { value: 'Cardiology' } });
    fireEvent.click(screen.getByRole('button', { name: /create department/i }));

    await waitFor(() => {
      expect(screen.getByText(/a department with this name already exists/i)).toBeInTheDocument();
    });
  });
});
