'use strict';

/**
 * Worker Assigned Tasks Page.
 *
 * Provides map tracking, citizen complainant details, live directions,
 * dispatch email viewer (with Yes/No completion buttons),
 * and the "I completed the work" resolution action.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, toast, setLoading, statusBadge, formatDate, timeAgo, emptyState,
  skeletonCards, confirmDialog,
} from '../../ui.js';

let tasks = [];
let activeFilter = 'active';
let searchQuery = '';

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>My Assigned Tasks</h2>
        <p class="desc">View waste collection assignments, contact reporting citizens, navigate to locations, and mark tasks completed.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-secondary" id="open-mailbox-btn" type="button">
          ${icon('mail')} 📬 Dispatch Mailbox
        </button>
        <a class="btn btn-soft" href="#/map">${icon('map')} Open Waste Map</a>
      </div>
    </div>

    <!-- Filters & Search -->
    <div class="filters">
      <div class="search input-icon">
        ${icon('search')}
        <input class="input" type="search" id="task-search" placeholder="Search complaint ID, location, or citizen name…" />
      </div>
      <div class="flex-center gap-8 wrap" id="task-filter-chips">
        <button class="chip active" data-status="active">Active Tasks</button>
        <button class="chip" data-status="all">All</button>
        <button class="chip" data-status="assigned">Assigned</button>
        <button class="chip" data-status="in_progress">In Progress</button>
        <button class="chip" data-status="resolved">Completed</button>
      </div>
    </div>

    <!-- Task Cards Container -->
    <div id="tasks-container">
      <div class="report-grid">
        ${skeletonCards(4)}
      </div>
    </div>

    <!-- Modals Container -->
    <div id="worker-modal-root"></div>`;
}

async function mount() {
  await loadTasks();

  document.getElementById('task-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    paintTasks();
  });

  document.querySelectorAll('#task-filter-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.status;
      document.querySelectorAll('#task-filter-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
      loadTasks();
    });
  });

  document.getElementById('open-mailbox-btn')?.addEventListener('click', () => {
    openMailboxModal();
  });
}

async function loadTasks() {
  try {
    const data = await api.get(`/worker/tasks?status=${activeFilter}`);
    tasks = data.tasks || [];
    paintTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function paintTasks() {
  const container = document.getElementById('tasks-container');
  if (!container) return;

  const filtered = tasks.filter((t) => {
    if (!searchQuery) return true;
    const matchCode = t.code.toLowerCase().includes(searchQuery);
    const matchTitle = t.title.toLowerCase().includes(searchQuery);
    const matchAddress = (t.address || '').toLowerCase().includes(searchQuery);
    const matchLocality = (t.locality || '').toLowerCase().includes(searchQuery);
    const matchReporter = (t.reporter?.name || '').toLowerCase().includes(searchQuery);
    return matchCode || matchTitle || matchAddress || matchLocality || matchReporter;
  });

  if (!filtered.length) {
    container.innerHTML = emptyState({
      iconName: 'clipboard',
      title: 'No tasks found',
      text: activeFilter === 'active' ? 'You have no active pending tasks right now.' : 'No tasks match your selected filter or search term.',
    });
    return;
  }

  container.innerHTML = `
    <div class="report-grid">
      ${filtered.map((t) => taskCardHtml(t)).join('')}
    </div>`;

  attachCardActions();
}

function taskCardHtml(t) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${t.latitude},${t.longitude}`;
  const isDone = t.status === 'resolved';

  return `
    <div class="report-card" data-code="${escapeHtml(t.code)}">
      <div class="report-thumb">
        <img src="${escapeHtml(t.image || '/vendor/placeholder-waste.jpg')}" alt="${escapeHtml(t.title)}" onerror="this.src='/vendor/placeholder-waste.jpg'" />
        <div class="thumb-badges">
          <span class="code-chip">${escapeHtml(t.code)}</span>
          ${statusBadge(t.status)}
        </div>
      </div>

      <div class="report-body">
        <div class="flex-between" style="gap:8px">
          <h3 style="font-size:1.02rem;margin:0">${escapeHtml(t.title)}</h3>
          <span class="badge badge-${escapeHtml(t.priority || 'medium')}">${escapeHtml((t.priority || 'medium').toUpperCase())}</span>
        </div>
        <p class="muted text-sm" style="margin:0;line-height:1.45">${escapeHtml(t.description)}</p>

        <!-- Complainant & Location Information Card -->
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:0.84rem">
          <div>
            <div class="muted text-xs" style="text-transform:uppercase;font-weight:700">Complainant / Citizen</div>
            <div class="flex-between" style="margin-top:2px">
              <b>${escapeHtml(t.reporter?.name || 'Citizen')}</b>
              ${t.reporter?.phone ? `<a class="btn btn-soft btn-sm" href="tel:${escapeHtml(t.reporter.phone)}" style="height:28px;padding:0 10px">${icon('phone')} Call Citizen</a>` : ''}
            </div>
          </div>

          <div style="border-top:1px dashed var(--border);padding-top:6px">
            <div class="muted text-xs" style="text-transform:uppercase;font-weight:700">Location &amp; Address</div>
            <div style="color:var(--ink-800);margin-top:2px">${escapeHtml(t.locality ? `${t.locality} - ${t.address}` : t.address)}</div>
          </div>

          <div class="flex-between wrap" style="border-top:1px dashed var(--border);padding-top:6px;align-items:center">
            <span class="text-xs muted">${icon('map-pin')} GPS: ${Number(t.latitude).toFixed(4)}, ${Number(t.longitude).toFixed(4)}</span>
            <a class="btn btn-ghost btn-sm" href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--brand-700);height:28px;padding:0 8px">
              ${icon('navigation')} <b>Get Directions</b>
            </a>
          </div>
        </div>

        ${t.adminNote ? `
          <div style="font-size:0.8rem;background:var(--brand-50);color:var(--brand-800);padding:8px 10px;border-radius:8px;border:1px solid var(--brand-200)">
            <b>Admin Note:</b> ${escapeHtml(t.adminNote)}
          </div>` : ''}

        <!-- Action Buttons -->
        <div class="report-foot" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm view-email-btn" data-code="${escapeHtml(t.code)}" type="button" title="View Work Order Email">
            ${icon('mail')} Dispatch Email
          </button>

          ${!isDone ? `
            ${t.status === 'assigned' ? `
              <button class="btn btn-secondary btn-sm start-btn" data-code="${escapeHtml(t.code)}" type="button">
                ${icon('truck')} Start Collection
              </button>` : ''}
            <button class="btn btn-primary btn-sm complete-btn" data-code="${escapeHtml(t.code)}" type="button" style="flex:1">
              ${icon('check-circle')} I completed the work
            </button>
          ` : `
            <span class="badge badge-resolved" style="flex:1;justify-content:center;padding:8px">
              ${icon('check-circle')} Completed &amp; Resolved
            </span>
          `}
        </div>
      </div>
    </div>`;
}

function attachCardActions() {
  // Start collection button
  document.querySelectorAll('.start-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code;
      setLoading(btn, true, 'Starting…');
      try {
        const res = await api.post(`/worker/tasks/${code}/status`, {
          status: 'in_progress',
          note: 'Started waste collection and dispatched vehicle to location.',
        });
        toast(res.message, 'success');
        await loadTasks();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  });

  // "I completed the work" button -> opens completion remarks modal
  document.querySelectorAll('.complete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      openCompleteModal(code);
    });
  });

  // "View Dispatch Email" button
  document.querySelectorAll('.view-email-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      openEmailPreviewModal(code);
    });
  });
}

function openCompleteModal(code) {
  const modalRoot = document.getElementById('worker-modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="complete-modal-backdrop">
      <div class="modal" style="max-width:520px">
        <div class="modal-head">
          <div class="flex-center gap-8">
            <span class="icon-tile green">${icon('check-circle')}</span>
            <div>
              <h3>Mark Task as Completed</h3>
              <div class="muted text-xs">Complaint #${escapeHtml(code)}</div>
            </div>
          </div>
          <button class="modal-x" id="close-complete-modal" type="button">${icon('x')}</button>
        </div>

        <form id="complete-task-form">
          <div class="modal-body">
            <div class="alert alert-success" style="margin-bottom:16px">
              ${icon('check')} <span>Confirm that waste at this location has been collected and the area is cleaned.</span>
            </div>

            <div class="field" data-field="note">
              <label for="completion-note">Completion Remarks / Notes <span class="hint">optional</span></label>
              <textarea class="textarea" id="completion-note" placeholder="e.g. Cleared 2 bins of dry & wet waste, area swept and sanitized." style="min-height:90px"></textarea>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn btn-secondary" id="cancel-complete-modal" type="button">Cancel</button>
            <button class="btn btn-primary" id="confirm-complete-btn" type="submit">
              ${icon('check-circle')} Confirm &amp; Submit
            </button>
          </div>
        </form>
      </div>
    </div>`;

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  document.getElementById('close-complete-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-complete-modal')?.addEventListener('click', closeModal);
  document.getElementById('complete-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'complete-modal-backdrop') closeModal();
  });

  document.getElementById('complete-task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('confirm-complete-btn');
    const note = document.getElementById('completion-note')?.value || '';
    setLoading(btn, true, 'Submitting…');

    try {
      const res = await api.post(`/worker/tasks/${code}/status`, {
        status: 'resolved',
        note: note.trim() || 'I completed the work and collected the waste.',
      });
      toast(res.message || 'Task completed successfully!', 'success');
      closeModal();
      await loadTasks();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

/**
 * Opens email preview modal for a specific work order code.
 */
