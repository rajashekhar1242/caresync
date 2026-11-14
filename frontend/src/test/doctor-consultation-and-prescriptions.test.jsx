import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { DoctorConsultationsPage } from '@/features/doctor/doctor-consultations-page';
import { DoctorHistoryPage } from '@/features/doctor/doctor-history-page';
import { appointmentsService } from '@/services/appointments.service';
import { consultationsService } from '@/services/consultations.service';
import { prescriptionsService } from '@/services/prescriptions.service';
import { medicinesService } from '@/services/medicines.service';
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

const mockActiveAppointment = {
  id: 'app-active-1',
  patientId: 'pat-1',
  patientName: 'Lisa Cuddy',
  doctorName: 'Dr. Gregory House',
  slotStart: '2026-11-13T10:00:00Z',
  status: 'IN_CONSULTATION',
  tokenNumber: 5,
  reason: 'Acute respiratory distress',
};

const mockPatientRecord = {
  id: 'pat-1',
  fullName: 'Lisa Cuddy',
  gender: 'FEMALE',
  dateOfBirth: '1978-06-15',
  allergies: ['Penicillin'],
};

const mockConsultation = {
  id: 'cons-1',
  appointmentId: 'app-active-1',
  patientId: 'pat-1',
  patientName: 'Lisa Cuddy',
  doctorId: 'doc-1',
  doctorName: 'Dr. Gregory House',
  vitals: { bloodPressure: '125/82', pulse: 76, temperature: 37.1, weightKg: 62, spo2: 99 },
  symptoms: 'Persistent dry cough and shortness of breath',
  diagnosis: 'Acute Bronchitis',
  notes: 'Prescribed bronchodilator. Rest for 3 days.',
  followUpDate: '2026-11-20',
};

const mockMedicines = [
  { id: 'med-10', name: 'Albuterol Sulfate Inhaler 90mcg' },
  { id: 'med-20', name: 'Amoxicillin 500mg' },
];

describe('Doctor Consultation Workspace & History Suites', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValue({
      content: [mockActiveAppointment],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    vi.spyOn(patientsService, 'getPatientById').mockResolvedValue(mockPatientRecord);
    vi.spyOn(consultationsService, 'getAppointmentConsultation').mockResolvedValue(mockConsultation);
    vi.spyOn(consultationsService, 'getConsultationByAppointment').mockResolvedValue(mockConsultation);
    vi.spyOn(prescriptionsService, 'getPatientPrescriptions').mockResolvedValue({
      content: [],
      totalElements: 0,
    });
    vi.spyOn(medicinesService, 'searchMedicines').mockResolvedValue(mockMedicines);
  });

  describe('DoctorConsultationsPage Workspace', () => {
    it('renders active consultation workspace with patient banner and vitals inputs', async () => {
      renderWithProviders(<DoctorConsultationsPage />);

      const cuddyMatches = await screen.findAllByText(/Lisa Cuddy/i);
      expect(cuddyMatches.length).toBeGreaterThan(0);
      const inConsultationMatches = await screen.findAllByText(/IN CONSULTATION/i);
      expect(inConsultationMatches.length).toBeGreaterThan(0);
      expect(await screen.findByText(/Patient Vitals/i)).toBeInTheDocument();
      expect(screen.getByText(/Primary Diagnosis/i)).toBeInTheDocument();
    });

    it('validates mandatory clinical diagnosis before completing encounter', async () => {
      const user = userEvent.setup();
      // Mock empty consultation
      vi.spyOn(consultationsService, 'getAppointmentConsultation').mockResolvedValueOnce({
        id: null,
        diagnosis: '',
        symptoms: '',
        notes: '',
      });
      vi.spyOn(consultationsService, 'getConsultationByAppointment').mockResolvedValueOnce({
        id: null,
        diagnosis: '',
        symptoms: '',
        notes: '',
      });

      renderWithProviders(<DoctorConsultationsPage />);

      const cuddyMatches = await screen.findAllByText(/Lisa Cuddy/i);
      expect(cuddyMatches.length).toBeGreaterThan(0);

      // Find Finalize & Complete button
      const completeBtn = screen.getByRole('button', { name: /Finalize & Complete/i });
      await user.click(completeBtn);

      // Should show mandatory diagnosis warning
      expect(await screen.findByText(/Clinical diagnosis is mandatory/i)).toBeInTheDocument();
    });

    it('saves clinical documentation and updates encounter status', async () => {
      const user = userEvent.setup();
      const updateConsultationSpy = vi
        .spyOn(consultationsService, 'updateConsultation')
        .mockResolvedValueOnce({
          ...mockConsultation,
          diagnosis: 'Acute Viral Bronchitis',
        });
      const updateStatusSpy = vi
        .spyOn(appointmentsService, 'updateAppointmentStatus')
        .mockResolvedValueOnce({
          ...mockActiveAppointment,
          status: 'COMPLETED',
        });

      renderWithProviders(<DoctorConsultationsPage />);

      const cuddyMatches = await screen.findAllByText(/Lisa Cuddy/i);
      expect(cuddyMatches.length).toBeGreaterThan(0);

      // Wait for consultation record to load into inputs
      await waitFor(() => {
        expect(screen.getByDisplayValue('Acute Bronchitis')).toBeInTheDocument();
      });

      // Find and click Finalize & Complete button
      const completeBtn = screen.getByRole('button', { name: /Finalize & Complete/i });
      await user.click(completeBtn);

      await waitFor(() => {
        expect(updateConsultationSpy).toHaveBeenCalled();
        expect(updateStatusSpy).toHaveBeenCalledWith(
          'app-active-1',
          'COMPLETED',
          undefined
        );
      });
    });
  });

  describe('DoctorHistoryPage', () => {
    const mockCompletedAppt = {
      id: 'app-comp-1',
      patientId: 'pat-1',
      patientName: 'Lisa Cuddy',
      doctorName: 'Dr. Gregory House',
      slotStart: '2026-11-13T09:00:00Z',
      status: 'COMPLETED',
      reason: 'Routine checkup',
    };

    beforeEach(() => {
      vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValue({
        content: [mockCompletedAppt],
        totalElements: 1,
        totalPages: 1,
        number: 0,
        size: 20,
      });
    });

    it('renders completed consultation history list with search bar', async () => {
      renderWithProviders(<DoctorHistoryPage />);

      expect(await screen.findByText('Lisa Cuddy')).toBeInTheDocument();
      expect(screen.getByText('Consultation History')).toBeInTheDocument();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });

    it('opens encounter record modal upon clicking View Encounter', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DoctorHistoryPage />);

      expect(await screen.findByText('Lisa Cuddy')).toBeInTheDocument();

      const viewBtn = screen.getByRole('button', { name: /View Encounter/i });
      await user.click(viewBtn);

      expect(await screen.findByText('Encounter Record')).toBeInTheDocument();
      expect(await screen.findByText('Acute Bronchitis')).toBeInTheDocument();
    });
  });
});
