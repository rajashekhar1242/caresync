import { apiClient } from './api';

/**
 * Service for patient directory and profile management.
 */
export const patientsService = {
  /**
   * Searches and lists patients with pagination.
   * @param {Object} [params]
   * @param {string} [params.phone]
   * @param {string} [params.name]
   * @param {number} [params.page=0]
   * @param {number} [params.size=20]
   * @returns {Promise<import('@/types').PageResponse<import('@/types').PatientSummary>>}
   */
  async getPatients(params = {}) {
    const response = await apiClient.get('/patients', { params });
    return response.data;
  },

  /**
   * Retrieves full patient medical profile by ID.
   * Note: This endpoint creates a PATIENT_READ audit log entry in the backend.
   * @param {string} patientId
   * @returns {Promise<import('@/types').PatientResponse>}
   */
  async getPatientById(patientId) {
    const response = await apiClient.get(`/patients/${patientId}`);
    return response.data;
  },

  /**
   * Creates a new walk-in or clinic patient.
   * @param {Object} data
   * @returns {Promise<import('@/types').PatientResponse>}
   */
  async createPatient(data) {
    const response = await apiClient.post('/patients', data);
    return response.data;
  },

  /**
   * Updates an existing patient profile.
   * @param {string} patientId
   * @param {Object} data
   * @returns {Promise<import('@/types').PatientResponse>}
   */
  async updatePatient(patientId, data) {
    const response = await apiClient.put(`/patients/${patientId}`, data);
    return response.data;
  },
};
