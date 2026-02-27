import express from 'express';
import { PrismaClient } from '@prisma/client';
import { AutoFixEngine } from '../../services/autofix/AutoFixEngine.js';
import { successResponse, errorResponse } from '../../utils/responseFormatter.js';
import logger from '../../config/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

function getEngine() {
  const projectId = process.env.SANITY_PROJECT_ID || 'rtt3hnlz';
  const dataset = process.env.SANITY_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!token) throw new Error('SANITY_API_TOKEN environment variable is not set');
  return new AutoFixEngine({ projectId, dataset, token });
}

// ============================================================================
// GET /api/autofix/:auditId/review
// Interactive HTML review page — all findings with inline Proposal / Fix it.
// ============================================================================
router.get('/:auditId/review', async (req, res, next) => {
  try {
    const { auditId } = req.params;

    const audit = await prisma.seoAudit.findUnique({
      where: { id: auditId },
      include: { results: true },
    });
    if (!audit) return res.status(404).send('<h1>Audit not found</h1>');

    // Auto-generate fixes if none exist yet (requires token)
    if (process.env.SANITY_API_TOKEN) {
      const existing = await prisma.autoFix.count({ where: { auditId } });
      if (existing === 0) {
        try {
          const engine = getEngine();
          await engine.generateFixes(auditId);
        } catch (e) {
          logger.warn({ err: e }, 'Auto-generate fixes failed on review load');
        }
      }
    }

    const fixes = await prisma.autoFix.findMany({ where: { auditId } });
    // Build a lookup: issueType → [fix, ...] (multiple for per-page issues)
    const fixByIssueType = {};
    for (const f of fixes) {
      if (!fixByIssueType[f.issueType]) fixByIssueType[f.issueType] = [];
      fixByIssueType[f.issueType].push(f);
    }

    const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    const SEV_COLOR = {
      critical: '#dc2626',
      high:     '#ea580c',
      medium:   '#d97706',
      low:      '#6b7280',
    };
    const CAT_LABEL = {
      TECHNICAL_SEO:      'Technical SEO',
      ON_PAGE_SEO:        'On-Page SEO',
      CONTENT_QUALITY:    'Content Quality',
      PERFORMANCE:        'Performance',
      AUTHORITY_BACKLINKS:'Authority & Backlinks',
      LOCAL_SEO:          'Local SEO',
    };

    // Sort results by category score ascending (worst first)
    const results = [...audit.results].sort((a, b) => a.categoryScore - b.categoryScore);

    let categorySections = '';
    for (const result of results) {
      const issues = Array.isArray(result.issues)
        ? result.issues
        : JSON.parse(result.issues || '[]');
      if (!issues.length) continue;

      const sorted = [...issues].sort(
        (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
      );

      let issueCards = '';
      for (const issue of sorted) {
        const issueFixes = fixByIssueType[issue.type] || [];
        const sevColor = SEV_COLOR[issue.severity] || '#6b7280';

        // Evidence list
        let evidenceHtml = '';
        if (Array.isArray(issue.evidence) && issue.evidence.length) {
          const items = issue.evidence.slice(0, 5).map(e =>
            `<li><span class="ev-url">${escHtml(e.url || '')}</span>${e.detail ? ` — ${escHtml(e.detail)}` : ''}</li>`
          ).join('');
          evidenceHtml = `<ul class="evidence">${items}</ul>`;
        } else if (Array.isArray(issue.examples) && issue.examples.length) {
          const items = issue.examples.slice(0, 5).map(u => {
            if (u && typeof u === 'object') {
              return `<li><span class="ev-url">${escHtml(u.url || '')}</span>${u.detail ? ` — ${escHtml(u.detail)}` : ''}</li>`;
            }
            return `<li><span class="ev-url">${escHtml(String(u))}</span></li>`;
          }).join('');
          evidenceHtml = `<ul class="evidence">${items}</ul>`;
        }

        // Proposal block — one per fix record (multiple for per-page issues)
        const renderFixProposal = (fix) => {
          const statusClass = fix.status === 'PUBLISHED' ? 'status-published'
                            : fix.status === 'APPLIED'   ? 'status-applied'
                            : fix.status === 'REJECTED'  ? 'status-rejected'
                            : fix.status === 'FAILED'    ? 'status-failed'
                            : 'status-pending';
          const statusLabel = fix.status === 'PUBLISHED' ? '✓ Live on website'
                            : fix.status === 'APPLIED'   ? '✓ Draft in Sanity Studio'
                            : fix.status === 'REJECTED'  ? '✗ Dismissed'
                            : fix.status === 'FAILED'    ? '⚠ Failed — retry below'
                            : 'Pending review';

          const canAct = fix.status === 'PENDING' || fix.status === 'FAILED' || fix.status === 'APPROVED';
          const draftBtn = canAct
            ? `<button class="btn-fix" data-fix-id="${fix.id}" onclick="applyFix(this)" title="Creates a draft in Sanity Studio for review before publishing">Fix it (draft) →</button>`
            : '';
          const publishBtn = canAct
            ? `<button class="btn-publish" data-fix-id="${fix.id}" onclick="publishFix(this)" title="Applies the fix directly to your live website — no Studio step needed">Publish live ⚡</button>`
            : '';
          const rejectBtn = canAct
            ? `<button class="btn-reject" data-fix-id="${fix.id}" onclick="rejectFix(this)">Dismiss</button>`
            : '';

          const toggleLabel = fix.status === 'PUBLISHED' ? '&#x26A1; Auto-applied &#x2014; live on website'
                            : fix.status === 'APPLIED'   ? '&#x2713; Draft created in Studio'
                            : '&#x1F4A1; Proposal available';

          const pageContext = fix.pageUrl
            ? `<div class="proposal-page">Page: <a href="${escHtml(fix.pageUrl)}" target="_blank">${escHtml(fix.pageUrl)}</a></div>`
            : '';

          const pagePathLabel = (() => { try { return fix.pageUrl ? new URL(fix.pageUrl).pathname : ''; } catch { return fix.pageUrl || ''; } })();
          return `
            <div class="proposal-toggle" onclick="toggleProposal(this)">
              <span class="proposal-label">${toggleLabel}${pagePathLabel ? ` <span style="font-size:11px;opacity:.7;">— ${escHtml(pagePathLabel)}</span>` : ''}</span>
              <span class="proposal-arrow">&#x25BE;</span>
            </div>
            <div class="proposal-body" style="display:none">
              <div class="proposal-field">Field: <code>${escHtml(fix.fieldPath)}</code> <span class="fix-status ${statusClass}">${statusLabel}</span></div>
              ${pageContext}
              <div class="proposal-values">
                <div class="val-block">
                  <div class="val-label">Current value</div>
                  <div class="val-text current">${escHtml(fix.currentValue || '(empty)')}</div>
                </div>
                <div class="val-arrow">→</div>
                <div class="val-block">
                  <div class="val-label">Proposed value</div>
                  ${canAct
                    ? `<textarea class="val-text proposed editable" id="proposed-${fix.id}" rows="3">${escHtml(fix.proposedValue)}</textarea>`
                    : `<div class="val-text proposed">${escHtml(fix.proposedValue)}</div>`}
                </div>
              </div>
              <div class="proposal-actions">${publishBtn}${draftBtn}${rejectBtn}</div>
              <div class="fix-feedback" id="feedback-${fix.id}"></div>
            </div>`;
        };

        let proposalHtml = '';
        if (issueFixes.length > 0) {
          try { proposalHtml = issueFixes.map(renderFixProposal).join(''); }
          catch { proposalHtml = ''; }
        }

        issueCards += `
          <div class="issue-card" id="issue-${escHtml(issue.type)}">
            <div class="issue-header">
              <span class="sev-badge" style="background:${sevColor}">${escHtml(issue.severity)}</span>
              <span class="issue-title">${escHtml(issue.title || issue.type)}</span>
            </div>
            ${issue.description ? `<p class="issue-desc">${escHtml(issue.description)}</p>` : ''}
            ${issue.recommendation ? `<div class="recommendation"><strong>Recommendation:</strong> ${escHtml(issue.recommendation)}</div>` : ''}
            ${evidenceHtml}
            ${proposalHtml}
          </div>`;
      }

      const scoreColor = result.categoryScore >= 70 ? '#16a34a'
                       : result.categoryScore >= 50 ? '#d97706'
                       : '#dc2626';

      categorySections += `
        <section class="category">
          <div class="cat-header">
            <h2>${escHtml(CAT_LABEL[result.category] || result.category)}</h2>
            <span class="cat-score" style="color:${scoreColor}">${result.categoryScore}/100</span>
          </div>
          ${issueCards}
        </section>`;
    }

    const overallColor = audit.overallScore >= 70 ? '#16a34a'
                       : audit.overallScore >= 50 ? '#d97706'
                       : '#dc2626';

    const fixableCount  = fixes.filter(f => f.status === 'PENDING' || f.status === 'FAILED' || f.status === 'APPROVED').length;
    const appliedCount  = fixes.filter(f => f.status === 'APPLIED').length;
    const publishedCount = fixes.filter(f => f.status === 'PUBLISHED').length;
    const fixableIds    = fixes
      .filter(f => f.status === 'PENDING' || f.status === 'FAILED' || f.status === 'APPROVED')
      .map(f => f.id);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO Fixes — ${escHtml(audit.domain)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; font-size: 14px; line-height: 1.5; }

  /* Header */
  .page-header { background: #0f172a; color: #fff; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .header-left h1 { font-size: 20px; font-weight: 700; }
  .header-left .meta { color: #94a3b8; font-size: 12px; margin-top: 4px; }
  .score-ring { text-align: center; }
  .score-ring .score-num { font-size: 36px; font-weight: 800; color: ${overallColor}; }
  .score-ring .score-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
  .fix-summary { background: #1e293b; border-radius: 8px; padding: 10px 16px; font-size: 12px; color: #cbd5e1; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .fix-summary strong { color: #fff; }
  .btn-fix-all { background: #7c3aed; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .btn-fix-all:hover { background: #6d28d9; }
  .btn-fix-all:disabled { background: #a78bfa; cursor: default; }

  /* Main */
  .main { max-width: 900px; margin: 0 auto; padding: 24px 16px; }

  /* Category */
  .category { margin-bottom: 32px; }
  .cat-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 2px solid #e2e8f0; margin-bottom: 12px; }
  .cat-header h2 { font-size: 16px; font-weight: 700; color: #0f172a; }
  .cat-score { font-size: 18px; font-weight: 800; }

  /* Issue card */
  .issue-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 10px; }
  .issue-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .sev-badge { color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: .04em; }
  .issue-title { font-weight: 600; font-size: 14px; color: #0f172a; }
  .issue-desc { color: #475569; font-size: 13px; margin-bottom: 8px; }
  .recommendation { background: #f0fdf4; border-left: 3px solid #16a34a; padding: 8px 12px; border-radius: 0 6px 6px 0; font-size: 13px; color: #166534; margin-bottom: 8px; }
  .evidence { padding-left: 16px; margin: 8px 0; }
  .evidence li { font-size: 12px; color: #64748b; margin-bottom: 3px; }
  .ev-url { font-family: monospace; color: #3b82f6; word-break: break-all; }

  /* Proposal */
  .proposal-toggle { display: flex; align-items: center; justify-content: space-between; cursor: pointer; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px; margin-top: 10px; user-select: none; }
  .proposal-toggle:hover { background: #dbeafe; }
  .proposal-label { font-size: 13px; font-weight: 600; color: #1d4ed8; }
  .proposal-arrow { color: #3b82f6; font-size: 12px; transition: transform .2s; }
  .proposal-toggle.open .proposal-arrow { transform: rotate(180deg); }
  .proposal-body { background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px; padding: 14px; }
  .proposal-field { font-size: 12px; color: #64748b; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .proposal-field code { background: #e2e8f0; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
  .proposal-values { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: start; margin-bottom: 12px; }
  .val-block { display: flex; flex-direction: column; gap: 4px; }
  .val-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; }
  .val-text { font-size: 13px; padding: 8px; border-radius: 6px; word-break: break-word; }
  .val-text.current { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .val-text.proposed { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .val-text.editable { resize: vertical; font-family: inherit; border: 1px solid #86efac; background: #f0fdf4; color: #166534; padding: 8px; border-radius: 6px; width: 100%; min-height: 60px; }
  .val-arrow { font-size: 18px; color: #94a3b8; padding-top: 22px; }
  .proposal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .proposal-page { font-size: 12px; color: #64748b; margin-bottom: 8px; }
  .proposal-page a { color: #3b82f6; }

  /* Buttons */
  .btn-publish { background: #7c3aed; color: #fff; border: none; border-radius: 6px; padding: 8px 18px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .15s; }
  .btn-publish:hover { background: #6d28d9; }
  .btn-publish:disabled { background: #a78bfa; cursor: default; }
  .btn-fix { background: #16a34a; color: #fff; border: none; border-radius: 6px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s; }
  .btn-fix:hover { background: #15803d; }
  .btn-fix:disabled { background: #86efac; cursor: default; }
  .btn-reject { background: #fff; color: #64748b; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; transition: all .15s; }
  .btn-reject:hover { background: #f1f5f9; color: #dc2626; border-color: #fca5a5; }

  /* Status badges */
  .fix-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: .04em; }
  .status-published { background: #ede9fe; color: #5b21b6; }
  .status-applied  { background: #dcfce7; color: #166534; }
  .status-rejected { background: #f1f5f9; color: #64748b; }
  .status-failed   { background: #fff7ed; color: #9a3412; }
  .status-pending  { background: #eff6ff; color: #1d4ed8; }

  /* Feedback */
  .fix-feedback { margin-top: 8px; font-size: 13px; font-weight: 600; }
  .fix-feedback.success { color: #16a34a; }
  .fix-feedback.error   { color: #dc2626; }

  /* Auto-applied banner */
  .autoapplied-banner { background: #ede9fe; border-left: 4px solid #7c3aed; padding: 12px 20px; margin: 0; font-size: 13px; color: #4c1d95; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .autoapplied-banner strong { color: #3b0764; }
  .autoapplied-banner a { color: #6d28d9; font-weight: 600; }

  @media (max-width: 600px) {
    .proposal-values { grid-template-columns: 1fr; }
    .val-arrow { display: none; }
  }
</style>
</head>
<body>

<div class="page-header">
  <div class="header-left">
    <h1>SEO Fix Review — ${escHtml(audit.domain)}</h1>
    <div class="meta">Audit completed ${new Date(audit.completedAt || audit.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
  </div>
  <div class="score-ring">
    <div class="score-num">${audit.overallScore ?? '—'}</div>
    <div class="score-label">Overall Score</div>
  </div>
  <div class="fix-summary">
    <span><strong>${fixableCount}</strong> fix${fixableCount !== 1 ? 'es' : ''} available</span>
    <span><strong>${appliedCount}</strong> draft${appliedCount !== 1 ? 's' : ''} in Studio</span>
    <span><strong>${publishedCount}</strong> live</span>
    ${fixableCount > 0 ? `<button class="btn-fix-all" onclick="fixAll(this)" data-ids="${escHtml(JSON.stringify(fixableIds))}">⚡ Publish all live (${fixableCount})</button>` : ''}
  </div>
</div>

${publishedCount > 0 ? `
<div class="autoapplied-banner">
  <span>&#x26A1;</span>
  <span><strong>${publishedCount} fix${publishedCount !== 1 ? 'es were' : ' was'} automatically applied</strong> to Sanity because the fields were empty — changes are live on the website. Expand the <em>Auto-applied</em> accordions below to review what was changed.</span>
</div>` : ''}

<div class="main">
  ${categorySections || '<p>No issues found.</p>'}
</div>

<script>
function toggleProposal(el) {
  el.classList.toggle('open');
  const body = el.nextElementSibling;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

async function applyFix(btn) {
  const fixId = btn.dataset.fixId;
  const textarea = document.getElementById('proposed-' + fixId);
  const proposedValue = textarea ? textarea.value : null;
  const feedback = document.getElementById('feedback-' + fixId);
  btn.disabled = true;
  btn.textContent = 'Applying…';
  feedback.className = 'fix-feedback';
  feedback.textContent = '';
  try {
    const res = await fetch('/api/autofix/fixes/' + fixId + '/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposedValue }),
    });
    const data = await res.json();
    if (data.success) {
      btn.textContent = '✓ Draft created';
      btn.style.background = '#15803d';
      _hideOtherActions(btn, fixId);
      const statusEl = btn.closest('.proposal-body').querySelector('.fix-status');
      if (statusEl) { statusEl.className = 'fix-status status-applied'; statusEl.textContent = '✓ Draft in Sanity Studio'; }
      feedback.className = 'fix-feedback success';
      feedback.textContent = 'Draft created in Sanity Studio. Go to Studio to review and publish.';
    } else {
      btn.disabled = false;
      btn.textContent = 'Fix it (draft) →';
      feedback.className = 'fix-feedback error';
      feedback.textContent = data.error?.message || 'Failed. Try again.';
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Fix it (draft) →';
    feedback.className = 'fix-feedback error';
    feedback.textContent = 'Network error. Try again.';
  }
}

async function publishFix(btn) {
  const fixId = btn.dataset.fixId;
  const textarea = document.getElementById('proposed-' + fixId);
  const proposedValue = textarea ? textarea.value : null;
  const feedback = document.getElementById('feedback-' + fixId);
  btn.disabled = true;
  btn.textContent = 'Publishing…';
  feedback.className = 'fix-feedback';
  feedback.textContent = '';
  try {
    const res = await fetch('/api/autofix/fixes/' + fixId + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposedValue }),
    });
    const data = await res.json();
    if (data.success) {
      btn.textContent = '✓ Live ⚡';
      btn.style.background = '#5b21b6';
      _hideOtherActions(btn, fixId);
      const statusEl = btn.closest('.proposal-body').querySelector('.fix-status');
      if (statusEl) { statusEl.className = 'fix-status status-published'; statusEl.textContent = '✓ Live on website'; }
      feedback.className = 'fix-feedback success';
      feedback.textContent = 'Fix is now live on your website.';
    } else {
      btn.disabled = false;
      btn.textContent = 'Publish live ⚡';
      feedback.className = 'fix-feedback error';
      feedback.textContent = data.error?.message || 'Failed. Try again.';
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Publish live ⚡';
    feedback.className = 'fix-feedback error';
    feedback.textContent = 'Network error. Try again.';
  }
}

async function fixAll(btn) {
  const ids = JSON.parse(btn.dataset.ids || '[]');
  if (!ids.length) return;
  btn.disabled = true;
  btn.textContent = 'Publishing\u2026';
  let done = 0;
  for (const fixId of ids) {
    try {
      const res = await fetch('/api/autofix/fixes/' + fixId + '/publish', { method: 'POST' });
      const data = await res.json();
      if (data.success) done++;
    } catch (e) { /* skip failed */ }
    btn.textContent = 'Publishing\u2026 ' + done + '/' + ids.length;
  }
  btn.textContent = '\u2713 ' + done + '/' + ids.length + ' published live';
  btn.style.background = '#5b21b6';
  setTimeout(() => location.reload(), 800);
}

async function rejectFix(btn) {
  const fixId = btn.dataset.fixId;
  btn.disabled = true;
  try {
    const res = await fetch('/api/autofix/fixes/' + fixId + '/reject', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const card = btn.closest('.issue-card');
      const proposalToggle = card.querySelector('.proposal-toggle');
      const proposalBody = card.querySelector('.proposal-body');
      if (proposalToggle) proposalToggle.style.display = 'none';
      if (proposalBody) proposalBody.style.display = 'none';
    } else {
      btn.disabled = false;
    }
  } catch (e) {
    btn.disabled = false;
  }
}

function _hideOtherActions(activeBtn, fixId) {
  const actions = activeBtn.closest('.proposal-actions');
  if (!actions) return;
  actions.querySelectorAll('button').forEach(b => {
    if (b !== activeBtn) b.style.display = 'none';
  });
}
</script>

</body>
</html>`;

    // Allow inline scripts/styles on this admin-only page
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// GET /api/autofix/:auditId/fixes
// List all AutoFix records for an audit.
// Query params: ?status=PENDING|APPROVED|REJECTED|APPLIED|FAILED
// ============================================================================
router.get('/:auditId/fixes', async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const { status } = req.query;

    const where = { auditId };
    if (status) where.status = status.toUpperCase();

    const fixes = await prisma.autoFix.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    });

    res.json(successResponse(fixes, `Found ${fixes.length} fix${fixes.length !== 1 ? 'es' : ''}`));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/:auditId/fixes/generate
// Scan audit results and generate AutoFix records for fixable issues.
// ============================================================================
router.post('/:auditId/fixes/generate', async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const engine = getEngine();
    const count = await engine.generateFixes(auditId);
    res.json(successResponse({ auditId, generated: count }, `Generated ${count} potential fix${count !== 1 ? 'es' : ''}`));
  } catch (err) {
    logger.error({ err, auditId: req.params.auditId }, 'Failed to generate fixes');
    next(err);
  }
});

// ============================================================================
// GET /api/autofix/fixes/:fixId
// Get a single fix by ID.
// ============================================================================
router.get('/fixes/:fixId', async (req, res, next) => {
  try {
    const fix = await prisma.autoFix.findUnique({ where: { id: req.params.fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));
    res.json(successResponse(fix));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/fix
// One-step: approve + apply in a single call (for the review UI "Fix it" button).
// ============================================================================
router.post('/fixes/:fixId/fix', async (req, res, next) => {
  try {
    const { fixId } = req.params;
    const fix = await prisma.autoFix.findUnique({ where: { id: fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));
    if (fix.status === 'APPLIED') {
      return res.json(successResponse({ status: 'APPLIED' }, 'Already applied'));
    }
    if (fix.status === 'REJECTED') {
      return res.status(400).json(errorResponse('Fix has been rejected', 'INVALID_STATUS'));
    }

    // Approve first if still PENDING or FAILED
    if (fix.status !== 'APPROVED') {
      await prisma.autoFix.update({ where: { id: fixId }, data: { status: 'APPROVED' } });
    }

    // If the caller sent an edited proposed value, persist it before applying
    const { proposedValue: overrideValue } = req.body || {};
    if (overrideValue !== undefined && overrideValue !== fix.proposedValue) {
      await prisma.autoFix.update({ where: { id: fixId }, data: { proposedValue: overrideValue } });
    }

    const engine = getEngine();
    const result = await engine.applyFix(fixId);
    res.json(successResponse(result, result.message));
  } catch (err) {
    logger.error({ err, fixId: req.params.fixId }, 'Failed to one-step fix');
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/publish
// One-step: apply fix directly to the live published Sanity document.
// No draft is created — change is immediately live on the website.
// ============================================================================
router.post('/fixes/:fixId/publish', async (req, res, next) => {
  try {
    const { fixId } = req.params;
    const fix = await prisma.autoFix.findUnique({ where: { id: fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));
    if (fix.status === 'PUBLISHED') {
      return res.json(successResponse({ status: 'PUBLISHED' }, 'Already published live'));
    }
    if (fix.status === 'REJECTED') {
      return res.status(400).json(errorResponse('Fix has been dismissed', 'INVALID_STATUS'));
    }

    // If the caller sent an edited proposed value, persist it before publishing
    const { proposedValue: overrideValue } = req.body || {};
    if (overrideValue !== undefined && overrideValue !== fix.proposedValue) {
      await prisma.autoFix.update({ where: { id: fixId }, data: { proposedValue: overrideValue } });
    }

    const engine = getEngine();
    const result = await engine.publishFix(fixId);
    res.json(successResponse(result, result.message));
  } catch (err) {
    logger.error({ err, fixId: req.params.fixId }, 'Failed to publish fix live');
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/approve
// ============================================================================
router.post('/fixes/:fixId/approve', async (req, res, next) => {
  try {
    const fix = await prisma.autoFix.findUnique({ where: { id: req.params.fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));
    if (fix.status !== 'PENDING') {
      return res.status(400).json(errorResponse(`Cannot approve a fix with status ${fix.status}`, 'INVALID_STATUS'));
    }
    const updated = await prisma.autoFix.update({
      where: { id: req.params.fixId },
      data: { status: 'APPROVED' },
    });
    res.json(successResponse(updated, 'Fix approved — ready to apply'));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/reject
// ============================================================================
router.post('/fixes/:fixId/reject', async (req, res, next) => {
  try {
    const fix = await prisma.autoFix.findUnique({ where: { id: req.params.fixId } });
    if (!fix) return res.status(404).json(errorResponse('Fix not found', 'NOT_FOUND'));
    const updated = await prisma.autoFix.update({
      where: { id: req.params.fixId },
      data: { status: 'REJECTED' },
    });
    res.json(successResponse(updated, 'Fix rejected'));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /api/autofix/fixes/:fixId/apply
// Apply an APPROVED fix to Sanity (creates a draft).
// ============================================================================
router.post('/fixes/:fixId/apply', async (req, res, next) => {
  try {
    const engine = getEngine();
    const result = await engine.applyFix(req.params.fixId);
    res.json(successResponse(result, result.message));
  } catch (err) {
    logger.error({ err, fixId: req.params.fixId }, 'Failed to apply fix');
    next(err);
  }
});

// HTML escape helper (server-side only, not exported)
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default router;
