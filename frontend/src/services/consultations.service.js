import { apiClient } from './api';

/**
 * Service for clinical consultation lifecycle and medical documentation.
 */
export const consultationsService = {
  /**
   * Retrieves consultation for a specific appointment.
   * @param {string} appointmentId - Appointment UUID
   * @returns {Promise<import('@/types').ConsultationResponse>}
   */
  async getAppointmentConsultation(appointmentId) {
    const response = await apiClient.get(`/appointments/${appointmentId}/consultation`);
    return response.data;
  },

  /**
   * Creates a new consultation record for an appointment in IN_CONSULTATION status.
   * @param {string} appointmentId - Appointment UUID
   * @param {Object} data - Consultation data
   * @param {Object} [data.vitals] - VitalsDto
   * @param {string} [data.symptoms] - Max 2000 chars
   * @param {string} [data.diagnosis] - Max 2000 chars
   * @param {string} [data.notes] - Max 5000 chars
   * @param {string} [data.followUpDate] - YYYY-MM-DD
   * @returns {Promise<import('@/types').ConsultationResponse>}
   */
  async createConsultation(appointmentId, data) {
    const response = await apiClient.post(`/appointments/${appointmentId}/consultation`, data);
    return response.data;
  },

  /**
   * Retrieves consultation by consultation UUID.
   * @param {string} consultationId - Consultation UUID
   * @returns {Promise<import('@/types').ConsultationResponse>}
   */
  async getConsultation(consultationId) {
    const response = await apiClient.get(`/consultations/${consultationId}`);
    return response.data;
  },

  /**
   * Alias for getAppointmentConsultation.
   */
  async getConsultationByAppointment(appointmentId) {
    return this.getAppointmentConsultation(appointmentId);
  },

  /**
   * Alias for getConsultation.
   */
  async getConsultationById(consultationId) {
    return this.getConsultation(consultationId);
  },

  /**
   * Updates an unfinalized consultation record.
   * @param {string} consultationId - Consultation UUID
   * @param {Object} data - Consultation data
   * @returns {Promise<import('@/types').ConsultationResponse>}
   */
  async updateConsultation(consultationId, data) {
    const response = await apiClient.put(`/consultations/${consultationId}`, data);
    return response.data;
  },
};
