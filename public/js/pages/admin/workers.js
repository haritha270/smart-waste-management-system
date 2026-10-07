/**
 * Manage Workers (Administrator Portal)
 *
 * Allows Admin to add collection workers, assign zones/vehicles,
 * view workloads, manage worker status, test Gmail SMTP delivery,
 * and view MongoDB backend connectivity.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, toast, setLoading, skeletonRows, emptyState, clearFieldErrors,
  setFieldError, showFormAlert, confirmDialog,
} from '../../ui.js';

let workers = [];
let searchQuery = '';

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>Manage Collection Workers</h2>
        <p class="desc">Add and manage municipal sanitation &amp; collection workers, verify Gmail dispatch, and monitor backend database.</p>
      </div>
      <div class="head-actions" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="open-db-status-btn" type="button" title="MongoDB Backend Status">
          ${icon('database')} Database Status
        </button>
        <button class="btn btn-secondary" id="open-smtp-test-btn" type="button" title="Test Gmail SMTP delivery">
          ${icon('mail')} SMTP &amp; Email Test
        </button>
        <button class="btn btn-primary" id="open-add-worker-btn" type="button">
          ${icon('user-plus')} Add New Worker
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="search input-icon">
        ${icon('search')}
        <input class="input" type="search" id="worker-search" placeholder="Search worker name, code, phone, or zone…" />
      </div>
    </div>

    <!-- Workers Table -->
    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Worker Name</th>
              <th>Employee Code</th>
              <th>Contact Phone</th>
              <th>Assigned Zone</th>
              <th>Vehicle</th>
              <th>Active Tasks</th>
              <th>Status</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody id="workers-body">
            <tr><td colspan="8">${skeletonRows(5)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Root -->
    <div id="admin-worker-modal-root"></div>`;
}

async function mount() {
  await loadWorkers();

  document.getElementById('worker-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    paintWorkers();
  });

  document.getElementById('open-add-worker-btn')?.addEventListener('click', () => {
    openAddWorkerModal();
  });

  document.getElementById('open-smtp-test-btn')?.addEventListener('click', () => {
    openSmtpTestModal();
  });

  document.getElementById('open-db-status-btn')?.addEventListener('click', () => {
    openDbStatusModal();
  });
}

async function loadWorkers() {
  try {
    const data = await api.get('/admin/workers');
    workers = data.workers || [];
    paintWorkers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function paintWorkers() {
  const body = document.getElementById('workers-body');
  if (!body) return;

  const filtered = workers.filter((w) => {
    if (!searchQuery) return true;
    const matchName = (w.name || '').toLowerCase().includes(searchQuery);
    const matchCode = (w.code || '').toLowerCase().includes(searchQuery);
    const matchPhone = (w.phone || '').toLowerCase().includes(searchQuery);
    const matchZone = (w.zone || '').toLowerCase().includes(searchQuery);
    return matchName || matchCode || matchPhone || matchZone;
  });

  if (!filtered.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8">
          ${emptyState({
            iconName: 'users',
            title: 'No workers found',
            text: 'Click "Add New Worker" to add your first collection worker.',
          })}
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = filtered.map((w) => `
    <tr>
      <td>
        <div class="cell-title">${escapeHtml(w.name)}</div>
        <div class="cell-sub">${escapeHtml(w.email)}</div>
      </td>
      <td><span class="badge badge-category" style="font-weight:800">${escapeHtml(w.code)}</span></td>
      <td>
        ${w.phone ? `<a href="tel:${escapeHtml(w.phone)}" style="color:var(--brand-700)">${escapeHtml(w.phone)}</a>` : '<span class="muted">—</span>'}
      </td>
      <td>${escapeHtml(w.zone || 'Central Zone')}</td>
      <td>${escapeHtml(w.vehicle || 'Mini Truck')}</td>
      <td>
        <span class="badge ${w.activeTasks > 0 ? 'badge-assigned' : 'badge-low'}">
          ${w.activeTasks} active
        </span>
      </td>
      <td>
        <span class="badge ${w.status === 'active' ? 'badge-resolved' : 'badge-low'}">
          <span class="dot"></span>${escapeHtml(w.status === 'active' ? 'Active' : 'On Leave')}
        </span>
      </td>
      <td style="text-align:right">
        <div class="flex-center gap-8" style="justify-content:flex-end">
          <button class="btn btn-soft btn-sm edit-worker-btn" data-id="${w.id}" type="button">
            ${icon('edit')} Edit
          </button>
          <button class="btn btn-ghost btn-sm delete-worker-btn" data-id="${w.id}" data-name="${escapeHtml(w.name)}" data-code="${escapeHtml(w.code)}" data-active="${w.activeTasks}" type="button" style="color:#ef4444" title="Remove Worker">
            ${icon('trash-2')} Remove
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('.edit-worker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const w = workers.find((item) => item.id === id);
      if (w) openEditWorkerModal(w);
    });
  });

  body.querySelectorAll('.delete-worker-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const name = btn.dataset.name;
      const code = btn.dataset.code;
      const activeTasks = Number(btn.dataset.active || 0);

      const warningExtra = activeTasks > 0
        ? `<div class="alert alert-warning" style="margin-top:12px">⚠️ This worker currently has <b>${activeTasks} active task${activeTasks === 1 ? '' : 's'}</b>. These complaints will be automatically reset to <b>Pending</b> so another worker can be assigned.</div>`
        : '';

      const confirmed = await confirmDialog({
        title: `Remove Worker: ${name} (${code})`,
        message: `Are you sure you want to remove worker <b>${escapeHtml(name)}</b>? This will delete their worker profile and account access.${warningExtra}`,
        confirmText: 'Yes, Remove Worker',
        cancelText: 'Cancel',
        danger: true,
      });

      if (!confirmed) return;

      setLoading(btn, true, '');
      try {
        const res = await api.delete(`/admin/workers/${id}`);
        toast(res.message, 'success');
        await loadWorkers();
      } catch (err) {
        toast(err.message, 'error');
        setLoading(btn, false);
      }
    });
  });
}

function openAddWorkerModal() {
  const modalRoot = document.getElementById('admin-worker-modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="add-w-backdrop">
      <div class="modal" style="max-width:540px">
        <div class="modal-head">
          <div>
            <h3>Add Municipal Collection Worker</h3>
            <div class="muted text-xs">Workers receive assignments and dispatch emails from Admin</div>
          </div>
          <button class="modal-x" id="close-add-w-modal" type="button">${icon('x')}</button>
        </div>

        <form id="add-worker-form">
          <div class="modal-body">
            <div id="add-worker-form-alert"></div>

            <div class="field" data-field="name">
              <label for="w-name">Full Name <span class="req">*</span></label>
              <input class="input" id="w-name" name="name" placeholder="e.g. Ramesh Babu" required />
            </div>

            <div class="grid-2">
              <div class="field" data-field="email">
                <label for="w-email">Worker Gmail / Email <span class="req">*</span></label>
                <input class="input" id="w-email" name="email" type="email" placeholder="worker@gmail.com" required />
                <span class="hint">Work orders &amp; GPS coordinates are emailed here</span>
              </div>
              <div class="field" data-field="phone">
                <label for="w-phone">Contact Phone</label>
                <input class="input" id="w-phone" name="phone" placeholder="+91 98xxx xxxxx" />
              </div>
            </div>

            <div class="grid-2">
              <div class="field" data-field="zone">
                <label for="w-zone">Assigned Zone</label>
                <select class="select" id="w-zone" name="zone">
                  <option value="Central Zone">Central Zone</option>
                  <option value="East Zone">East Zone</option>
                  <option value="West Zone">West Zone</option>
                  <option value="North Zone">North Zone</option>
                  <option value="South Zone">South Zone</option>
                </select>
              </div>
              <div class="field" data-field="vehicle">
                <label for="w-vehicle">Vehicle Assigned</label>
                <input class="input" id="w-vehicle" name="vehicle" placeholder="e.g. Tipper Truck KA-04-1234" />
              </div>
            </div>

            <div class="field" data-field="specialization">
              <label for="w-spec">Specialization</label>
              <input class="input" id="w-spec" name="specialization" placeholder="e.g. General Collection, Organic Waste, Heavy Debris" />
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn btn-secondary" id="cancel-add-w-btn" type="button">Cancel</button>
            <button class="btn btn-primary" id="submit-add-w-btn" type="submit">
              ${icon('check')} Create Worker
            </button>
          </div>
        </form>
      </div>
    </div>`;

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  document.getElementById('close-add-w-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-add-w-btn')?.addEventListener('click', closeModal);
  document.getElementById('add-w-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'add-w-backdrop') closeModal();
  });

  const form = document.getElementById('add-worker-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const name = form.querySelector('#w-name')?.value;
    const email = form.querySelector('#w-email')?.value;
    const phone = form.querySelector('#w-phone')?.value;
    const zone = form.querySelector('#w-zone')?.value;
    const vehicle = form.querySelector('#w-vehicle')?.value;
    const specialization = form.querySelector('#w-spec')?.value;

    const btn = document.getElementById('submit-add-w-btn');
    setLoading(btn, true, 'Adding…');

    try {
      const res = await api.post('/admin/workers', {
        name,
        email,
        phone,
        zone,
        vehicle,
        specialization,
      });

      toast(res.message, 'success');
      closeModal();
      await loadWorkers();
    } catch (err) {
      showFormAlert(form, err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

function openEditWorkerModal(w) {
  const modalRoot = document.getElementById('admin-worker-modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="edit-w-backdrop">
      <div class="modal" style="max-width:500px">
        <div class="modal-head">
          <div>
            <h3>Edit Worker: ${escapeHtml(w.name)}</h3>
            <div class="muted text-xs">Employee Code: ${escapeHtml(w.code)}</div>
          </div>
          <button class="modal-x" id="close-edit-w-modal" type="button">${icon('x')}</button>
        </div>

        <form id="edit-worker-form">
          <div class="modal-body">
            <div class="field" data-field="zone">
              <label for="e-zone">Assigned Zone</label>
              <select class="select" id="e-zone" name="zone">
                <option value="Central Zone" ${w.zone === 'Central Zone' ? 'selected' : ''}>Central Zone</option>
                <option value="East Zone" ${w.zone === 'East Zone' ? 'selected' : ''}>East Zone</option>
                <option value="West Zone" ${w.zone === 'West Zone' ? 'selected' : ''}>West Zone</option>
                <option value="North Zone" ${w.zone === 'North Zone' ? 'selected' : ''}>North Zone</option>
                <option value="South Zone" ${w.zone === 'South Zone' ? 'selected' : ''}>South Zone</option>
              </select>
            </div>

            <div class="field" data-field="vehicle">
              <label for="e-vehicle">Vehicle Assigned</label>
              <input class="input" id="e-vehicle" name="vehicle" value="${escapeHtml(w.vehicle || 'Mini Truck')}" />
            </div>

            <div class="field" data-field="status">
              <label for="e-status">Duty Status</label>
              <select class="select" id="e-status" name="status">
                <option value="active" ${w.status === 'active' ? 'selected' : ''}>Active (Available for assignments)</option>
                <option value="on_leave" ${w.status === 'on_leave' ? 'selected' : ''}>On Leave</option>
              </select>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn btn-secondary" id="cancel-edit-w-btn" type="button">Cancel</button>
            <button class="btn btn-primary" id="save-edit-w-btn" type="submit">
              ${icon('check')} Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>`;

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  document.getElementById('close-edit-w-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-edit-w-btn')?.addEventListener('click', closeModal);
  document.getElementById('edit-w-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'edit-w-backdrop') closeModal();
  });

  document.getElementById('edit-worker-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-edit-w-btn');
    const zone = document.getElementById('e-zone')?.value;
    const vehicle = document.getElementById('e-vehicle')?.value;
    const status = document.getElementById('e-status')?.value;

    setLoading(btn, true, 'Saving…');
    try {
      const res = await api.patch(`/admin/workers/${w.id}`, { zone, vehicle, status });
      toast(res.message, 'success');
      closeModal();
      await loadWorkers();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

/**
 * Modal to test Gmail SMTP connection and send a test email.
 */
