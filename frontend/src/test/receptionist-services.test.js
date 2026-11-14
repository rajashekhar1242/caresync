import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/services/api';
import { queueService } from '@/services/queue.service';
import { appointmentsService } from '@/services/appointments.service';
import { doctorsService } from '@/services/doctors.service';

describe('Receptionist API Services', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('queueService', () => {
    it('getDoctorQueue calls /queue/doctors/{id}', async () => {
      const mockQueue = { doctorId: 'doc-1', waitingCount: 2, nowServing: null };
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: mockQueue });

      const result = await queueService.getDoctorQueue('doc-1');
      expect(spy).toHaveBeenCalledWith('/queue/doctors/doc-1');
      expect(result).toEqual(mockQueue);
    });

    it('getQueueBoard calls /queue/board with clinicId param', async () => {
      const mockBoard = { clinicId: 'c-1', doctors: [] };
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: mockBoard });

      const result = await queueService.getQueueBoard('c-1');
      expect(spy).toHaveBeenCalledWith('/queue/board', {
        params: { clinicId: 'c-1' },
      });
      expect(result).toEqual(mockBoard);
    });

    it('callNext calls POST /queue/doctors/{id}/call-next', async () => {
      const mockResponse = { doctorId: 'doc-1', nowServing: { tokenNumber: 1 } };
      const spy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockResponse });

      const result = await queueService.callNext('doc-1');
      expect(spy).toHaveBeenCalledWith('/queue/doctors/doc-1/call-next');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('appointmentsService front-desk extensions', () => {
    it('bookAppointment posts AppointmentCreateRequest to /appointments', async () => {
      const payload = {
        doctorId: 'doc-1',
        patientId: 'pat-1',
        slotStart: '2026-11-13T10:00:00Z',
        reason: 'Regular consultation',
      };
      const mockResponse = { id: 'appt-1', status: 'BOOKED', ...payload };
      const spy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockResponse });

      const result = await appointmentsService.bookAppointment(payload);
      expect(spy).toHaveBeenCalledWith('/appointments', payload);
      expect(result.status).toBe('BOOKED');
    });

    it('checkInAppointment calls PATCH /appointments/{id}/status with CHECKED_IN', async () => {
      const mockResponse = { id: 'appt-1', status: 'CHECKED_IN', tokenNumber: 5 };
      const spy = vi.spyOn(apiClient, 'patch').mockResolvedValueOnce({ data: mockResponse });

      const result = await appointmentsService.checkInAppointment('appt-1');
      expect(spy).toHaveBeenCalledWith('/appointments/appt-1/status', {
        status: 'CHECKED_IN',
      });
      expect(result.tokenNumber).toBe(5);
    });

    it('updateAppointmentStatus passes custom status and reason', async () => {
      const mockResponse = { id: 'appt-1', status: 'NO_SHOW' };
      const spy = vi.spyOn(apiClient, 'patch').mockResolvedValueOnce({ data: mockResponse });

      const result = await appointmentsService.updateAppointmentStatus('appt-1', 'NO_SHOW');
      expect(spy).toHaveBeenCalledWith('/appointments/appt-1/status', {
        status: 'NO_SHOW',
      });
      expect(result.status).toBe('NO_SHOW');
    });
  });

  describe('doctorsService schedule & slot extensions', () => {
    it('getDoctorSchedules calls /doctors/{id}/schedules', async () => {
      const mockSchedule = { doctorId: 'doc-1', entries: [] };
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: mockSchedule });

      const result = await doctorsService.getDoctorSchedules('doc-1');
      expect(spy).toHaveBeenCalledWith('/doctors/doc-1/schedules');
      expect(result).toEqual(mockSchedule);
    });

    it('getDoctorLeaves calls /doctors/{id}/leaves with from/to', async () => {
      const mockLeaves = [{ id: 'leave-1', startDate: '2026-11-15' }];
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: mockLeaves });

      const result = await doctorsService.getDoctorLeaves('doc-1', '2026-11-01', '2026-11-30');
      expect(spy).toHaveBeenCalledWith('/doctors/doc-1/leaves', {
        params: { from: '2026-11-01', to: '2026-11-30' },
      });
      expect(result).toEqual(mockLeaves);
    });

    it('getDoctorSlots calls /doctors/{id}/slots with date param', async () => {
      const mockSlots = { doctorId: 'doc-1', date: '2026-11-13', slots: [] };
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: mockSlots });

      const result = await doctorsService.getDoctorSlots('doc-1', '2026-11-13');
      expect(spy).toHaveBeenCalledWith('/doctors/doc-1/slots', {
        params: { date: '2026-11-13' },
      });
      expect(result).toEqual(mockSlots);
    });
  });
});
