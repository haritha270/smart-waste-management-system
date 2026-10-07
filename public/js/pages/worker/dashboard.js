/**
 * Worker Dashboard: workload counters, profile overview, and current assigned tasks.
 */

import { api, session } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, toast, skeletonCards, skeletonRows, statusBadge, formatDate,
  timeAgo, emptyState,
} from '../../ui.js';

let summary = null;
let activeTasks = [];

function render() {
  const u = session.user || {};
  const w = session.worker || {};

  return `
    <div class="page-head">
      <div>
        <h2>Worker Dashboard</h2>
        <p class="desc">Welcome back, <b>${escapeHtml(u.name || 'Worker')}</b>. Track and complete your assigned municipal waste collection tasks.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-secondary" href="#/worker/tasks">${icon('mail')} Dispatch Mailbox</a>
        <a class="btn btn-primary" href="#/worker/tasks">${icon('clipboard')} View My Tasks</a>
        <a class="btn btn-soft" href="#/map">${icon('map')} Live Waste Map</a>
      </div>
    </div>

    <!-- Worker Profile Summary Card -->
    <div class="card card-pad" style="background:linear-gradient(135deg, var(--brand-900), var(--brand-700));color:#fff;margin-bottom:24px;border:none">
      <div class="flex-between wrap" style="gap:16px;align-items:center">
        <div class="flex-center gap-12">
          <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.15);display:grid;place-items:center;font-size:1.4rem">
            ${icon('truck')}
          </div>
          <div>
            <div style="font-size:1.15rem;font-weight:800">${escapeHtml(u.name || 'Collection Worker')}</div>
            <div style="color:var(--brand-200);font-size:0.85rem">Employee Code: <b style="color:#fff;letter-spacing:.05em">${escapeHtml(w.code || 'WRK')}</b> · Zone: <b style="color:#fff">${escapeHtml(w.zone || 'Central Zone')}</b></div>
          </div>
        </div>
        <div class="flex-center wrap gap-8">
          <span class="badge" style="background:rgba(255,255,255,0.18);color:#fff;border-color:transparent">
            ${icon('truck')} Vehicle: ${escapeHtml(w.vehicle || 'Mini Truck')}
          </span>
          <span class="badge" style="background:rgba(16,185,129,0.3);color:#6ee7b7;border-color:transparent">
            <span class="dot" style="background:#34d399"></span> Active On Duty
          </span>
        </div>
      </div>
    </div>

    <!-- Stat Grid -->
    <div class="stat-grid" id="worker-stats">
      ${skeletonCards(4)}
    </div>

    <!-- Active Tasks Table -->
    <div class="card" style="margin-top:24px">
      <div class="card-head">
        <div>
          <h3>Urgent &amp; Active Tasks</h3>
          <div class="sub">Waste complaints assigned to you awaiting collection or completion</div>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/worker/tasks">${icon('arrow-right')} All tasks</a>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Complaint</th>
              <th>Status</th>
              <th>Citizen / Address</th>
              <th>Priority</th>
              <th>Assigned</th>
              <th style="text-align:right">Action</th>
            </tr>
          </thead>
          <tbody id="worker-tasks-body">
            <tr><td colspan="6">${skeletonRows(4)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

async function mount() {
  try {
    const [sumData, tasksData] = await Promise.all([
      api.get('/worker/summary'),
      api.get('/worker/tasks?status=active'),
    ]);

    summary = sumData;
    activeTasks = tasksData.tasks || [];

    paintStats();
    paintTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function paintStats() {
  const container = document.getElementById('worker-stats');
  if (!container || !summary) return;
  const c = summary.counts || {};

  container.innerHTML = `
    <div class="stat-card">
      <span class="icon-tile amber">${icon('clipboard')}</span>
      <div>
        <div class="sc-num">${c.active || 0}</div>
        <div class="sc-label">Active Tasks</div>
      </div>
    </div>
    <div class="stat-card">
      <span class="icon-tile blue">${icon('clock')}</span>
      <div>
        <div class="sc-num">${c.assigned || 0}</div>
        <div class="sc-label">Newly Assigned</div>
      </div>
    </div>
    <div class="stat-card">
      <span class="icon-tile violet">${icon('truck')}</span>
      <div>
        <div class="sc-num">${c.inProgress || 0}</div>
        <div class="sc-label">In Progress</div>
      </div>
    </div>
    <div class="stat-card">
      <span class="icon-tile green">${icon('check-circle')}</span>
      <div>
        <div class="sc-num">${c.resolved || 0}</div>
        <div class="sc-label">Completed (${c.completionRate || 0}%)</div>
      </div>
    </div>`;
}

function paintTasks() {
  const body = document.getElementById('worker-tasks-body');
  if (!body) return;

  if (!activeTasks.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6">
          ${emptyState({
            iconName: 'check-circle',
            title: 'No pending tasks!',
            text: 'You have cleared all waste collection tasks assigned to you.',
          })}
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = activeTasks.slice(0, 6).map((t) => `
    <tr>
      <td>
        <div class="cell-title">${escapeHtml(t.code)} · ${escapeHtml(t.title)}</div>
        <div class="cell-sub">${escapeHtml(t.locality || t.address)}</div>
      </td>
      <td>${statusBadge(t.status)}</td>
      <td>
        <div class="cell-title">${escapeHtml(t.reporter?.name || 'Citizen')}</div>
        <div class="cell-sub"><a href="tel:${escapeHtml(t.reporter?.phone || '')}" style="color:var(--brand-700)">${escapeHtml(t.reporter?.phone || 'No phone')}</a></div>
      </td>
      <td>
        <span class="badge badge-${escapeHtml(t.priority || 'medium')}">${escapeHtml((t.priority || 'medium').toUpperCase())}</span>
      </td>
      <td class="cell-sub">${timeAgo(t.reportedAt)}</td>
      <td style="text-align:right">
        <a class="btn btn-primary btn-sm" href="#/worker/tasks">
          ${icon('arrow-right')} Open Task
        </a>
      </td>
    </tr>
  `).join('');
}

export default { render, mount };
