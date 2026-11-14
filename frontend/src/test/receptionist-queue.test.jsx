import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { QueuePage } from '@/features/receptionist/queue-page';
import { queueService } from '@/services/queue.service';
import { doctorsService } from '@/services/doctors.service';
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

const mockDoctors = [
  {
    id: 'doc-1',
    fullName: 'Dr. Sarah Jenkins',
    active: true,
    specialization: { id: 'spec-1', name: 'Cardiology' },
    clinic: { id: 'c-1', name: 'Main Clinic', timeZone: 'Asia/Kolkata' },
  },
];

const mockQueueState = {
  doctorId: 'doc-1',
  doctorName: 'Dr. Sarah Jenkins',
  clinicId: 'c-1',
  waitingCount: 2,
  lastTokenIssued: 3,
  nowServing: {
    tokenNumber: 1,
    appointmentId: 'appt-1',
    patientId: 'pat-1',
    patientName: 'Devika Nair',
    slotStart: '2026-11-13T09:00:00Z',
  },
  next: [
    {
      tokenNumber: 2,
      appointmentId: 'appt-2',
      patientId: 'pat-2',
      patientName: 'Sanjay Dutt',
      slotStart: '2026-11-13T09:15:00Z',
      checkedInAt: '2026-11-13T08:50:00Z',
    },
    {
      tokenNumber: 3,
      appointmentId: 'appt-3',
      patientId: 'pat-3',
      patientName: 'Kareena Kapoor',
      slotStart: '2026-11-13T09:30:00Z',
      checkedInAt: '2026-11-13T08:55:00Z',
    },
  ],
};

describe('Receptionist Live Queue Management', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(doctorsService, 'getDoctors').mockResolvedValue({
      content: mockDoctors,
      totalElements: 1,
      totalPages: 1,
    });
    vi.spyOn(doctorsService, 'getClinics').mockResolvedValue([
      { id: 'c-1', name: 'Main Clinic' },
    ]);
  });

  it('renders queue room with now serving token and upcoming waiting list', async () => {
    vi.spyOn(queueService, 'getDoctorQueue').mockResolvedValueOnce(mockQueueState);
    vi.spyOn(queueService, 'getQueueBoard').mockResolvedValueOnce({
      clinicId: 'c-1',
      doctors: [],
    });

    renderWithProviders(<QueuePage />);

    expect(await screen.findByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Devika Nair')).toBeInTheDocument();
    expect(screen.getByText('Sanjay Dutt')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Kareena Kapoor')).toBeInTheDocument();
    expect(screen.getAllByText('#3').length).toBeGreaterThan(0);
  });

  it('displays connection indicator and handles call next patient', async () => {
    vi.spyOn(queueService, 'getDoctorQueue').mockResolvedValueOnce(mockQueueState);
    vi.spyOn(queueService, 'getQueueBoard').mockResolvedValueOnce({
      clinicId: 'c-1',
      doctors: [],
    });
    const callNextSpy = vi.spyOn(queueService, 'callNext').mockResolvedValueOnce({
      doctorId: 'doc-1',
      nowServing: { tokenNumber: 2, patientName: 'Sanjay Dutt' },
      next: [],
      waitingCount: 0,
    });

    const user = userEvent.setup();
    renderWithProviders(<QueuePage />);

    expect(await screen.findByText('Devika Nair')).toBeInTheDocument();

    const callNextBtn = screen.getByRole('button', { name: /call next patient/i });
    await user.click(callNextBtn);

    expect(await screen.findByText('Call Next Patient into Consultation')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /call patient/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(callNextSpy).toHaveBeenCalledWith('doc-1');
    });
  });
});