async function openEmailPreviewModal(code) {
  const modalRoot = document.getElementById('worker-modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="email-modal-backdrop">
      <div class="modal" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column">
        <div class="modal-head">
          <div class="flex-center gap-8">
            <span class="icon-tile teal">${icon('mail')}</span>
            <div>
              <h3>Work Order Dispatch Email</h3>
              <div class="muted text-xs">Delivered to Worker Email for Complaint #${escapeHtml(code)}</div>
            </div>
          </div>
          <button class="modal-x" id="close-email-modal" type="button">${icon('x')}</button>
        </div>
        <div class="modal-body" style="padding:0;overflow:hidden;flex:1" id="email-preview-body">
          <div style="padding:24px;text-align:center" class="muted">Loading email preview…</div>
        </div>
      </div>
    </div>`;

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  document.getElementById('close-email-modal')?.addEventListener('click', closeModal);
  document.getElementById('email-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'email-modal-backdrop') closeModal();
  });

  try {
    const iframe = document.createElement('iframe');
    iframe.src = `/api/worker/email-preview/${code}`;
    iframe.style.width = '100%';
    iframe.style.height = '520px';
    iframe.style.border = 'none';
    const body = document.getElementById('email-preview-body');
    if (body) {
      body.innerHTML = '';
      body.appendChild(iframe);
    }
  } catch (err) {
    const body = document.getElementById('email-preview-body');
    if (body) body.innerHTML = `<div style="padding:24px" class="alert alert-error">Failed to load email: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * Opens worker dispatch mailbox showing all work orders emailed to the worker.
 */
async function openMailboxModal() {
  const modalRoot = document.getElementById('worker-modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="mailbox-modal-backdrop">
      <div class="modal" style="max-width:760px;max-height:85vh;display:flex;flex-direction:column">
        <div class="modal-head">
          <div class="flex-center gap-8">
            <span class="icon-tile teal">${icon('mail')}</span>
            <div>
              <h3>Worker Dispatch Mailbox</h3>
              <div class="muted text-xs">All assignment emails &amp; work orders sent to your account</div>
            </div>
          </div>
          <button class="modal-x" id="close-mailbox-modal" type="button">${icon('x')}</button>
        </div>
        <div class="modal-body" id="mailbox-list-body" style="flex:1;overflow-y:auto;padding:16px">
          <div style="padding:24px;text-align:center" class="muted">Loading dispatch emails…</div>
        </div>
      </div>
    </div>`;

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  document.getElementById('close-mailbox-modal')?.addEventListener('click', closeModal);
  document.getElementById('mailbox-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'mailbox-modal-backdrop') closeModal();
  });

  try {
    const res = await api.get('/worker/emails');
    const emails = res.emails || [];
    const listBody = document.getElementById('mailbox-list-body');
    if (!listBody) return;

    if (!emails.length) {
      listBody.innerHTML = emptyState({
        iconName: 'mail',
        title: 'No dispatch emails yet',
        text: 'When administrators assign work to you, your work order dispatch emails will appear here.',
      });
      return;
    }

    listBody.innerHTML = `
      <div style="display:grid;gap:12px">
        ${emails.map((m) => {
          const isScheduled = m.status === 'scheduled';
          const deliveryLabel = {
            scheduled: 'Scheduled (1-min delay)',
            sent: 'Email sent',
            in_app_only: 'Portal copy only — email not sent',
            failed: 'Email delivery failed',
          }[m.status] || 'Delivery status unavailable';
          return `
          <div class="card card-pad" style="border:1px solid var(--border);padding:14px">
            <div class="flex-between" style="margin-bottom:6px">
              <div class="flex-center gap-8">
                <span class="code-chip">#${escapeHtml(m.report_code || 'WMS')}</span>
                <strong style="font-size:0.95rem">${escapeHtml(m.subject)}</strong>
              </div>
              <span class="text-xs muted">${isScheduled ? deliveryLabel : `${deliveryLabel} · ${timeAgo(m.sent_at)}`}</span>
            </div>
            <div class="text-sm muted" style="margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
              ${escapeHtml(m.body_text)}
            </div>
            <div class="flex-between wrap" style="gap:8px">
              ${isScheduled
                ? `<span class="badge badge-assigned">${icon('clock')} Arriving in inbox within 1 min · ${escapeHtml(m.recipient)}</span>`
                : m.status === 'sent'
                  ? `<span class="badge badge-resolved">${icon('check')} Email sent to ${escapeHtml(m.recipient)}</span>`
                  : `<span class="badge badge-high">${icon('alert-circle')} ${escapeHtml(deliveryLabel)}</span>`}
              <div class="flex-center gap-8">
                <a class="btn btn-primary btn-sm" href="#/worker/action?code=${escapeHtml(m.report_code)}&token=${escapeHtml(m.action_token)}&action=completed" target="_blank">
                  ${icon('check-circle')} Yes - Complete Work
                </a>
                <button class="btn btn-secondary btn-sm preview-email-btn" data-token="${escapeHtml(m.action_token)}">
                  ${icon('eye')} Open Email
                </button>
              </div>
            </div>
          </div>
        `;}).join('')}
      </div>`;

    listBody.querySelectorAll('.preview-email-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEmailPreviewModal(btn.dataset.token);
      });
    });
  } catch (err) {
    const listBody = document.getElementById('mailbox-list-body');
    if (listBody) listBody.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

export default { render, mount };
