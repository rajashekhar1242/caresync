import { apiClient } from './api';

/**
 * Service for department reference data management.
 */
export const departmentsService = {
  /**
   * Retrieves all clinical departments.
   * @returns {Promise<Array<{ id: string, name: string, description: string }>>}
   */
  async getDepartments() {
    const response = await apiClient.get('/departments');
    return response.data;
  },

  /**
   * Creates a new clinical department (ADMIN only).
   * @param {Object} data
   * @param {string} data.name - Department name (2-100 characters).
   * @param {string} [data.description] - Optional description (max 500 characters).
   * @returns {Promise<{ id: string, name: string, description: string }>}
   */
  async createDepartment(data) {
    const response = await apiClient.post('/departments', data);
    return response.data;
  },

  /**
   * Updates an existing clinical department (ADMIN only).
   * @param {string} departmentId - UUID of the department.
   * @param {Object} data
   * @param {string} data.name
   * @param {string} [data.description]
   * @returns {Promise<{ id: string, name: string, description: string }>}
   */
  async updateDepartment(departmentId, data) {
    const response = await apiClient.put(`/departments/${departmentId}`, data);
    return response.data;
  },
};
