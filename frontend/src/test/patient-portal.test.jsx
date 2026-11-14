import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { PatientHome } from '@/features/patient/patient-home';
import { PatientProfilePage } from '@/features/patient/patient-profile-page';
import { PatientDoctorsPage } from '@/features/patient/patient-doctors-page';
import { PatientBookAppointmentPage } from '@/features/patient/patient-book-appointment-page';
import { PatientAppointmentsPage } from '@/features/patient/patient-appointments-page';
import { PatientPrescriptionsPage } from '@/features/patient/patient-prescriptions-page';
import { PatientMedicalHistoryPage } from '@/features/patient/patient-medical-history-page';
import { PatientBillingPage } from '@/features/patient/patient-billing-page';

import { appointmentsService } from '@/services/appointments.service';
import { doctorsService } from '@/services/doctors.service';
import { departmentsService } from '@/services/departments.service';
import { patientsService } from '@/services/patients.service';
import { prescriptionsService } from '@/services/prescriptions.service';
import { billingService } from '@/services/billing.service';
import { consultationsService } from '@/services/consultations.service';
import * as AuthContextModule from '@/app/providers/auth.context';

const mockPatientUser = {
  id: 'usr-pat-1',
  patientId: 'pat-uuid-1',
  fullName: 'Alice Walker',
  email: 'alice.walker@example.com',
  role: 'PATIENT',
};

const mockPatientProfile = {
  id: 'pat-uuid-1',
  fullName: 'Alice Walker',
  phone: '9876543210',
  email: 'alice.walker@example.com',
  dateOfBirth: '1990-05-12',
  gender: 'FEMALE',
  address: '123 Health Ave, Metro City',
  allergies: ['Penicillin', 'Peanuts'],
};

const mockDoctorList = [
  {
    id: 'doc-uuid-1',
    fullName: 'Robert Wilson',
    department: { id: 'dept-1', name: 'Cardiology' },
    specialization: { id: 'spec-1', name: 'Cardiologist' },
    consultationFee: 75.0,
    slotMinutes: 20,
    active: true,
    clinic: { name: 'Main Heart Pavilion', address: 'Wing B', timeZone: 'Asia/Kolkata' },
  },
];

const mockAppointments = [
  {
    id: 'appt-1',
    patientId: 'pat-uuid-1',
    patientName: 'Alice Walker',
    doctorId: 'doc-uuid-1',
    doctorName: 'Robert Wilson',
    slotStart: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    status: 'SCHEDULED',
    tokenNumber: 3,
    reason: 'Routine cardiac checkup',
  },
  {
    id: 'appt-2',
    patientId: 'pat-uuid-1',
    patientName: 'Alice Walker',
    doctorId: 'doc-uuid-1',
    doctorName: 'Robert Wilson',
    slotStart: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    status: 'COMPLETED',
    tokenNumber: 1,
    reason: 'Initial consultation',
  },
];

const mockPrescriptions = [
  {
    id: 'rx-uuid-1',
    patientId: 'pat-uuid-1',
    doctorName: 'Robert Wilson',
    createdAt: new Date().toISOString(),
    items: [
      {
        medicineName: 'Atorvastatin',
        dosage: '10mg',
        frequency: 'ONCE_DAILY',
        durationDays: 30,
        instructions: 'Take at bedtime with water',
      },
    ],
    notes: 'Maintain low-cholesterol diet',
  },
];

const mockInvoices = [
  {
    id: 'inv-uuid-1',
    invoiceNumber: 'INV-202611-0001',
    patientId: 'pat-uuid-1',
    status: 'PAID',
    totalAmount: 75.0,
    paidAmount: 75.0,
    balanceDue: 0.0,
    createdAt: new Date().toISOString(),
    lineItems: [{ description: 'Cardiology Consultation', amount: 75.0 }],
  },
];

function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: mockPatientUser,
    role: 'PATIENT',
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

