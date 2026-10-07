/**
 * Report detail page - for Citizens, Workers, and Administrators.
 *
 * Shows image, metadata, map with directions, complainant information,
 * assigned worker card, status timeline, and role-based actions:
 *   citizen -> view + live status track + message admin
 *   worker  -> "Start Collection", "I completed the work", citizen phone call, live directions
 *   admin   -> assign worker, update status, add remarks
 */

import { api, session } from '../api.js';
import { icon } from '../icons.js';
import {
  escapeHtml, formatDateTime, timeAgo, statusBadge, priorityBadge, stepper,
  emptyState, loaderHtml, toast, confirmDialog, avatar, setLoading, statusLabel, modal,
} from '../ui.js';

let map = null;

const STATUS_FLOW = ['pending', 'assigned', 'in_progress', 'resolved'];

function render() {
  return `<div id="detail-root">${loaderHtml('Loading complaint…')}</div>`;
}

async function mount(root, ctx) {
  await load(ctx.params.code);
  return () => { if (map) { map.remove(); map = null; } };
}

async function load(code) {
  const box = document.getElementById('detail-root');
  if (!box) return;
  box.innerHTML = loaderHtml('Loading complaint details…');
  try {
    const data = await api.get(`/reports/${encodeURIComponent(code)}`);
    paint(data.report, data.canManage);
  } catch (err) {
    box.innerHTML = emptyState({
      iconName: 'alert-circle',
      title: err.status === 404 ? 'Complaint not found' : 'Cannot open this complaint',
      text: err.message,
      action: `<a class="btn btn-primary" href="#/">${icon('home')} Back to home</a>`,
    });
  }
}

