import { apiClient } from './api';

/**
 * Service for live queue monitoring and patient calling.
 */
export const queueService = {
  /**
   * Retrieves detailed queue state for a specific physician.
   * @param {string} doctorId - Doctor UUID
   * @returns {Promise<import('@/types').QueueStateResponse>}
   */
  async getDoctorQueue(doctorId) {
    const response = await apiClient.get(`/queue/doctors/${doctorId}`);
    return response.data;
  },

  /**
   * Retrieves public waiting board for a clinic.
   * @param {string} clinicId - Clinic UUID
   * @returns {Promise<import('@/types').QueueBoardResponse>}
   */
  async getQueueBoard(clinicId) {
    const response = await apiClient.get('/queue/board', {
      params: { clinicId },
    });
    return response.data;
  },

  /**
   * Advances the lowest-token waiting patient into consultation.
   * @param {string} doctorId - Doctor UUID
   * @returns {Promise<import('@/types').QueueStateResponse>}
   */
  async callNext(doctorId) {
    const response = await apiClient.post(`/queue/doctors/${doctorId}/call-next`);
    return response.data;
  },

  /**
   * Alias for callNext.
   */
  async callNextPatient(doctorId) {
    return this.callNext(doctorId);
  },
};