describe('Patient Portal Functional Modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(patientsService, 'getPatientById').mockResolvedValue(mockPatientProfile);
    vi.spyOn(doctorsService, 'getDoctors').mockResolvedValue({
      content: mockDoctorList,
      totalElements: 1,
    });
    vi.spyOn(departmentsService, 'getDepartments').mockResolvedValue([
      { id: 'dept-1', name: 'Cardiology' },
    ]);
    vi.spyOn(doctorsService, 'getDoctorSlots').mockResolvedValue({
      date: '2026-11-14',
      slots: [
        {
          start: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          end: new Date(Date.now() + 24 * 3600 * 1000 + 1200000).toISOString(),
          available: true,
        },
      ],
    });
    vi.spyOn(appointmentsService, 'getAppointments').mockResolvedValue({
      content: mockAppointments,
      totalElements: 2,
    });
    vi.spyOn(prescriptionsService, 'getPatientPrescriptions').mockResolvedValue({
      content: mockPrescriptions,
      totalElements: 1,
    });
    vi.spyOn(billingService, 'getInvoices').mockResolvedValue({
      content: mockInvoices,
      totalElements: 1,
    });
    vi.spyOn(consultationsService, 'getAppointmentConsultation').mockResolvedValue({
      id: 'cons-1',
      diagnosis: 'Mild Essential Hypertension',
      symptoms: 'Mild fatigue on exertion',
      vitals: { systolicBp: 130, diastolicBp: 85, heartRate: 72 },
      notes: 'Continue low-sodium dietary regimen.',
    });
  });

  it('Patient Dashboard: renders welcome banner, KPI cards, and upcoming visit spotlight', async () => {
    renderWithProviders(<PatientHome />);

    await waitFor(() => {
      expect(screen.getByText(/Patient Health Console/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Next Scheduled Visit/i)).toBeInTheDocument();
    expect(screen.getByText(/Find Doctors/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Appointment Spotlight/i)).toBeInTheDocument();
  });

  it('Patient Profile: renders profile form with editable personal info and allergies badges', async () => {
    renderWithProviders(<PatientProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice Walker')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('9876543210')).toBeInTheDocument();
    expect(screen.getByDisplayValue('alice.walker@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Penicillin, Peanuts/i)).toBeInTheDocument();
    expect(screen.getByText(/Hospital Records Note/i)).toBeInTheDocument();
  });

  it('Find Doctors: renders doctor directory and filters', async () => {
    renderWithProviders(<PatientDoctorsPage />);

    await waitFor(() => {
      expect(screen.getByText('Robert Wilson')).toBeInTheDocument();
    });

    expect(screen.getByText(/Cardiologist/i)).toBeInTheDocument();
    expect(screen.getByText(/INR 75/i)).toBeInTheDocument();
    const bookBtns = screen.getAllByRole('button', { name: /Book/i });
    expect(bookBtns.length).toBeGreaterThan(0);
  });

  it('Book Appointment: renders booking form, doctor selector, and slot availability', async () => {
    renderWithProviders(<PatientBookAppointmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1: Choose Department & Physician/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Step 2: Choose Date & Time Slot/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 3: Reason for Consultation/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirm Appointment/i)).toBeInTheDocument();
  });

  it('My Appointments: lists scheduled and completed encounters with status badges', async () => {
    renderWithProviders(<PatientAppointmentsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Dr. Robert Wilson/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('button', { name: /^Upcoming$/i })).toBeInTheDocument();
    expect(screen.getByText(/All Visits/i)).toBeInTheDocument();
    expect(screen.getByText(/Routine cardiac checkup/i)).toBeInTheDocument();
  });

  it('My Prescriptions: renders electronic prescriptions and PDF download trigger', async () => {
    const downloadSpy = vi.spyOn(prescriptionsService, 'downloadPdf').mockResolvedValue(true);

    renderWithProviders(<PatientPrescriptionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Atorvastatin')).toBeInTheDocument();
    });

    expect(screen.getByText('10mg')).toBeInTheDocument();
    expect(screen.getByText(/Take at bedtime with water/i)).toBeInTheDocument();

    const downloadBtn = screen.getByRole('button', { name: /Download PDF/i });
    expect(downloadBtn).toBeInTheDocument();

    await userEvent.click(downloadBtn);
    expect(downloadSpy).toHaveBeenCalledWith('rx-uuid-1', expect.stringContaining('CareSync-Prescription'));
  });

  it('Medical History: renders allergies banner and past clinical consultation timeline', async () => {
    renderWithProviders(<PatientMedicalHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Penicillin')).toBeInTheDocument();
    });

    expect(screen.getByText('Peanuts')).toBeInTheDocument();
    expect(screen.getByText(/Past Clinical Consultations/i)).toBeInTheDocument();
  });

  it('Billing & Invoices: renders financial totals, payment counter policy, and invoices list', async () => {
    const downloadInvoiceSpy = vi.spyOn(billingService, 'downloadInvoicePdf').mockResolvedValue(true);

    renderWithProviders(<PatientBillingPage />);

    await waitFor(() => {
      expect(screen.getByText('INV-202611-0001')).toBeInTheDocument();
    });

    expect(screen.getByText(/Payment Policy & Counter Settlement/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Invoiced/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Settled/i)).toBeInTheDocument();

    const downloadBtn = screen.getByRole('button', { name: /Download PDF/i });
    expect(downloadBtn).toBeInTheDocument();

    await userEvent.click(downloadBtn);
    expect(downloadInvoiceSpy).toHaveBeenCalledWith('inv-uuid-1', 'INV-202611-0001');
  });
});
