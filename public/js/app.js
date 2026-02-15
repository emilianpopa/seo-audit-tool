/**
 * Main Application Logic for SEO Audit Tool
 */

const app = {
    // Application state
    currentAuditId: null,
    pollingInterval: null,
    currentAuditData: null,

    /**
     * Initialize the application
     */
    init() {
        console.log('SEO Audit Tool initialized');

        // Setup event listeners
        this.setupEventListeners();

        // Load audit history
        this.loadHistory();

        // Check if there's an audit ID in session storage
        const savedAuditId = sessionStorage.getItem('currentAuditId');
        if (savedAuditId) {
            this.resumeAudit(savedAuditId);
        }
    },

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Audit form submission
        const auditForm = document.getElementById('auditForm');
        auditForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAuditSubmit();
        });

        // New audit button
        const newAuditBtn = document.getElementById('newAuditBtn');
        if (newAuditBtn) {
            newAuditBtn.addEventListener('click', () => {
                this.resetToAuditForm();
            });
        }

        // Download buttons
        const downloadPdf = document.getElementById('downloadPdf');
        const downloadDocx = document.getElementById('downloadDocx');

        if (downloadPdf) {
            downloadPdf.addEventListener('click', () => {
                this.handleDownload('pdf');
            });
        }

        if (downloadDocx) {
            downloadDocx.addEventListener('click', () => {
                this.handleDownload('docx');
            });
        }

        // Refresh history button
        const refreshHistory = document.getElementById('refreshHistory');
        if (refreshHistory) {
            refreshHistory.addEventListener('click', () => {
                this.loadHistory();
            });
        }
    },

    /**
     * Handle audit form submission
     */
    async handleAuditSubmit() {
        const form = document.getElementById('auditForm');
        const startBtn = document.getElementById('startBtn');
        const btnText = startBtn.querySelector('.btn-text');
        const btnLoader = startBtn.querySelector('.btn-loader');

        // Get form values
        const websiteUrl = document.getElementById('websiteUrl').value;
        const maxPages = parseInt(document.getElementById('maxPages').value) || 50;
        const crawlDepth = parseInt(document.getElementById('crawlDepth').value) || 3;

        // Validate URL
        try {
            new URL(websiteUrl);
        } catch (error) {
            Components.showToast('Please enter a valid URL', 'error');
            return;
        }

        // Disable form
        startBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';

        try {
            // Start audit
            const response = await API.startAudit(websiteUrl, {
                maxPages,
                crawlDepth
            });

            console.log('Audit started:', response);

            // Save audit ID
            this.currentAuditId = response.data.auditId;
            sessionStorage.setItem('currentAuditId', this.currentAuditId);

            // Show success toast
            Components.showToast('Audit started successfully!', 'success');

            // Switch to progress view
            this.showProgressView();

            // Start polling
            this.startPolling();

        } catch (error) {
            console.error('Error starting audit:', error);
            Components.showToast(error.message || 'Failed to start audit', 'error');

            // Re-enable form
            startBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        }
    },

    /**
     * Show progress view and hide audit form
     */
    showProgressView() {
        document.getElementById('auditSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('historySection').style.display = 'none';
    },

    /**
     * Show results view and hide progress
     */
    showResultsView() {
        document.getElementById('auditSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('historySection').style.display = 'block';
    },

    /**
     * Reset UI to initial audit form
     */
    resetToAuditForm() {
        // Stop polling
        this.stopPolling();

        // Clear audit data
        this.currentAuditId = null;
        this.currentAuditData = null;
        sessionStorage.removeItem('currentAuditId');

        // Reset form
        const form = document.getElementById('auditForm');
        form.reset();
        const startBtn = document.getElementById('startBtn');
        startBtn.disabled = false;
        startBtn.querySelector('.btn-text').style.display = 'inline';
        startBtn.querySelector('.btn-loader').style.display = 'none';

        // Show audit section
        document.getElementById('auditSection').style.display = 'block';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('historySection').style.display = 'block';

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /**
     * Start polling for audit status
     */
    startPolling() {
        // Initial poll
        this.pollAuditStatus();

        // Poll every 2 seconds
        this.pollingInterval = setInterval(() => {
            this.pollAuditStatus();
        }, 2000);
    },

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    },

    /**
     * Poll audit status
     */
    async pollAuditStatus() {
        if (!this.currentAuditId) return;

        try {
            const response = await API.getAuditStatus(this.currentAuditId);
            const status = response.data;

            console.log('Audit status:', status);

            // Update progress UI
            const progress = status.progress || 0;
            const statusText = status.status || 'PENDING';

            // Update progress bar
            Components.updateProgress(
                progress,
                this.getProgressMessage(progress, statusText),
                statusText
            );

            // Check if completed
            if (statusText === 'COMPLETED') {
                this.stopPolling();
                Components.showToast('Audit completed!', 'success');
                await this.loadAuditResults();
            }

            // Check if failed
            if (statusText === 'FAILED') {
                this.stopPolling();
                Components.showToast(status.error || 'Audit failed', 'error');
                this.resetToAuditForm();
            }

        } catch (error) {
            console.error('Error polling status:', error);
            // Continue polling even on error (network might be temporarily down)
        }
    },

    /**
     * Get progress message based on progress percentage
     * @param {number} progress - Progress percentage
     * @param {string} status - Audit status
     * @returns {string} - Progress message
     */
    getProgressMessage(progress, status) {
        if (status === 'PENDING') return 'Audit queued, waiting to start...';
        if (progress < 10) return 'Initializing audit...';
        if (progress < 15) return 'Crawling website pages...';
        if (progress < 30) return 'Analyzing technical SEO...';
        if (progress < 45) return 'Analyzing on-page SEO...';
        if (progress < 60) return 'Analyzing content quality...';
        if (progress < 70) return 'Measuring performance metrics...';
        if (progress < 85) return 'Analyzing authority & backlinks...';
        if (progress < 95) return 'Analyzing local SEO...';
        if (progress < 100) return 'Generating recommendations...';
        return 'Finalizing audit report...';
    },

    /**
     * Load audit results and display
     */
    async loadAuditResults() {
        if (!this.currentAuditId) return;

        try {
            const response = await API.getAuditReport(this.currentAuditId);
            const report = response.data;

            console.log('Audit report:', report);

            // Save report data
            this.currentAuditData = report;

            // Display results
            this.displayResults(report);

            // Show results view
            this.showResultsView();

            // Reload history
            this.loadHistory();

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (error) {
            console.error('Error loading audit results:', error);
            Components.showToast('Failed to load audit results', 'error');
        }
    },

    /**
     * Display audit results in the UI
     * @param {object} report - Audit report data
     */
    displayResults(report) {
        // Overall score
        const overallScore = document.getElementById('overallScore');
        const scoreRating = document.getElementById('scoreRating');
        const scoreDomain = document.getElementById('scoreDomain');
        const scoreDate = document.getElementById('scoreDate');

        const rating = Components.getScoreRating(report.overallScore);

        overallScore.textContent = report.overallScore;
        overallScore.className = `score-circle ${rating}`;

        scoreRating.textContent = report.scoreRating;
        scoreRating.className = `score-rating ${rating}`;

        scoreDomain.textContent = report.domain || report.targetUrl;
        scoreDate.textContent = `Analyzed on ${Components.formatDate(report.completedAt)}`;

        // Category scores
        const categoryScores = document.getElementById('categoryScores');
        categoryScores.innerHTML = '';

        const categories = report.categoryScores || {};
        for (const [categoryName, categoryData] of Object.entries(categories)) {
            const card = Components.createCategoryCard(categoryName, categoryData);
            categoryScores.appendChild(card);
        }

        // Recommendations
        const recommendations = document.getElementById('recommendations');
        recommendations.innerHTML = '';

        const topRecommendations = (report.recommendations || []).slice(0, 10);
        if (topRecommendations.length === 0) {
            recommendations.appendChild(
                Components.createEmptyState('No recommendations - your site is perfect!')
            );
        } else {
            topRecommendations.forEach(rec => {
                const card = Components.createRecommendationCard(rec);
                recommendations.appendChild(card);
            });
        }
    },

    /**
     * Handle report download
     * @param {string} format - Report format (pdf or docx)
     */
    async handleDownload(format) {
        if (!this.currentAuditId) {
            Components.showToast('No audit available to download', 'error');
            return;
        }

        try {
            Components.showToast(`Preparing ${format.toUpperCase()} download...`, 'success', 2000);

            await API.downloadReport(this.currentAuditId, format);

            Components.showToast(`${format.toUpperCase()} report downloaded successfully!`, 'success');

        } catch (error) {
            console.error('Download error:', error);
            Components.showToast(`Failed to download ${format.toUpperCase()} report`, 'error');
        }
    },

    /**
     * Load audit history
     */
    async loadHistory() {
        try {
            const response = await API.getAuditHistory(1, 10);
            const audits = response.data || [];

            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';

            if (audits.length === 0) {
                historyList.appendChild(
                    Components.createEmptyState('No audit history yet. Start your first audit above!')
                );
            } else {
                audits.forEach(audit => {
                    const card = Components.createHistoryCard(audit);
                    historyList.appendChild(card);
                });
            }

        } catch (error) {
            console.error('Error loading history:', error);
        }
    },

    /**
     * Load audit by ID (from history)
     * @param {string} auditId - Audit ID
     */
    async loadAuditById(auditId) {
        this.currentAuditId = auditId;
        sessionStorage.setItem('currentAuditId', auditId);

        try {
            // Check status first
            const statusResponse = await API.getAuditStatus(auditId);
            const status = statusResponse.data.status;

            if (status === 'COMPLETED') {
                await this.loadAuditResults();
            } else if (status === 'IN_PROGRESS' || status === 'PENDING') {
                this.showProgressView();
                this.startPolling();
            } else {
                Components.showToast(`Audit status: ${status}`, 'warning');
            }

        } catch (error) {
            console.error('Error loading audit:', error);
            Components.showToast('Failed to load audit', 'error');
        }
    },

    /**
     * Resume audit from session storage
     * @param {string} auditId - Audit ID
     */
    async resumeAudit(auditId) {
        console.log('Resuming audit:', auditId);
        await this.loadAuditById(auditId);
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// Expose app to window for components to access
window.app = app;
