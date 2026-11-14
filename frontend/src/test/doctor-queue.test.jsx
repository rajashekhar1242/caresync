import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { DoctorQueuePage } from '@/features/doctor/doctor-queue-page';
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

const mockQueueState = {
  doctorId: 'doc-1',
  doctorName: 'Dr. Gregory House',
  waitingCount: 2,
  nowServing: {
    tokenNumber: 1,
    patientName: 'Alice Green',
    appointmentId: 'app-serving-1',
    status: 'IN_CONSULTATION',
  },
  next: [
    {
      tokenNumber: 2,
      patientName: 'Charlie Brown',
      appointmentId: 'app-wait-2',
      status: 'WAITING',
    },
    {
      tokenNumber: 3,
      patientName: 'David Lee',
      appointmentId: 'app-wait-3',
      status: 'WAITING',
    },
  ],
};

describe('Doctor Patient Queue Suites', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(queueService, 'getDoctorQueue').mockResolvedValue(mockQueueState);
  });

  it('renders queue room with now serving hero card and waiting roster', async () => {
    renderWithProviders(<DoctorQueuePage />);

    expect(await screen.findByText('Alice Green')).toBeInTheDocument();
    expect(screen.getByText('Live Waiting Room Queue')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();

    // Verify waiting roster
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(screen.getByText('David Lee')).toBeInTheDocument();
  });

  it('handles calling the next patient from queue when room is available', async () => {
    const user = userEvent.setup();
    vi.spyOn(queueService, 'getDoctorQueue').mockResolvedValue({
      ...mockQueueState,
      nowServing: null,
      waitingCount: 2,
    });
    const callNextSpy = vi.spyOn(queueService, 'callNext').mockResolvedValueOnce({
      tokenNumber: 2,
      patientName: 'Charlie Brown',
      appointmentId: 'app-wait-2',
    });

    renderWithProviders(<DoctorQueuePage />);

    // Wait for dynamic waiting patient to be rendered
    expect(await screen.findByText('Charlie Brown')).toBeInTheDocument();

    const callNextBtn = screen.getByRole('button', { name: /Call Next Patient/i });
    expect(callNextBtn).not.toBeDisabled();
    await user.click(callNextBtn);

    await waitFor(() => {
      expect(callNextSpy).toHaveBeenCalledWith('doc-1');
    });
  });
});
