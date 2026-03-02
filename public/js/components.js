/**
 * UI Components for SEO Audit Tool
 * Reusable component builders for dynamic UI elements
 */

const Components = {
    /**
     * Create a score badge element
     * @param {number} score - Score value (0-100)
     * @returns {HTMLElement} - Score badge element
     */
    createScoreBadge(score) {
        const rating = this.getScoreRating(score);
        const span = document.createElement('span');
        span.className = `score-rating ${rating}`;
        span.textContent = rating.replace('-', ' ');
        return span;
    },

    /**
     * Get score rating from numeric score
     * @param {number} score - Score value (0-100)
     * @returns {string} - Rating (excellent, good, needs-improvement, poor)
     */
    getScoreRating(score) {
        if (score >= 90) return 'excellent';
        if (score >= 70) return 'good';
        if (score >= 50) return 'needs-improvement';
        return 'poor';
    },

    /**
     * Format category name to display format
     * @param {string} categoryName - Category name (e.g., TECHNICAL_SEO)
     * @returns {string} - Formatted name (e.g., Technical SEO)
     */
    formatCategoryName(categoryName) {
        return categoryName
            .split('_')
            .map(word => word.charAt(0) + word.slice(1).toLowerCase())
            .join(' ');
    },

    /**
     * Create a category card element
     * @param {string} categoryName - Category name
     * @param {object} categoryData - Category data with score, issues, etc.
     * @returns {HTMLElement} - Category card element
     */
    createCategoryCard(categoryName, categoryData) {
        const card = document.createElement('div');
        card.className = 'category-card';

        const rating = this.getScoreRating(categoryData.score);
        const displayName = this.formatCategoryName(categoryName);

        card.innerHTML = `
            <div class="category-header">
                <span class="category-name">${displayName}</span>
                <span class="category-score ${rating}">${categoryData.score}</span>
            </div>
            <div class="category-weight">Weight: ${Math.round(categoryData.weight * 100)}%</div>
            <div class="issue-summary">
                ${categoryData.criticalCount > 0 ? `<span class="issue-badge critical">${categoryData.criticalCount} Critical</span>` : ''}
                ${categoryData.highCount > 0 ? `<span class="issue-badge high">${categoryData.highCount} High</span>` : ''}
                ${categoryData.mediumCount > 0 ? `<span class="issue-badge medium">${categoryData.mediumCount} Medium</span>` : ''}
                ${categoryData.lowCount > 0 ? `<span class="issue-badge low">${categoryData.lowCount} Low</span>` : ''}
                ${categoryData.issueCount === 0 ? `<span class="issue-badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success);">No Issues</span>` : ''}
            </div>
        `;

        return card;
    },

    /**
     * Create a recommendation card element
     * @param {object} recommendation - Recommendation data
     * @returns {HTMLElement} - Recommendation card element
     */
    createRecommendationCard(recommendation) {
        const card = document.createElement('div');
        card.className = `recommendation-card ${recommendation.priority.toLowerCase()}`;

        card.innerHTML = `
            <div class="recommendation-header">
                <h4 class="recommendation-title">${recommendation.title}</h4>
                <span class="priority-badge ${recommendation.priority.toLowerCase()}">${recommendation.priority}</span>
            </div>
            <p class="recommendation-description">${recommendation.description}</p>
            <div class="recommendation-meta">
                <span>📁 ${this.formatCategoryName(recommendation.category)}</span>
                <span>⏱️ ${recommendation.estimatedHours}h</span>
                <span>🎯 ${recommendation.effortLevel.replace('_', ' ')}</span>
            </div>
        `;

        return card;
    },

    /**
     * Create a history item element
     * @param {object} audit - Audit data
     * @returns {HTMLElement} - History item element
     */
    createHistoryCard(audit) {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.auditId = audit.id;

        const rating = this.getScoreRating(audit.overallScore || 0);
        const date = new Date(audit.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const statusBadge = audit.status === 'COMPLETED'
            ? `<span class="score-circle ${rating}" style="width: 60px; height: 60px; font-size: 1.25rem; border-width: 4px;">${audit.overallScore}</span>`
            : `<span class="stat-value">${audit.status}</span>`;

        const autoFixLink = audit.status === 'COMPLETED'
            ? `<a href="/api/autofix/${audit.id}/review" target="_blank" onclick="event.stopPropagation()" style="font-size:0.75rem; color:#d97706; font-weight:600; white-space:nowrap; text-decoration:none; padding: 4px 8px; border: 1px solid #d97706; border-radius: 4px; margin-right: 8px;">⚡ Auto-Fix</a>`
            : '';

        item.innerHTML = `
            <div class="history-info">
                <div class="history-domain">${audit.domain || audit.targetUrl}</div>
                <div class="history-meta">${date}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                ${autoFixLink}
                ${statusBadge}
            </div>
        `;

        // Make clickable if completed
        if (audit.status === 'COMPLETED') {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                if (window.app && window.app.loadAuditById) {
                    window.app.loadAuditById(audit.id);
                }
            });
        }

        return item;
    },

    /**
     * Create a toast notification element
     * @param {string} message - Toast message
     * @param {string} type - Toast type (success, error, warning)
     * @param {number} duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
     * @returns {HTMLElement} - Toast element
     */
    createToast(message, type = 'success', duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        toast.innerHTML = `
            <span class="toast-message">${message}</span>
            <button class="btn-icon" onclick="this.parentElement.remove()" title="Dismiss">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        // Auto-dismiss after duration
        if (duration > 0) {
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(400px)';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        return toast;
    },

    /**
     * Show a toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type (success, error, warning)
     * @param {number} duration - Auto-dismiss duration in ms
     */
    showToast(message, type = 'success', duration = 5000) {
        const container = document.getElementById('toastContainer');
        const toast = this.createToast(message, type, duration);
        container.appendChild(toast);
    },

    /**
     * Update progress bar
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} message - Progress message
     * @param {string} status - Audit status
     */
    updateProgress(progress, message = '', status = '') {
        const progressBar = document.getElementById('progressBar');
        const progressPercent = document.getElementById('progressPercent');
        const progressMessage = document.getElementById('progressMessage');
        const auditStatus = document.getElementById('auditStatus');

        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        if (progressPercent) {
            progressPercent.textContent = `${progress}%`;
        }

        if (progressMessage && message) {
            progressMessage.textContent = message;
        }

        if (auditStatus && status) {
            auditStatus.textContent = status;
        }
    },

    /**
     * Format date to readable string
     * @param {string} dateString - ISO date string
     * @returns {string} - Formatted date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Create empty state message
     * @param {string} message - Empty state message
     * @returns {HTMLElement} - Empty state element
     */
    createEmptyState(message) {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.innerHTML = `<p>${message}</p>`;
        return div;
    }
};
