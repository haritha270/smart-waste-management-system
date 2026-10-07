/**
 * Admin Reports list: full filters, sorting, worker assignment and status updates.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, statusBadge, priorityBadge, statusLabel, timeAgo, formatDate,
  skeletonRows, emptyState, modal, toast, setLoading, avatar, confirmDialog,
} from '../../ui.js';

let reports = [];
let workers = [];
let filters = {
  status: 'all',
  priority: 'all',
  q: '',
  sort: 'newest',
};

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>Manage Complaints</h2>
        <p class="desc">Filter, search, assign municipal collection workers, and update or clear complaints.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-secondary" id="clear-resolved-btn" type="button">
          ${icon('trash-2')} Clear Completed
        </button>
        <a class="btn btn-primary" href="#/admin/workers">${icon('user-plus')} Manage Workers</a>
        <a class="btn btn-soft" href="#/map">${icon('map')} Live map</a>
      </div>
    </div>

    <div class="filters">
      <div class="search input-icon">
        ${icon('search')}
        <input class="input" type="search" id="r-search" placeholder="Search complaint ID, title, citizen, locality…" value="${escapeHtml(filters.q)}" />
      </div>

      <select class="select" id="r-status" style="width:160px">
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="assigned">Assigned</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
      </select>

      <select class="select" id="r-priority" style="width:150px">
        <option value="all">All priorities</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <select class="select" id="r-sort" style="width:150px">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="priority">By priority</option>
      </select>

      <button class="btn btn-ghost btn-sm" id="r-reset" title="Reset filters">${icon('refresh')} Reset</button>
    </div>

    <div class="flex-between wrap" style="margin-bottom:12px;font-size:0.86rem">
      <span class="muted" id="r-count">Loading complaints…</span>
      <div class="flex-center gap-8" id="quick-chips">
        <button class="chip" data-quick="pending">Pending</button>
        <button class="chip" data-quick="assigned">Assigned</button>
        <button class="chip" data-quick="in_progress">In Progress</button>
        <button class="chip" data-quick="resolved">Resolved</button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Complaint</th>
              <th>Citizen</th>
              <th>Location</th>
              <th>Assigned Worker</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Reported</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody id="r-body"><tr><td colspan="8">${skeletonRows(6)}</td></tr></tbody>
        </table>
      </div>
    </div>`;
}

async function load() {
  const body = document.getElementById('r-body');
  if (!body) return;
  try {
    const params = new URLSearchParams();
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.priority !== 'all') params.set('priority', filters.priority);
    if (filters.q) params.set('q', filters.q);
    params.set('sort', filters.sort);

    const [repData, wrkData] = await Promise.all([
      api.get(`/admin/reports?${params.toString()}`),
      api.get('/admin/workers'),
    ]);

    reports = repData.reports || [];
    workers = wrkData.workers || [];

    document.getElementById('r-count').innerHTML = `<b>${reports.length}</b> complaint${reports.length === 1 ? '' : 's'} match your filters`;

    if (!reports.length) {
      body.innerHTML = `<tr><td colspan="8">${emptyState({
        iconName: 'search', title: 'No complaints found',
        text: 'Adjust the filters or clear the search to see more complaints.',
        action: `<button class="btn btn-secondary" id="clear-all">${icon('refresh')} Clear filters</button>`,
      })}</td></tr>`;
      const c = document.getElementById('clear-all');
      if (c) c.onclick = resetFilters;
      return;
    }

    body.innerHTML = reports.map((r) => `
      <tr>
        <td>
          <div class="cell-title">${escapeHtml(r.code)}</div>
          <div class="cell-sub" title="${escapeHtml(r.description)}">${escapeHtml(r.title.length > 36 ? r.title.slice(0, 35) + '…' : r.title)}</div>
        </td>
        <td>
          <div class="flex-center" style="gap:8px">${avatar(r.reporter.name, 'avatar-sm')}<span>${escapeHtml(r.reporter.name)}</span></div>
        </td>
        <td>
          <div>${escapeHtml(r.locality || '—')}</div>
          <div class="cell-sub">${escapeHtml(r.address)}</div>
        </td>
        <td>
          ${r.worker ? `
            <div><b>${escapeHtml(r.worker.name)}</b></div>
            <div class="cell-sub">${escapeHtml(r.worker.code)} · ${escapeHtml(r.worker.zone || '')}</div>
          ` : `
            <span class="badge badge-low">Unassigned</span>
          `}
        </td>
        <td>${priorityBadge(r.priority)}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="cell-sub">${timeAgo(r.reportedAt)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-primary btn-sm" data-assign="${escapeHtml(r.code)}" title="Assign / Reassign Worker">
              ${icon('user-plus')} ${r.worker ? 'Reassign' : 'Assign'}
            </button>
            <button class="btn btn-secondary btn-sm" data-status="${escapeHtml(r.code)}">
              ${icon('refresh')} Status
            </button>
            <a class="btn btn-ghost btn-sm" href="#/reports/${escapeHtml(r.code)}" title="Open details">
              ${icon('eye')}
            </a>
            <button class="btn btn-ghost btn-sm delete-report-btn" data-code="${escapeHtml(r.code)}" title="Clear / Delete Complaint" style="color:#ef4444">
              ${icon('trash-2')}
            </button>
          </div>
        </td>
      </tr>`).join('');

    body.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => openStatus(b.dataset.status)));
    body.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => openAssignModal(b.dataset.assign)));
    body.querySelectorAll('.delete-report-btn').forEach((b) => {
      b.addEventListener('click', async () => {
        const code = b.dataset.code;
        const confirmed = await confirmDialog({
          title: `Clear & Delete Complaint · #${code}`,
          message: `Are you sure you want to permanently clear and delete complaint #${code}? This action cannot be undone.`,
          confirmText: 'Yes, Delete Complaint',
          cancelText: 'Cancel',
          danger: true,
        });
        if (!confirmed) return;

        setLoading(b, true, '');
        try {
          const res = await api.delete(`/admin/reports/${encodeURIComponent(code)}`);
          toast(res.message || 'Complaint deleted successfully.', 'success');
          await load();
        } catch (err) {
          toast(err.message, 'error');
          setLoading(b, false);
        }
      });
    });
  } catch (err) {
    toast(err.message, 'error');
    body.innerHTML = `<tr><td colspan="8">${emptyState({ iconName: 'alert-circle', title: 'Failed to load complaints', text: err.message })}</td></tr>`;
  }
}

/* ------------------------------------------------------------------ */
/* Assign Worker Modal                                                 */
/* ------------------------------------------------------------------ */