async function openSmtpTestModal() {
  const modalRoot = document.getElementById('admin-worker-modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="smtp-m-backdrop">
      <div class="modal" style="max-width:540px">
        <div class="modal-head">
          <div>
            <h3>Gmail / SMTP Delivery Status</h3>
            <div class="muted text-xs">Verify work order dispatch settings</div>
          </div>
          <button class="modal-x" id="close-smtp-modal" type="button">${icon('x')}</button>
        </div>
        <div class="modal-body" id="smtp-modal-body">
          <div style="text-align:center;padding:24px">${icon('loader')} Loading SMTP status…</div>
        </div>
      </div>
    </div>`;

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  document.getElementById('close-smtp-modal')?.addEventListener('click', closeModal);
  document.getElementById('smtp-m-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'smtp-m-backdrop') closeModal();
  });

  const body = document.getElementById('smtp-modal-body');
  try {
    const status = await api.get('/admin/smtp-status');
    body.innerHTML = `
      <div class="alert ${status.configured ? 'alert-success' : 'alert-warning'}" style="margin-bottom:16px">
        ${icon(status.configured ? 'check-circle' : 'alert-circle')}
        <div>
          <b>${status.configured ? 'Gmail SMTP is Configured' : 'SMTP is Not Configured in .env'}</b>
          <div style="font-size:12.5px;margin-top:2px">
            ${status.configured
              ? `Sending email via: <code>${escapeHtml(status.gmailUser)}</code>`
              : 'Work orders are currently stored to in-app mailboxes only. Configure <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in your <code>.env</code> file to enable real email delivery.'}
          </div>
        </div>
      </div>

      <div class="field">
        <label>Send a Verification Test Email</label>
        <div style="display:flex;gap:8px">
          <input class="input" id="smtp-test-recipient" placeholder="Enter recipient email (e.g. worker@gmail.com)" value="${escapeHtml(status.gmailUser || '')}" />
          <button class="btn btn-primary" id="send-test-email-btn" style="white-space:nowrap" type="button">
            ${icon('send')} Send Test
          </button>
        </div>
      </div>

      <div class="card" style="background:#f8fafc;padding:14px;border:1px solid #e2e8f0;border-radius:8px;font-size:12.5px;line-height:1.5">
        <div style="font-weight:700;margin-bottom:4px">💡 How to enable Real Gmail Delivery:</div>
        <ol style="margin:0;padding-left:18px;color:#475569">
          <li>Enable <b>2-Step Verification</b> on your Google / Gmail Account.</li>
          <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:var(--brand-700);font-weight:600">Google App Passwords</a> and generate a 16-character App Password for "Mail".</li>
          <li>Add <code>GMAIL_USER=your-email@gmail.com</code> and <code>GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx</code> to your <code>.env</code> file and restart the server.</li>
        </ol>
      </div>

      <div id="smtp-test-result" style="margin-top:14px"></div>
    `;

    document.getElementById('send-test-email-btn')?.addEventListener('click', async () => {
      const recipient = document.getElementById('smtp-test-recipient')?.value.trim();
      const resContainer = document.getElementById('smtp-test-result');
      const btn = document.getElementById('send-test-email-btn');

      if (!recipient) {
        toast('Please enter a recipient email address.', 'warning');
        return;
      }

      setLoading(btn, true, 'Sending…');
      resContainer.innerHTML = '';

      try {
        const res = await api.post('/admin/test-email', { recipient });
        toast(res.message, 'success');
        resContainer.innerHTML = `
          <div class="alert alert-success">
            ${icon('check-circle')} <span><b>Success!</b> ${escapeHtml(res.message)}</span>
          </div>`;
      } catch (err) {
        toast(err.message, 'error');
        resContainer.innerHTML = `
          <div class="alert alert-error">
            ${icon('alert-circle')} <span><b>Delivery Failed:</b> ${escapeHtml(err.message)}</span>
          </div>`;
      } finally {
        setLoading(btn, false);
      }
    });
  } catch (err) {
    body.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

/**
 * Modal to view MongoDB backend status and trigger synchronization.
 */
async function openDbStatusModal() {
  const modalRoot = document.getElementById('admin-worker-modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="db-m-backdrop">
      <div class="modal" style="max-width:540px">
        <div class="modal-head">
          <div>
            <h3>Database &amp; MongoDB Backend Status</h3>
            <div class="muted text-xs">Manage MongoDB connectivity &amp; data sync</div>
          </div>
          <button class="modal-x" id="close-db-modal" type="button">${icon('x')}</button>
        </div>
        <div class="modal-body" id="db-modal-body">
          <div style="text-align:center;padding:24px">${icon('loader')} Checking database status…</div>
        </div>
      </div>
    </div>`;

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  document.getElementById('close-db-modal')?.addEventListener('click', closeModal);
  document.getElementById('db-m-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'db-m-backdrop') closeModal();
  });

  const body = document.getElementById('db-modal-body');
  try {
    const data = await api.get('/admin/db-status');
    const mongo = data.mongo || {};
    const isMongo = mongo.connected;

    body.innerHTML = `
      <div class="alert ${isMongo ? 'alert-success' : 'alert-info'}" style="margin-bottom:16px">
        ${icon(isMongo ? 'check-circle' : 'database')}
        <div>
          <b>Active Engine: ${isMongo ? '🍃 MongoDB (Connected)' : '📦 SQLite Active (with MongoDB Bridge)'}</b>
          <div style="font-size:12.5px;margin-top:2px">
            ${isMongo
              ? `Connected to database <code>${escapeHtml(mongo.database)}</code> (Ping: ${mongo.pingMs}ms)`
              : `Local storage file: <code>${escapeHtml(data.sqlite?.file || 'wms.sqlite')}</code>`}
          </div>
        </div>
      </div>

      <div class="card" style="background:#f8fafc;padding:14px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">Connection URI:</div>
        <div style="font-family:monospace;font-size:12px;word-break:break-all;background:#fff;padding:8px;border-radius:6px;border:1px solid #cbd5e1">
          ${escapeHtml(mongo.uri || 'mongodb://127.0.0.1:27017/waste_management_system')}
        </div>
        ${!isMongo ? `<div style="font-size:12px;color:#64748b;margin-top:6px">Status: ${escapeHtml(mongo.error || 'MongoDB server offline. Start MongoDB service or provide MongoDB Atlas URI in .env')}</div>` : ''}
      </div>

      ${isMongo && mongo.collections ? `
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">MongoDB Collections:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          ${Object.entries(mongo.collections).map(([name, count]) => `
            <div style="background:#fff;border:1px solid #e2e8f0;padding:8px 12px;border-radius:6px;display:flex;justify-content:space-between">
              <span style="font-weight:600;font-size:12.5px">${escapeHtml(name)}</span>
              <span class="badge badge-low">${count} docs</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
        <button class="btn btn-primary btn-sm" id="sync-mongo-btn" type="button">
          ${icon('refresh')} Force Sync to MongoDB
        </button>
        <span class="muted text-xs">All records auto-sync on writes</span>
      </div>
      <div id="sync-result" style="margin-top:10px"></div>
    `;

    document.getElementById('sync-mongo-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('sync-mongo-btn');
      const resContainer = document.getElementById('sync-result');
      setLoading(btn, true, 'Syncing…');
      resContainer.innerHTML = '';
      try {
        const res = await api.post('/admin/db-sync');
        toast(res.message, 'success');
        resContainer.innerHTML = `<div class="alert alert-success">${escapeHtml(res.message)}</div>`;
      } catch (err) {
        toast(err.message, 'error');
        resContainer.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      } finally {
        setLoading(btn, false);
      }
    });
  } catch (err) {
    body.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

export default { render, mount };
