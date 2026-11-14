import { apiClient } from './api';

/**
 * Service for appointment scheduling and state monitoring.
 */
export const appointmentsService = {
  /**
   * Retrieves paginated appointments with role-scoped filters.
   * @param {Object} [params]
   * @param {string} [params.doctorId]
   * @param {string} [params.patientId]
   * @param {string|string[]} [params.status]
   * @param {string} [params.from]
   * @param {string} [params.to]
   * @param {number} [params.page=0]
   * @param {number} [params.size=20]
   * @param {string} [params.sort='slotStart,asc']
   * @returns {Promise<import('@/types').PageResponse<import('@/types').AppointmentResponse>>}
   */
  async getAppointments(params = {}) {
    const response = await apiClient.get('/appointments', { params });
    return response.data;
  },

  /**
   * Retrieves an appointment by ID.
   * @param {string} appointmentId
   * @returns {Promise<import('@/types').AppointmentResponse>}
   */
  async getAppointmentById(appointmentId) {
    const response = await apiClient.get(`/appointments/${appointmentId}`);
    return response.data;
  },

  /**
   * Administratively cancels an appointment.
   * @param {string} appointmentId
   * @param {string} [reason='Administrative cancellation']
   * @returns {Promise<import('@/types').AppointmentResponse>}
   */
  async cancelAppointment(appointmentId, reason = 'Administrative cancellation') {
    const response = await apiClient.patch(`/appointments/${appointmentId}/status`, {
      status: 'CANCELLED',
      reason,
    });
    return response.data;
  },

  /**
   * Books a new appointment on behalf of a patient.
   * @param {Object} data
   * @param {string} data.doctorId
   * @param {string} data.patientId
   * @param {string} data.slotStart - ISO UTC string
   * @param {string} [data.reason]
   * @returns {Promise<import('@/types').AppointmentResponse>}
   */
  async bookAppointment(data) {
    const response = await apiClient.post('/appointments', data);
    return response.data;
  },

  /**
   * Executes patient check-in at reception desk and issues queue token.
   * @param {string} appointmentId
   * @returns {Promise<import('@/types').AppointmentResponse>}
   */
  async checkInAppointment(appointmentId) {
    const response = await apiClient.patch(`/appointments/${appointmentId}/status`, {
      status: 'CHECKED_IN',
    });
    return response.data;
  },

  /**
   * Updates an appointment status following backend state machine rules.
   * @param {string} appointmentId
   * @param {string} status - Target status
   * @param {string} [reason]
   * @returns {Promise<import('@/types').AppointmentResponse>}
   */
  async updateAppointmentStatus(appointmentId, status, reason) {
    const response = await apiClient.patch(`/appointments/${appointmentId}/status`, {
      status,
      ...(reason ? { reason } : {}),
    });
    return response.data;
  },
};