function paint(r, canManage) {
  const box = document.getElementById('detail-root');
  const role = session.user.role;
  const history = r.history || [];
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}`;

  const backUrl = role === 'admin' ? '#/admin/reports' : role === 'worker' ? '#/worker/tasks' : '#/reports';

  box.innerHTML = `
    <div class="page-head">
      <div>
        <div class="flex-center wrap gap-8" style="margin-bottom:8px">
          <span class="code-chip badge badge-resolved" style="font-size:.8rem;letter-spacing:.05em">${escapeHtml(r.code)}</span>
          ${statusBadge(r.status)}
          ${priorityBadge(r.priority)}
        </div>
        <h2>${escapeHtml(r.title)}</h2>
        <p class="desc">${icon('clock')} Reported ${formatDateTime(r.reportedAt)} · ${timeAgo(r.reportedAt)}</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-ghost" href="${backUrl}">${icon('arrow-left')} Back</a>
        <a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="${directionsUrl}">
          ${icon('navigation')} Get Directions
        </a>
      </div>
    </div>

    <!-- Progress stepper -->
    <div class="card card-pad" style="margin-bottom:20px">
      ${stepper(r.status)}
      <div class="flex-between wrap gap-12" style="margin-top:18px;padding-top:16px;border-top:1px dashed var(--border)">
        <div class="text-sm muted">${history.length ? `Last updated ${timeAgo(history[history.length - 1].at)}` : 'No status updates yet'}</div>
        <div class="text-sm muted">
          ${r.worker ? `Assigned to <b>${escapeHtml(r.worker.name)} (${escapeHtml(r.worker.code)})</b>` : '<span class="badge badge-low">Unassigned</span>'}
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <!-- Left column -->
      <div style="display:grid;gap:20px">
        <div class="detail-hero">
          <img src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title)}"
               onerror="this.parentNode.innerHTML='<div style=\\'padding:60px;text-align:center;color:var(--ink-400)\\'>Image unavailable</div>'" />
        </div>

        <div class="card">
          <div class="card-head"><div><h3>Complaint details</h3><div class="sub">Submitted by ${escapeHtml(r.reporter.name)}</div></div></div>
          <div class="card-body">
            <p style="font-size:.95rem;color:var(--ink-600);white-space:pre-wrap;margin-bottom:18px">${escapeHtml(r.description)}</p>
            ${r.adminNote ? `<div class="alert alert-info" style="margin-bottom:18px"><b>Admin / Worker Remarks:</b> ${escapeHtml(r.adminNote)}</div>` : ''}
            <dl class="kv">
              <dt>Complaint ID</dt><dd>${escapeHtml(r.code)}</dd>
              <dt>Status</dt><dd>${statusBadge(r.status)}</dd>
              <dt>Priority</dt><dd>${priorityBadge(r.priority)}</dd>
              <dt>Address</dt><dd>${escapeHtml(r.address)}</dd>
              <dt>Locality</dt><dd>${escapeHtml(r.locality || '—')}</dd>
              <dt>Latitude / Longitude</dt><dd>${Number(r.latitude).toFixed(6)}, ${Number(r.longitude).toFixed(6)}</dd>
              <dt>Reported on</dt><dd>${formatDateTime(r.reportedAt)}</dd>
              ${r.resolvedAt ? `<dt>Resolved on</dt><dd>${formatDateTime(r.resolvedAt)}</dd>` : ''}
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card-head flex-between">
            <div><h3>Location Map</h3><div class="sub">${escapeHtml(r.address)}</div></div>
            <a class="btn btn-soft btn-sm" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">
              ${icon('navigation')} Directions
            </a>
          </div>
          <div class="card-body">
            <div class="mini-map" id="detail-map"></div>
          </div>
        </div>
      </div>

      <!-- Right column -->
      <div style="display:grid;gap:20px">
        ${actionCard(r, role)}
        ${workerInfoCard(r)}
        ${role === 'admin' || role === 'worker' ? reporterCard(r) : ''}

        <div class="card">
          <div class="card-head"><div><h3>Status timeline</h3><div class="sub">Audit trail of complaint progress</div></div></div>
          <div class="card-body">
            ${history.length ? `<div class="timeline">${history
              .map(
                (h) => `<div class="tl-item ${escapeHtml(h.to)}">
                  <div class="tl-title">${escapeHtml(h.toLabel)}</div>
                  <div class="tl-meta">${formatDateTime(h.at)}${h.by ? ` · by ${escapeHtml(h.by)} (${escapeHtml(h.byRole)})` : ''}</div>
                  ${h.note ? `<div class="tl-note">${escapeHtml(h.note)}</div>` : ''}
                </div>`
              )
              .join('')}</div>` : '<p class="muted mb-0">No history recorded.</p>'}
          </div>
        </div>
      </div>
    </div>`;

  initMiniMap(r);
  wireActions(r, role);
}

function workerInfoCard(r) {
  if (!r.worker) {
    return `
      <div class="card card-pad">
        <div class="flex-between">
          <div class="strong text-sm">Assigned Collection Worker</div>
          <span class="badge badge-low">Not assigned yet</span>
        </div>
        <p class="muted text-xs" style="margin-top:6px">The municipal administrator will assign a field worker to collect waste at this location.</p>
      </div>`;
  }

  const w = r.worker;
  return `
    <div class="card card-pad">
      <div class="flex-between" style="margin-bottom:12px">
        <div class="strong text-sm">Assigned Collection Worker</div>
        <span class="badge badge-assigned"><span class="dot"></span>${escapeHtml(w.code)}</span>
      </div>
      <div class="flex-center gap-12" style="margin-bottom:12px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--brand-100);color:var(--brand-700);display:grid;place-items:center;font-size:1.2rem">
          ${icon('truck')}
        </div>
        <div>
          <div class="strong">${escapeHtml(w.name)}</div>
          <div class="text-xs muted">Zone: ${escapeHtml(w.zone || 'Central')} · Vehicle: ${escapeHtml(w.vehicle || 'Truck')}</div>
        </div>
      </div>
      ${w.phone ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
          <a class="btn btn-soft btn-sm btn-block" href="tel:${escapeHtml(w.phone)}">
            ${icon('phone')} Call Worker (${escapeHtml(w.phone)})
          </a>
        </div>` : ''}
    </div>`;
}

