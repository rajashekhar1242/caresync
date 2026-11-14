import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/services/api';
import { reportsService } from '@/services/reports.service';
import { departmentsService } from '@/services/departments.service';
import { doctorsService } from '@/services/doctors.service';
import { appointmentsService } from '@/services/appointments.service';
import { patientsService } from '@/services/patients.service';
import { billingService } from '@/services/billing.service';
import { auditService } from '@/services/audit.service';

describe('Admin API Services', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('reportsService', () => {
    it('getDashboardSummary calls /reports/dashboard', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { activeDoctors: 5 } });
      const result = await reportsService.getDashboardSummary('clinic-1');

      expect(spy).toHaveBeenCalledWith('/reports/dashboard', {
        params: { clinicId: 'clinic-1' },
      });
      expect(result).toEqual({ activeDoctors: 5 });
    });

    it('getRevenueReport passes date range and grouping', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { totals: {} } });
      await reportsService.getRevenueReport({ from: '2026-01-01', to: '2026-01-31', groupBy: 'MONTH' });

      expect(spy).toHaveBeenCalledWith('/reports/revenue', {
        params: { from: '2026-01-01', to: '2026-01-31', groupBy: 'MONTH' },
      });
    });

    it('getAppointmentsByDepartment passes date range', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { departments: [] } });
      await reportsService.getAppointmentsByDepartment({ from: '2026-01-01', to: '2026-01-31' });

      expect(spy).toHaveBeenCalledWith('/reports/appointments-by-department', {
        params: { from: '2026-01-01', to: '2026-01-31' },
      });
    });

    it('getNoShowRate passes date range', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { noShowRate: 0.12 } });
      await reportsService.getNoShowRate({ from: '2026-01-01', to: '2026-01-31' });

      expect(spy).toHaveBeenCalledWith('/reports/no-show-rate', {
        params: { from: '2026-01-01', to: '2026-01-31' },
      });
    });

    it('getTopDoctors passes rankBy and limit', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { entries: [] } });
      await reportsService.getTopDoctors({ from: '2026-01-01', to: '2026-01-31', limit: 10 });

      expect(spy).toHaveBeenCalledWith('/reports/top-doctors', {
        params: { from: '2026-01-01', to: '2026-01-31', rankBy: 'COMPLETED_APPOINTMENTS', limit: 10 },
      });
    });
  });

  describe('departmentsService', () => {
    it('getDepartments calls GET /departments', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: [{ id: '1', name: 'Cardiology' }] });
      const result = await departmentsService.getDepartments();

      expect(spy).toHaveBeenCalledWith('/departments');
      expect(result).toHaveLength(1);
    });

    it('createDepartment calls POST /departments', async () => {
      const payload = { name: 'Neurology', description: 'Brain and nerve wing' };
      const spy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: '2', ...payload } });
      const result = await departmentsService.createDepartment(payload);

      expect(spy).toHaveBeenCalledWith('/departments', payload);
      expect(result.name).toBe('Neurology');
    });

    it('updateDepartment calls PUT /departments/{id}', async () => {
      const payload = { name: 'Updated Cardio', description: 'Updated' };
      const spy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({ data: { id: '1', ...payload } });
      const result = await departmentsService.updateDepartment('1', payload);

      expect(spy).toHaveBeenCalledWith('/departments/1', payload);
      expect(result.name).toBe('Updated Cardio');
    });
  });

  describe('doctorsService', () => {
    it('getDoctors calls GET /doctors with query params', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { content: [] } });
      await doctorsService.getDoctors({ page: 1, size: 20, name: 'Smith' });

      expect(spy).toHaveBeenCalledWith('/doctors', {
        params: { page: 1, size: 20, name: 'Smith' },
      });
    });

    it('createDoctor calls POST /doctors', async () => {
      const payload = { fullName: 'Dr. Watson', email: 'watson@med.com' };
      const spy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: 'doc-1' } });
      await doctorsService.createDoctor(payload);

      expect(spy).toHaveBeenCalledWith('/doctors', payload);
    });

    it('updateDoctor calls PUT /doctors/{id}', async () => {
      const payload = { fullName: 'Dr. Watson', active: false };
      const spy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({ data: { id: 'doc-1', active: false } });
      await doctorsService.updateDoctor('doc-1', payload);

      expect(spy).toHaveBeenCalledWith('/doctors/doc-1', payload);
    });
  });

  describe('appointmentsService', () => {
    it('getAppointments calls GET /appointments with parameters', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { content: [] } });
      await appointmentsService.getAppointments({ status: 'BOOKED', page: 0 });

      expect(spy).toHaveBeenCalledWith('/appointments', {
        params: { status: 'BOOKED', page: 0 },
      });
    });

    it('cancelAppointment calls PATCH /appointments/{id}/status', async () => {
      const spy = vi.spyOn(apiClient, 'patch').mockResolvedValueOnce({ data: { status: 'CANCELLED' } });
      await appointmentsService.cancelAppointment('apt-123', 'Doctor emergency');

      expect(spy).toHaveBeenCalledWith('/appointments/apt-123/status', {
        status: 'CANCELLED',
        reason: 'Doctor emergency',
      });
    });
  });

  describe('patientsService', () => {
    it('getPatients calls GET /patients', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { content: [] } });
      await patientsService.getPatients({ phone: '12345' });

      expect(spy).toHaveBeenCalledWith('/patients', {
        params: { phone: '12345' },
      });
    });

    it('getPatientById calls GET /patients/{id}', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { id: 'p-1', fullName: 'Alice' } });
      const result = await patientsService.getPatientById('p-1');

      expect(spy).toHaveBeenCalledWith('/patients/p-1');
      expect(result.fullName).toBe('Alice');
    });

    it('createPatient calls POST /patients', async () => {
      const payload = { fullName: 'Bob', phone: '+919876543210' };
      const spy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: 'p-2' } });
      await patientsService.createPatient(payload);

      expect(spy).toHaveBeenCalledWith('/patients', payload);
    });
  });

  describe('billingService', () => {
    it('getInvoices calls GET /invoices', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { content: [] } });
      await billingService.getInvoices({ status: 'PAID' });

      expect(spy).toHaveBeenCalledWith('/invoices', {
        params: { status: 'PAID' },
      });
    });

    it('voidInvoice calls POST /invoices/{id}/void', async () => {
      const spy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { status: 'VOID' } });
      await billingService.voidInvoice('inv-1', 'Billed in error');

      expect(spy).toHaveBeenCalledWith('/invoices/inv-1/void', {
        reason: 'Billed in error',
      });
    });

    it('createCreditNote calls POST /invoices/{id}/credit-notes', async () => {
      const spy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { id: 'cn-1' } });
      await billingService.createCreditNote('inv-1', { amount: '100.00', reason: 'Refund' });

      expect(spy).toHaveBeenCalledWith('/invoices/inv-1/credit-notes', {
        amount: '100.00',
        reason: 'Refund',
      });
    });
  });

  describe('auditService', () => {
    it('getAuditLogs calls GET /audit-logs with query params', async () => {
      const spy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { content: [] } });
      await auditService.getAuditLogs({ action: 'AUTH_LOGIN', page: 0 });

      expect(spy).toHaveBeenCalledWith('/audit-logs', {
        params: { action: 'AUTH_LOGIN', page: 0 },
      });
    });
  });
});
