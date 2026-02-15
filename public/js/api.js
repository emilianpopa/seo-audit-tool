/**
 * API Client for SEO Audit Tool
 * Handles all communication with the backend API
 */

const API = {
    /**
     * Base URL for API calls
     * Uses relative URL so it works in both local and production
     */
    baseURL: '/api',

    /**
     * Helper function to make API requests
     * @param {string} endpoint - API endpoint path
     * @param {object} options - Fetch options
     * @returns {Promise<object>} - API response data
     */
    async request(endpoint, options = {}) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    /**
     * Start a new SEO audit
     * @param {string} targetUrl - URL to audit
     * @param {object} config - Audit configuration
     * @returns {Promise<object>} - Audit creation response
     */
    async startAudit(targetUrl, config = {}) {
        return await this.request('/audit/start', {
            method: 'POST',
            body: JSON.stringify({
                targetUrl,
                config
            })
        });
    },

    /**
     * Get audit status
     * @param {string} auditId - Audit ID
     * @returns {Promise<object>} - Audit status response
     */
    async getAuditStatus(auditId) {
        return await this.request(`/audit/${auditId}/status`);
    },

    /**
     * Get audit report
     * @param {string} auditId - Audit ID
     * @returns {Promise<object>} - Audit report data
     */
    async getAuditReport(auditId) {
        return await this.request(`/audit/${auditId}/report`);
    },

    /**
     * Get audit history
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @returns {Promise<object>} - Audit history response
     */
    async getAuditHistory(page = 1, limit = 10) {
        return await this.request(`/audit/history?page=${page}&limit=${limit}`);
    },

    /**
     * Delete an audit
     * @param {string} auditId - Audit ID
     * @returns {Promise<void>}
     */
    async deleteAudit(auditId) {
        return await this.request(`/audit/${auditId}`, {
            method: 'DELETE'
        });
    },

    /**
     * Download audit report
     * @param {string} auditId - Audit ID
     * @param {string} format - Report format (pdf or docx)
     */
    async downloadReport(auditId, format = 'pdf') {
        try {
            const url = `${this.baseURL}/report/${auditId}/download?format=${format}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error('Failed to download report');
            }

            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `seo-audit-${auditId}.${format}`;

            if (contentDisposition) {
                const matches = /filename="(.+)"/.exec(contentDisposition);
                if (matches && matches[1]) {
                    filename = matches[1];
                }
            }

            // Create blob and download
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            return { success: true, filename };
        } catch (error) {
            console.error('Download Error:', error);
            throw error;
        }
    },

    /**
     * Check API health
     * @returns {Promise<object>} - Health check response
     */
    async checkHealth() {
        return await this.request('/health');
    }
};