function actionCard(r, role) {
  let body = '';

  if (role === 'citizen') {
    body = `
      <p class="text-sm muted">Your complaint has been forwarded to municipal authorities. You will receive real-time notifications as it progresses.</p>
      <div style="margin-top:14px;display:grid;gap:9px">
        <button class="btn btn-primary btn-block" id="citizen-msg-btn">${icon('mail')} Message Administrator</button>
        <a class="btn btn-soft btn-block" href="#/notifications">${icon('bell')} View Notifications</a>
      </div>`;
  } else if (role === 'worker') {
    const isDone = r.status === 'resolved';
    body = `
      <p class="text-sm muted">You are assigned to collect waste at this location. Once completed, click the button below to notify the citizen and admin.</p>
      <div style="margin-top:14px;display:grid;gap:10px">
        ${!isDone ? `
          ${r.status === 'assigned' ? `
            <button class="btn btn-secondary btn-block" id="worker-start-btn">
              ${icon('truck')} Start Collection
            </button>` : ''}
          <button class="btn btn-primary btn-block" id="worker-complete-btn">
            ${icon('check-circle')} I completed the work
          </button>
        ` : `
          <span class="badge badge-resolved" style="width:100%;justify-content:center;padding:10px">
            ${icon('check-circle')} Work Completed &amp; Resolved
          </span>
        `}
      </div>`;
  } else if (role === 'admin') {
    body = `
      <div id="admin-actions">
        <div class="field" style="margin-bottom:14px">
          <label>Update Status</label>
          <div class="flex-center gap-8">
            <select class="select" id="status-select">
              ${STATUS_FLOW.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm nowrap" id="status-btn">${icon('refresh')} Update</button>
          </div>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Admin Remarks / Resolution Note <span class="hint">optional</span></label>
          <input class="input" id="admin-note" placeholder="e.g. Cleaning vehicle dispatched / Area cleared" value="${escapeHtml(r.adminNote || '')}" />
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--border)">
          <button class="btn btn-ghost btn-sm btn-block" id="admin-delete-btn" style="color:#ef4444" type="button">
            ${icon('trash-2')} Clear / Delete Complaint
          </button>
        </div>
      </div>`;
  }

  return `<div class="card">
    <div class="card-head"><div><h3>Actions</h3></div></div>
    <div class="card-body" id="action-body">${body}</div>
  </div>`;
}

function reporterCard(r) {
  return `<div class="card">
    <div class="card-head"><div><h3>Complainant Information</h3></div></div>
    <div class="card-body">
      <div class="flex-center">
        ${avatar(r.reporter.name, 'avatar-lg')}
        <div class="grow">
          <div class="strong">${escapeHtml(r.reporter.name)}</div>
          <div class="text-sm muted">${escapeHtml(r.reporter.email || '')}</div>
        </div>
      </div>
      <dl class="kv" style="margin-top:16px">
        <dt>Phone</dt>
        <dd>
          ${r.reporter.phone ? `<a href="tel:${escapeHtml(r.reporter.phone)}" style="color:var(--brand-700);font-weight:700">${escapeHtml(r.reporter.phone)}</a>` : '—'}
        </dd>
        <dt>Address</dt><dd>${escapeHtml(r.reporter.address || r.address)}</dd>
        <dt>Submitted</dt><dd>${formatDateTime(r.reportedAt)}</dd>
      </dl>
      ${r.reporter.phone ? `
        <a class="btn btn-soft btn-sm btn-block" style="margin-top:12px" href="tel:${escapeHtml(r.reporter.phone)}">
          ${icon('phone')} Call Citizen
        </a>` : ''}
    </div>
  </div>`;
}

