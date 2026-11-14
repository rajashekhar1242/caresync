import { apiClient } from './api';

/**
 * Service for physician profiles and clinical reference lookups.
 */
export const doctorsService = {
  /**
   * Lists paginated doctors with optional filters.
   * @param {Object} [params]
   * @param {string} [params.specializationId]
   * @param {string} [params.clinicId]
   * @param {string} [params.name]
   * @param {number} [params.page=0]
   * @param {number} [params.size=20]
   * @param {string} [params.sort='fullName,asc']
   * @returns {Promise<import('@/types').PageResponse<import('@/types').DoctorResponse>>}
   */
  async getDoctors(params = {}) {
    const response = await apiClient.get('/doctors', { params });
    return response.data;
  },

  /**
   * Retrieves single doctor profile by UUID.
   * @param {string} doctorId
   * @returns {Promise<import('@/types').DoctorResponse>}
   */
  async getDoctorById(doctorId) {
    const response = await apiClient.get(`/doctors/${doctorId}`);
    return response.data;
  },

  /**
   * Provisions a new physician user account and profile (ADMIN only).
   * @param {Object} data
   * @returns {Promise<import('@/types').DoctorResponse>}
   */
  async createDoctor(data) {
    const response = await apiClient.post('/doctors', data);
    return response.data;
  },

  /**
   * Updates physician profile attributes or active status (ADMIN only).
   * @param {string} doctorId
   * @param {Object} data
   * @returns {Promise<import('@/types').DoctorResponse>}
   */
  async updateDoctor(doctorId, data) {
    const response = await apiClient.put(`/doctors/${doctorId}`, data);
    return response.data;
  },

  /**
   * Retrieves all medical specializations.
   * @returns {Promise<Array<{ id: string, name: string, description: string }>>}
   */
  async getSpecializations() {
    const response = await apiClient.get('/specializations');
    return response.data;
  },

  /**
   * Retrieves all clinics and branches.
   * @returns {Promise<Array<{ id: string, name: string, address: string, phone: string, timeZone: string }>>}
   */
  async getClinics() {
    const response = await apiClient.get('/clinics');
    return response.data;
  },

  /**
   * Retrieves the weekly schedule for a doctor.
   * @param {string} doctorId - Doctor UUID
   * @returns {Promise<import('@/types').WeeklyScheduleResponse>}
   */
  async getDoctorSchedules(doctorId) {
    const response = await apiClient.get(`/doctors/${doctorId}/schedules`);
    return response.data;
  },

  /**
   * Retrieves leaves for a doctor within an optional date range.
   * @param {string} doctorId - Doctor UUID
   * @param {string} [from] - YYYY-MM-DD
   * @param {string} [to] - YYYY-MM-DD
   * @returns {Promise<Array<import('@/types').LeaveResponse>>}
   */
  async getDoctorLeaves(doctorId, from, to) {
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const response = await apiClient.get(`/doctors/${doctorId}/leaves`, { params });
    return response.data;
  },

  /**
   * Generates authoritative appointment slots for a doctor on a specific date.
   * @param {string} doctorId - Doctor UUID
   * @param {string} date - YYYY-MM-DD
   * @returns {Promise<import('@/types').SlotListResponse>}
   */
  async getDoctorSlots(doctorId, date) {
    const response = await apiClient.get(`/doctors/${doctorId}/slots`, {
      params: { date },
    });
    return response.data;
  },

  /**
   * Submits a leave request for a physician (ADMIN or DOCTOR).
   * @param {string} doctorId - Doctor UUID
   * @param {{ startDate: string, endDate: string, reason?: string }} data
   * @returns {Promise<import('@/types').LeaveResponse>}
   */
  async createDoctorLeave(doctorId, data) {
    const response = await apiClient.post(`/doctors/${doctorId}/leaves`, data);
    return response.data;
  },

  /**
   * Deletes a scheduled leave for a physician (ADMIN or DOCTOR).
   * @param {string} doctorId - Doctor UUID
   * @param {string} leaveId - Leave UUID
   * @returns {Promise<void>}
   */
  async deleteDoctorLeave(doctorId, leaveId) {
    await apiClient.delete(`/doctors/${doctorId}/leaves/${leaveId}`);
  },

  /**
   * Replaces weekly schedule entries for a physician (ADMIN or DOCTOR).
   * @param {string} doctorId - Doctor UUID
   * @param {{ entries: Array<{ dayOfWeek: string, startTime: string, endTime: string }> }} data
   * @returns {Promise<import('@/types').WeeklyScheduleResponse>}
   */
  async updateDoctorSchedule(doctorId, data) {
    const response = await apiClient.put(`/doctors/${doctorId}/schedules`, data);
    return response.data;
  },
};
