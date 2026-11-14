import { apiClient } from './api';

/**
 * Service for fetching administrative and financial reports.
 */
export const reportsService = {
  /**
   * Fetches the executive dashboard summary metrics.
   * @param {string} [clinicId] - Optional UUID of the clinic.
   * @returns {Promise<import('@/types').DashboardSummaryResponse>}
   */
  async getDashboardSummary(clinicId) {
    const params = clinicId ? { clinicId } : {};
    const response = await apiClient.get('/reports/dashboard', { params });
    return response.data;
  },

  /**
   * Fetches revenue figures and periodic buckets.
   * @param {Object} options
   * @param {string} options.from - Start date (YYYY-MM-DD).
   * @param {string} options.to - End date (YYYY-MM-DD).
   * @param {string} [options.clinicId] - Optional UUID of the clinic.
   * @param {'DAY'|'WEEK'|'MONTH'} [options.groupBy='DAY']
   * @returns {Promise<import('@/types').RevenueReportResponse>}
   */
  async getRevenueReport({ from, to, clinicId, groupBy = 'DAY' }) {
    const params = { from, to, groupBy };
    if (clinicId) params.clinicId = clinicId;
    const response = await apiClient.get('/reports/revenue', { params });
    return response.data;
  },

  /**
   * Fetches appointments grouped by clinical department.
   * @param {Object} options
   * @param {string} options.from - Start date (YYYY-MM-DD).
   * @param {string} options.to - End date (YYYY-MM-DD).
   * @param {string} [options.clinicId] - Optional UUID of the clinic.
   * @returns {Promise<import('@/types').AppointmentsByDepartmentResponse>}
   */
  async getAppointmentsByDepartment({ from, to, clinicId }) {
    const params = { from, to };
    if (clinicId) params.clinicId = clinicId;
    const response = await apiClient.get('/reports/appointments-by-department', { params });
    return response.data;
  },

  /**
   * Fetches the no-show rate report.
   * @param {Object} options
   * @param {string} options.from - Start date (YYYY-MM-DD).
   * @param {string} options.to - End date (YYYY-MM-DD).
   * @param {string} [options.clinicId] - Optional UUID of the clinic.
   * @returns {Promise<any>}
   */
  async getNoShowRate({ from, to, clinicId }) {
    const params = { from, to };
    if (clinicId) params.clinicId = clinicId;
    const response = await apiClient.get('/reports/no-show-rate', { params });
    return response.data;
  },

  /**
   * Fetches top ranking doctors by performance metric.
   * @param {Object} options
   * @param {string} options.from - Start date (YYYY-MM-DD).
   * @param {string} options.to - End date (YYYY-MM-DD).
   * @param {string} [options.clinicId] - Optional UUID of the clinic.
   * @param {'COMPLETED_APPOINTMENTS'|'REVENUE'} [options.rankBy='COMPLETED_APPOINTMENTS']
   * @param {number} [options.limit=5]
   * @returns {Promise<any>}
   */
  async getTopDoctors({ from, to, clinicId, rankBy = 'COMPLETED_APPOINTMENTS', limit = 5 }) {
    const params = { from, to, rankBy, limit };
    if (clinicId) params.clinicId = clinicId;
    const response = await apiClient.get('/reports/top-doctors', { params });
    return response.data;
  },
};