function initMiniMap(r) {
  const el = document.getElementById('detail-map');
  if (!el) return;
  if (map) { map.remove(); map = null; }
  if (!window.L) { el.innerHTML = '<div class="loader-inline">Map unavailable offline</div>'; return; }

  map = L.map(el, { scrollWheelZoom: false, dragging: true }).setView([r.latitude, r.longitude], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  L.marker([r.latitude, r.longitude])
    .addTo(map)
    .bindPopup(`<b>${escapeHtml(r.code)}</b><br>${escapeHtml(r.title)}`)
    .openPopup();
  setTimeout(() => map.invalidateSize(), 250);
}

function wireActions(r, role) {
  /* Citizen: message to admin */
  const msgBtn = document.getElementById('citizen-msg-btn');
  if (msgBtn) {
    msgBtn.onclick = () => {
      const m = modal({
        title: `Message Admin regarding #${r.code}`,
        body: `
          <div class="field" style="margin-bottom:12px">
            <label>Subject</label>
            <input class="input" id="msg-subj" value="Query about complaint #${escapeHtml(r.code)}" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label>Your Message <span class="req">*</span></label>
            <textarea class="textarea" id="msg-body" placeholder="Write your query or request for the municipal administrator…" style="min-height:95px"></textarea>
          </div>`,
        footer: `
          <button class="btn btn-secondary btn-sm" data-close>Cancel</button>
          <button class="btn btn-primary btn-sm" id="send-msg-btn">${icon('send')} Send Message</button>`,
      });

      m.el.querySelector('#send-msg-btn').onclick = async (e) => {
        const message = m.el.querySelector('#msg-body').value.trim();
        const subject = m.el.querySelector('#msg-subj').value.trim();
        if (!message) { toast('Please write a message.', 'warning'); return; }
        setLoading(e.target, true, 'Sending…');
        try {
          const res = await api.post('/messages', {
            report_code: r.code,
            subject,
            message,
          });
          toast(res.message, 'success');
          m.close();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(e.target, false);
        }
      };
    };
  }

  /* Worker Actions */
  const startBtn = document.getElementById('worker-start-btn');
  if (startBtn) {
    startBtn.onclick = async () => {
      setLoading(startBtn, true, 'Starting…');
      try {
        const res = await api.post(`/worker/tasks/${r.code}/status`, {
          status: 'in_progress',
          note: 'Started waste collection and dispatched vehicle to location.',
        });
        toast(res.message, 'success');
        await load(r.code);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(startBtn, false);
      }
    };
  }

  const completeBtn = document.getElementById('worker-complete-btn');
  if (completeBtn) {
    completeBtn.onclick = () => {
      const m = modal({
        title: `Mark Task Completed · #${r.code}`,
        body: `
          <div class="alert alert-success" style="margin-bottom:14px">
            ${icon('check')} <span>Confirm that all waste has been collected at this location.</span>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>Completion Remarks <span class="hint">optional</span></label>
            <textarea class="textarea" id="w-comp-note" placeholder="e.g. Cleared all waste and swept the surrounding area." style="min-height:80px"></textarea>
          </div>`,
        footer: `
          <button class="btn btn-secondary btn-sm" data-close>Cancel</button>
          <button class="btn btn-primary btn-sm" id="confirm-w-comp">${icon('check-circle')} Confirm &amp; Submit</button>`,
      });

      m.el.querySelector('#confirm-w-comp').onclick = async (e) => {
        const note = m.el.querySelector('#w-comp-note').value;
        setLoading(e.target, true, 'Completing…');
        try {
          const res = await api.post(`/worker/tasks/${r.code}/status`, {
            status: 'resolved',
            note: note.trim() || 'I completed the work and collected the waste.',
          });
          toast(res.message, 'success');
          m.close();
          await load(r.code);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(e.target, false);
        }
      };
    };
  }

  /* Admin Action */
  const statusBtn = document.getElementById('status-btn');
  if (statusBtn) {
    statusBtn.onclick = async () => {
      const next = document.getElementById('status-select').value;
      const note = document.getElementById('admin-note').value;
      setLoading(statusBtn, true, 'Updating…');
      try {
        const res = await api.patch(`/admin/reports/${encodeURIComponent(r.code)}/status`, {
          status: next,
          note: note.trim() || null,
        });
        toast(res.message, 'success');
        await load(r.code);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(statusBtn, false);
      }
    };
  }

  const deleteBtn = document.getElementById('admin-delete-btn');
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      const confirmed = await confirmDialog({
        title: `Clear & Delete Complaint · #${r.code}`,
        message: `Are you sure you want to permanently clear and delete complaint #${r.code}? All history, assignments, and records for this complaint will be removed.`,
        confirmText: 'Yes, Delete Complaint',
        cancelText: 'Cancel',
        danger: true,
      });
      if (!confirmed) return;

      setLoading(deleteBtn, true, 'Deleting…');
      try {
        const res = await api.delete(`/admin/reports/${encodeURIComponent(r.code)}`);
        toast(res.message || 'Complaint deleted successfully.', 'success');
        location.hash = '#/admin/reports';
      } catch (err) {
        toast(err.message, 'error');
        setLoading(deleteBtn, false);
      }
    };
  }
}

export default { render, mount };
