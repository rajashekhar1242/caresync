import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/services/api';
import { consultationsService } from '@/services/consultations.service';
import { prescriptionsService } from '@/services/prescriptions.service';
import { medicinesService } from '@/services/medicines.service';
import { doctorsService } from '@/services/doctors.service';

vi.mock('@/services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Doctor Domain API Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('consultationsService', () => {
    it('retrieves consultation by appointment ID', async () => {
      const mockConsultation = { id: 'c-1', appointmentId: 'app-1', diagnosis: 'Migraine' };
      apiClient.get.mockResolvedValueOnce({ data: mockConsultation });

      const result = await consultationsService.getConsultationByAppointment('app-1');

      expect(apiClient.get).toHaveBeenCalledWith('/appointments/app-1/consultation');
      expect(result).toEqual(mockConsultation);
    });

    it('retrieves consultation by consultation ID', async () => {
      const mockConsultation = { id: 'c-2', diagnosis: 'Asthma' };
      apiClient.get.mockResolvedValueOnce({ data: mockConsultation });

      const result = await consultationsService.getConsultationById('c-2');

      expect(apiClient.get).toHaveBeenCalledWith('/consultations/c-2');
      expect(result).toEqual(mockConsultation);
    });

    it('creates consultation for an appointment', async () => {
      const payload = {
        vitals: { bloodPressure: '120/80', pulse: 72, temperature: 36.8, weightKg: 70, spo2: 98 },
        symptoms: 'Headache',
        diagnosis: 'Tension Headache',
        notes: 'Rest and hydration',
      };
      apiClient.post.mockResolvedValueOnce({ data: { id: 'c-new', ...payload } });

      const result = await consultationsService.createConsultation('app-1', payload);

      expect(apiClient.post).toHaveBeenCalledWith('/appointments/app-1/consultation', payload);
      expect(result.id).toBe('c-new');
    });

    it('updates an existing consultation record', async () => {
      const updateData = { diagnosis: 'Severe Migraine', notes: 'Prescribed triptans' };
      apiClient.put.mockResolvedValueOnce({ data: { id: 'c-1', ...updateData } });

      const result = await consultationsService.updateConsultation('c-1', updateData);

      expect(apiClient.put).toHaveBeenCalledWith('/consultations/c-1', updateData);
      expect(result.diagnosis).toBe('Severe Migraine');
    });
  });

  describe('prescriptionsService', () => {
    it('calls drug safety check endpoint with patient and medicine IDs', async () => {
      const checkPayload = { patientId: 'pat-1', medicineIds: ['med-1', 'med-2'] };
      const checkResponse = { safe: false, warnings: [{ severity: 'HIGH', message: 'Interaction' }] };
      apiClient.post.mockResolvedValueOnce({ data: checkResponse });

      const result = await prescriptionsService.checkSafety(checkPayload);

      expect(apiClient.post).toHaveBeenCalledWith('/prescriptions/check', checkPayload);
      expect(result.safe).toBe(false);
      expect(result.warnings).toHaveLength(1);
    });

    it('creates an e-prescription record', async () => {
      const createPayload = {
        appointmentId: 'app-1',
        items: [{ medicineId: 'med-1', dosage: '500mg', frequency: 'TID', duration: '5 days' }],
        acknowledgeSevereWarnings: false,
      };
      apiClient.post.mockResolvedValueOnce({ data: { id: 'rx-1', ...createPayload } });

      const result = await prescriptionsService.createPrescription(createPayload);

      expect(apiClient.post).toHaveBeenCalledWith('/prescriptions', createPayload);
      expect(result.id).toBe('rx-1');
    });

    it('retrieves patient past prescriptions', async () => {
      const mockPage = { content: [{ id: 'rx-old' }], totalElements: 1 };
      apiClient.get.mockResolvedValueOnce({ data: mockPage });

      const result = await prescriptionsService.getPatientPrescriptions('pat-1', { page: 0, size: 20 });

      expect(apiClient.get).toHaveBeenCalledWith('/patients/pat-1/prescriptions', {
        params: { page: 0, size: 20 },
      });
      expect(result.content).toHaveLength(1);
    });
  });

  describe('medicinesService', () => {
    it('searches medicines by name query', async () => {
      const mockMedicines = [{ id: 'med-1', name: 'Amoxicillin 500mg' }];
      apiClient.get.mockResolvedValueOnce({ data: mockMedicines });

      const result = await medicinesService.searchMedicines('amox');

      expect(apiClient.get).toHaveBeenCalledWith('/medicines', {
        params: { name: 'amox' },
      });
      expect(result).toEqual(mockMedicines);
    });
  });

  describe('doctorsService extensions', () => {
    it('creates doctor leave through POST /doctors/{id}/leaves', async () => {
      const leaveData = { startDate: '2026-11-20', endDate: '2026-11-21', reason: 'Medical conference' };
      apiClient.post.mockResolvedValueOnce({ data: { id: 'leave-1', ...leaveData } });

      const result = await doctorsService.createDoctorLeave('doc-1', leaveData);

      expect(apiClient.post).toHaveBeenCalledWith('/doctors/doc-1/leaves', leaveData);
      expect(result.id).toBe('leave-1');
    });

    it('deletes doctor leave through DELETE /doctors/{id}/leaves/{leaveId}', async () => {
      apiClient.delete.mockResolvedValueOnce({ data: null });

      await doctorsService.deleteDoctorLeave('doc-1', 'leave-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/doctors/doc-1/leaves/leave-1');
    });

    it('updates doctor recurring weekly schedule timetable', async () => {
      const scheduleData = {
        entries: [
          { dayOfWeek: 'MONDAY', startTime: '09:00:00', endTime: '17:00:00' },
          { dayOfWeek: 'WEDNESDAY', startTime: '09:00:00', endTime: '17:00:00' },
        ],
      };
      apiClient.put.mockResolvedValueOnce({ data: { doctorId: 'doc-1', ...scheduleData } });

      const result = await doctorsService.updateDoctorSchedule('doc-1', scheduleData);

      expect(apiClient.put).toHaveBeenCalledWith('/doctors/doc-1/schedules', scheduleData);
      expect(result.doctorId).toBe('doc-1');
    });
  });
});
