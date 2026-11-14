import { apiClient } from './api';

/**
 * Service for electronic prescription writing, safety checks, and PDF exports.
 */
export const prescriptionsService = {
  /**
   * Evaluates drug-drug interactions and allergy conflicts.
   * @param {Object} data
   * @param {string} data.patientId - Patient UUID
   * @param {string[]} data.medicineIds - Array of Medicine UUIDs (1-20)
   * @returns {Promise<{ warnings: Array<{ type: string, severity: string, medicines: Array<{ id: string, name: string }>, message: string }> }>}
   */
  async checkPrescription(data) {
    const response = await apiClient.post('/prescriptions/check', data);
    return response.data;
  },

  /**
   * Alias for checkPrescription.
   */
  async checkSafety(data) {
    return this.checkPrescription(data);
  },

  /**
   * Finalizes and issues a digital prescription linked to a consultation.
   * @param {Object} data
   * @param {string} data.consultationId - Consultation UUID
   * @param {Array<{ medicineId: string, dosage: string, frequency: string, durationDays: number, instructions?: string }>} data.items
   * @param {boolean} [data.acknowledgeSevereWarnings]
   * @returns {Promise<import('@/types').PrescriptionResponse>}
   */
  async createPrescription(data) {
    const response = await apiClient.post('/prescriptions', data);
    return response.data;
  },

  /**
   * Retrieves prescription details by UUID.
   * @param {string} prescriptionId - Prescription UUID
   * @returns {Promise<import('@/types').PrescriptionResponse>}
   */
  async getPrescription(prescriptionId) {
    const response = await apiClient.get(`/prescriptions/${prescriptionId}`);
    return response.data;
  },

  /**
   * Alias for getPrescription.
   */
  async getPrescriptionById(prescriptionId) {
    return this.getPrescription(prescriptionId);
  },

  /**
   * Streams prescription PDF binary blob.
   * @param {string} prescriptionId - Prescription UUID
   * @returns {Promise<Blob>}
   */
  async getPrescriptionPdf(prescriptionId) {
    const response = await apiClient.get(`/prescriptions/${prescriptionId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Retrieves historical prescriptions for a specific patient.
   * @param {string} patientId - Patient UUID
   * @param {Object} [params]
   * @param {number} [params.page=0]
   * @param {number} [params.size=20]
   * @returns {Promise<import('@/types').PageResponse<import('@/types').PrescriptionResponse>>}
   */
  async getPatientPrescriptions(patientId, params = {}) {
    const response = await apiClient.get(`/patients/${patientId}/prescriptions`, {
      params,
    });
    return response.data;
  },

  /**
   * Downloads prescription PDF directly in browser.
   * @param {string} prescriptionId
   * @param {string} [filename='prescription.pdf']
   */
  async downloadPdf(prescriptionId, filename = 'prescription.pdf') {
    const blob = await this.getPrescriptionPdf(prescriptionId);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return true;
  },
};
