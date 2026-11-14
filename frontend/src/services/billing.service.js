import { apiClient } from './api';

/**
 * Service for billing, invoices, payments, and PDF downloads.
 */
export const billingService = {
  /**
   * Retrieves paginated invoices with status / patient / date filters.
   * @param {Object} [params]
   * @param {string|string[]} [params.status]
   * @param {string} [params.patientId]
   * @param {string} [params.from]
   * @param {string} [params.to]
   * @param {number} [params.page=0]
   * @param {number} [params.size=20]
   * @returns {Promise<import('@/types').PageResponse<any>>}
   */
  async getInvoices(params = {}) {
    const response = await apiClient.get('/invoices', { params });
    return response.data;
  },

  /**
   * Retrieves invoice details by ID.
   * @param {string} invoiceId
   * @returns {Promise<any>}
   */
  async getInvoiceById(invoiceId) {
    const response = await apiClient.get(`/invoices/${invoiceId}`);
    return response.data;
  },

  /**
   * Downloads invoice PDF as a Blob and triggers browser download.
   * @param {string} invoiceId
   * @param {string} [invoiceNumber]
   */
  async downloadInvoicePdf(invoiceId, invoiceNumber = 'invoice') {
    const response = await apiClient.get(`/invoices/${invoiceId}/pdf`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `invoice-${invoiceNumber}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Voids an unpaid invoice (ADMIN only).
   * @param {string} invoiceId
   * @param {string} reason
   * @returns {Promise<any>}
   */
  async voidInvoice(invoiceId, reason) {
    const response = await apiClient.post(`/invoices/${invoiceId}/void`, { reason });
    return response.data;
  },

  /**
   * Issues a credit note against an invoice (ADMIN only).
   * @param {string} invoiceId
   * @param {Object} data
   * @param {string} data.amount
   * @param {string} data.reason
   * @returns {Promise<any>}
   */
  async createCreditNote(invoiceId, data) {
    const response = await apiClient.post(`/invoices/${invoiceId}/credit-notes`, data);
    return response.data;
  },
};