function openAssignModal(code) {
  const report = reports.find((r) => r.code === code);
  if (!report) return;

  const activeWorkers = workers.filter((w) => w.status === 'active');
  const m = modal({
    title: `Assign Collection Worker · #${code}`,
    body: `
      <div class="alert alert-info" style="margin-bottom:16px">
        ${icon('info')} <span>Assign a sanitation worker to collect waste for <b>"${escapeHtml(report.title)}"</b> at ${escapeHtml(report.locality || report.address)}. The worker will receive an immediate municipal work order dispatch email with live GPS navigation and completion buttons.</span>
      </div>

      <div class="field">
        <label>Select Worker <span class="req">*</span></label>
        <select class="select" id="assign-worker-select">
          <option value="">-- Choose an active worker --</option>
          ${activeWorkers.map((w) => `
            <option value="${w.id}" ${report.assignedWorkerId === w.id ? 'selected' : ''}>
              ${escapeHtml(w.name)} (${escapeHtml(w.code)}) - Zone: ${escapeHtml(w.zone || 'Central')} [${w.activeTasks} active tasks]
            </option>
          `).join('')}
        </select>
      </div>

      <div class="field" style="margin-bottom:0">
        <label>Instructions / Note for Worker <span class="hint">optional</span></label>
        <textarea class="textarea" id="assign-note" placeholder="e.g. Please clear this spot on priority before noon." style="min-height:75px"></textarea>
      </div>`,
    footer: `
      <button class="btn btn-secondary btn-sm" data-close>Cancel</button>
      <button class="btn btn-primary btn-sm" id="do-assign">${icon('check')} Assign &amp; Send Mail</button>`,
  });

  const btn = m.el.querySelector('#do-assign');
  btn.onclick = async () => {
    const workerId = m.el.querySelector('#assign-worker-select').value;
    const note = m.el.querySelector('#assign-note').value;
    if (!workerId) {
      toast('Please select a worker to assign.', 'warning');
      return;
    }

    setLoading(btn, true, 'Assigning…');
    try {
      const res = await api.post(`/admin/reports/${encodeURIComponent(code)}/assign`, { workerId, note });
      toast(res.message, 'success', 'Worker assigned');
      m.close();
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Status change modal                                                 */
/* ------------------------------------------------------------------ */

function openStatus(code) {
  const report = reports.find((r) => r.code === code);
  if (!report) return;

  const m = modal({
    title: `Update Status · ${code}`,
    body: `
      <div class="alert alert-info">${icon('info')}<span>Current status: <b>${statusLabel(report.status)}</b></span></div>
      <div class="field">
        <label>New Status <span class="req">*</span></label>
        <select class="select" id="new-status">
          ${['pending', 'assigned', 'in_progress', 'resolved']
            .map((s) => `<option value="${s}" ${s === report.status ? 'selected' : ''}>${statusLabel(s)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Remarks / Note for Citizen <span class="hint">optional</span></label>
        <textarea class="textarea" id="status-note" placeholder="Explain the resolution or progress update…" style="min-height:70px">${escapeHtml(report.adminNote || '')}</textarea>
      </div>`,
    footer: `
      <button class="btn btn-secondary btn-sm" data-close>Cancel</button>
      <button class="btn btn-primary btn-sm" id="do-status">${icon('check')} Save &amp; Notify</button>`,
  });

  const btn = m.el.querySelector('#do-status');
  btn.onclick = async () => {
    const status = m.el.querySelector('#new-status').value;
    const note = m.el.querySelector('#status-note').value;
    setLoading(btn, true, 'Saving…');
    try {
      const res = await api.patch(`/admin/reports/${encodeURIComponent(code)}/status`, { status, note });
      toast(res.message, 'success');
      m.close();
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  };
}

function resetFilters() {
  filters = { status: 'all', priority: 'all', q: '', sort: 'newest' };
  document.getElementById('r-search').value = '';
  document.getElementById('r-status').value = 'all';
  document.getElementById('r-priority').value = 'all';
  document.getElementById('r-sort').value = 'newest';
  document.querySelectorAll('#quick-chips .chip').forEach((c) => c.classList.remove('active'));
  load();
}

async function mount(root) {
  const initial = new URLSearchParams(location.hash.split('?')[1] || '');
  if (initial.get('status')) {
    filters.status = initial.get('status');
    document.getElementById('r-status').value = filters.status;
  }

  load();

  document.getElementById('r-search').addEventListener('input', (e) => {
    filters.q = e.target.value;
    clearTimeout(mount._t);
    mount._t = setTimeout(load, 260);
  });
  document.getElementById('r-status').addEventListener('change', (e) => { filters.status = e.target.value; syncQuick(); load(); });
  document.getElementById('r-priority').addEventListener('change', (e) => { filters.priority = e.target.value; load(); });
  document.getElementById('r-sort').addEventListener('change', (e) => { filters.sort = e.target.value; load(); });
  document.getElementById('r-reset').addEventListener('click', resetFilters);

  document.getElementById('clear-resolved-btn')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Clear Completed Complaints',
      message: 'Are you sure you want to clear and delete ALL completed/resolved complaints from the system?\n\nThis will remove closed records and clean up the database.',
      confirmText: 'Yes, Clear All Completed',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const res = await api.post('/admin/reports/clear-resolved');
      toast(res.message, 'success');
      await load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.querySelectorAll('#quick-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      filters.status = filters.status === chip.dataset.quick ? 'all' : chip.dataset.quick;
      document.getElementById('r-status').value = filters.status;
      syncQuick();
      load();
    });
  });

  function syncQuick() {
    document.querySelectorAll('#quick-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.quick === filters.status));
  }
}

export default { render, mount };
