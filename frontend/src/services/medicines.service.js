import { apiClient } from './api';

/**
 * Service for medicine catalog lookups and searching.
 */
export const medicinesService = {
  /**
   * Searches hospital medicine formulary by commercial or generic name.
   * Requires min 2 characters when name is provided.
   * @param {Object} [params]
   * @param {string} [params.name]
   * @param {number} [params.page=0]
   * @param {number} [params.size=20]
   * @returns {Promise<import('@/types').PageResponse<{ id: string, name: string, genericName: string, strength: string, form: string, drugClass: string }>>}
   */
  async searchMedicines(params = {}) {
    const queryParams = typeof params === 'string' ? { name: params } : params;
    const response = await apiClient.get('/medicines', { params: queryParams });
    return response.data;
  },
};
