import { apiClient } from './api';

/**
 * Service for querying immutable system and clinical audit logs.
 */
export const auditService = {
  /**
   * Retrieves paginated audit log events (ADMIN only).
   * @param {Object} [params]
   * @param {string} [params.userId]
   * @param {string} [params.action]
   * @param {string} [params.entityType]
   * @param {string} [params.from]
   * @param {string} [params.to]
   * @param {number} [params.page=0]
   * @param {number} [params.size=20]
   * @returns {Promise<import('@/types').PageResponse<any>>}
   */
  async getAuditLogs(params = {}) {
    const response = await apiClient.get('/audit-logs', { params });
    return response.data;
  },
};
