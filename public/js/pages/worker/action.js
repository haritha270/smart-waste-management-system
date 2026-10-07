'use strict';

/**
 * Worker Email Action confirmation page.
 * Handles one-click completion or status update from dispatch emails.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { escapeHtml as esc, loaderHtml, statusLabel, timeAgo } from '../../ui.js';

function render(ctx) {
  return `
  <div class="auth-wrap" style="min-height:85vh;padding:40px 16px;background:var(--bg-canvas)">
    <div style="max-width:560px;margin:0 auto;width:100%" id="action-container">
      ${loaderHtml('Processing work order status update…')}
    </div>
  </div>`;
}

async function mount(root, ctx) {
  const container = root.querySelector('#action-container');
  if (!container) return;

  const { query } = ctx;
  const code = query.code || '';
  const token = query.token || '';
  const action = query.action || 'completed';

  if (!code || !token) {
    container.innerHTML = `
      <div class="card card-pad center">
        <div class="icon-tile red" style="margin:0 auto 16px;width:56px;height:56px">${icon('alert-circle')}</div>
        <h2 style="font-size:1.4rem;margin-bottom:8px">Invalid Action Link</h2>
        <p class="muted">This work order link is missing the complaint code or action token. Please check the link from your email.</p>
        <div style="margin-top:20px">
          <a class="btn btn-primary" href="#/login">${icon('log-out')} Sign In to SmartWMS</a>
        </div>
      </div>`;
    return;
  }

  try {
    const res = await api.post('/worker/email-action', { code, token, action });
    const task = res.task || res.report || {};
    const isCompleted = res.action === 'resolved' || action === 'completed';

    const mapDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${task.latitude || 0},${task.longitude || 0}`;

    container.innerHTML = `
      <div class="card card-pad" style="border-top:6px solid ${isCompleted ? '#059669' : '#d97706'}">
        <div class="center" style="margin-bottom:20px">
          <div class="icon-tile ${isCompleted ? 'teal' : 'amber'}" style="margin:0 auto 14px;width:64px;height:64px;font-size:1.8rem">
            ${icon(isCompleted ? 'check-circle' : 'clock')}
          </div>
          <h1 style="font-size:1.5rem;margin-bottom:6px">${isCompleted ? 'Work Completed!' : 'Collection In Progress'}</h1>
          <p class="muted" style="font-size:.95rem">${esc(res.message || 'Status updated successfully.')}</p>
        </div>

        <div class="info-box" style="background:var(--bg-panel);border-radius:10px;padding:18px;margin-bottom:20px;display:grid;gap:10px">
          <div class="flex-between">
            <span class="muted text-sm">Complaint ID:</span>
            <strong>#${esc(task.code || code)}</strong>
          </div>
          <div class="flex-between">
            <span class="muted text-sm">Title:</span>
            <span style="font-weight:600;max-width:320px;text-align:right">${esc(task.title || 'Waste Collection')}</span>
          </div>
          <div class="flex-between">
            <span class="muted text-sm">Current Status:</span>
            ${statusLabel(task.status || (isCompleted ? 'resolved' : 'in_progress'))}
          </div>
          <div class="flex-between">
            <span class="muted text-sm">Street Address:</span>
            <span style="max-width:320px;text-align:right">${esc(task.address || 'Location on file')}</span>
          </div>
          ${task.reporter && task.reporter.name ? `
            <div class="flex-between">
              <span class="muted text-sm">Complainant:</span>
              <span><strong>${esc(task.reporter.name)}</strong> (${esc(task.reporter.phone || 'No phone')})</span>
            </div>
          ` : ''}
          ${task.latitude ? `
            <div class="flex-between">
              <span class="muted text-sm">GPS Coordinates:</span>
              <code>${esc(task.latitude)}, ${esc(task.longitude)}</code>
            </div>
          ` : ''}
        </div>

        <div style="display:grid;gap:10px">
          ${task.latitude ? `
            <a class="btn btn-secondary btn-block" href="${mapDirectionsUrl}" target="_blank" rel="noopener">
              ${icon('map-pin')} Open Turn-by-Turn GPS Directions
            </a>
          ` : ''}
          <a class="btn btn-primary btn-block" href="#/worker">
            ${icon('grid')} Go to Worker Dashboard
          </a>
          <a class="btn btn-ghost btn-block" href="#/">
            ${icon('home')} Back to Home
          </a>
        </div>
      </div>`;
  } catch (err) {
    container.innerHTML = `
      <div class="card card-pad center">
        <div class="icon-tile red" style="margin:0 auto 16px;width:56px;height:56px">${icon('alert-circle')}</div>
        <h2 style="font-size:1.4rem;margin-bottom:8px">Unable to Update Status</h2>
        <p class="muted">${esc(err.message || 'The work order token is invalid or the task has already been updated.')}</p>
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:center">
          <a class="btn btn-primary" href="#/worker/tasks">${icon('truck')} My Tasks</a>
          <a class="btn btn-secondary" href="#/login">${icon('log-out')} Login</a>
        </div>
      </div>`;
  }
}

export default { render, mount };
