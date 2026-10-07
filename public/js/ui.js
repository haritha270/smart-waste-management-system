/**
 * UI kit: formatting helpers, badges, toasts, modals, confirmations,
 * loading/empty states and the shared Chart.js wrapper.
 */

import { icon } from './icons.js';

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Set the inner HTML of a container, guarding against null targets. */
export function renderInto(el, html) {
  const target = typeof el === 'string' ? document.querySelector(el) : el;
  if (target) target.innerHTML = html;
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const DATE_OPTS = { day: '2-digit', month: 'short', year: 'numeric' };
const TIME_OPTS = { hour: '2-digit', minute: '2-digit' };

export function formatDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const base = d.toLocaleDateString('en-IN', DATE_OPTS);
  return withTime ? `${base}, ${d.toLocaleTimeString('en-IN', TIME_OPTS)}` : base;
}

export function formatDateTime(iso) {
  return formatDate(iso, true);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (days < 30) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('en-IN');
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = ['', 'blue', 'violet', 'amber', 'slate'];
export function avatarClass(name) {
  let sum = 0;
  for (const ch of String(name || '')) sum += ch.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function avatar(name, size = '') {
  return `<span class="avatar ${avatarClass(name)} ${size}">${escapeHtml(initials(name))}</span>`;
}

export function truncate(str, len = 90) {
  const s = String(str || '');
  return s.length > len ? escapeHtml(s.slice(0, len - 1)) + '…' : escapeHtml(s);
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

const STATUS_LABELS = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};
export const statusLabel = (s) => STATUS_LABELS[s] || s;

export function statusBadge(status, withDot = true) {
  const label = statusLabel(status);
  return `<span class="badge badge-${escapeHtml(status)}">${withDot ? '<span class="dot"></span>' : ''}${label}</span>`;
}

export function priorityBadge(priority) {
  const p = (priority || 'medium').toLowerCase();
  const label = p.charAt(0).toUpperCase() + p.slice(1);
  return `<span class="badge badge-${escapeHtml(p)}">${label}</span>`;
}

/* The 4-step progress component shown on report cards and detail pages. */
const FLOW = ['pending', 'assigned', 'in_progress', 'resolved'];
const FLOW_ICONS = ['clock', 'user', 'truck', 'check-circle'];

export function stepper(status) {
  const idx = FLOW.indexOf(status);
  return `<div class="stepper">${FLOW.map((s, i) => {
    const cls = i < idx ? 'done' : i === idx ? 'current' : '';
    return `<div class="step ${cls}">
      <div class="step-dot">${i < idx ? icon('check') : icon(FLOW_ICONS[i])}</div>
      <div class="step-label">${statusLabel(s)}</div>
    </div>`;
  }).join('')}</div>`;
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

const TOAST_ICONS = { success: 'check-circle', error: 'alert-circle', info: 'info', warning: 'alert-triangle' };

export function toast(message, type = 'success', title = null) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    ${icon(TOAST_ICONS[type] || 'info')}
    <div class="t-body">
      ${title ? `<div class="t-title">${escapeHtml(title)}</div>` : ''}
      <div class="t-msg">${escapeHtml(message)}</div>
    </div>
    <button class="t-close" aria-label="Dismiss">${icon('x')}</button>
    <span class="t-bar" style="animation-duration:4600ms"></span>`;
  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 240);
  };
  el.querySelector('.t-close').addEventListener('click', remove);
  el.addEventListener('click', remove);
  root.appendChild(el);
  setTimeout(remove, 4600);
}

/* ------------------------------------------------------------------ */
/* Modals + confirmations                                              */
/* ------------------------------------------------------------------ */

/**
 * Open a modal dialog.
 * @returns {{close: Function, el: HTMLElement}}
 */
export function modal({ title, body, footer = '', size = '', onClose = null }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Dialog')}">
      <div class="modal-head">
        <h3>${escapeHtml(title || '')}</h3>
        <button class="modal-x" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div class="modal-body">${body || ''}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  root.appendChild(backdrop);
  return { close, el: backdrop };
}

/**
 * Confirmation dialog returning a promise resolving to true/false.
 */
export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  extra = '',
} = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: `
        <p style="margin:0;color:var(--ink-600);font-size:.93rem">${escapeHtml(message)}</p>
        ${extra}`,
      footer: `
        <button class="btn btn-secondary btn-sm" data-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-ok>${escapeHtml(confirmText)}</button>`,
      onClose: () => resolve(false),
    });
    m.el.querySelector('[data-cancel]').addEventListener('click', () => { m.close(); resolve(false); });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { resolve(true); m.close(); });
  });
}

/* ------------------------------------------------------------------ */
/* Loading / empty states                                              */
/* ------------------------------------------------------------------ */

export function loaderHtml(text = 'Loading…') {
  return `<div class="loader-inline"><span class="spinner"></span>${escapeHtml(text)}</div>`;
}

export function skeletonCards(n = 6) {
  return `<div class="report-grid">${Array.from({ length: n })
    .map(
      () => `<div class="skel-card">
        <div class="skeleton" style="height:150px;margin:-18px -18px 16px;border-radius:14px 14px 0 0"></div>
        <div class="skeleton skel-line" style="width:45%"></div>
        <div class="skeleton skel-line" style="width:90%"></div>
        <div class="skeleton skel-line" style="width:70%;margin-bottom:0"></div>
      </div>`
    )
    .join('')}</div>`;
}

export function skeletonRows(n = 5) {
  return `<div>${Array.from({ length: n })
    .map(() => `<div class="flex-center" style="padding:14px 0;border-bottom:1px solid var(--border)">
      <div class="skeleton" style="width:38px;height:38px;border-radius:50%"></div>
      <div class="grow"><div class="skeleton skel-line" style="width:35%"></div><div class="skeleton skel-line" style="width:65%;margin-bottom:0"></div></div>
    </div>`)
    .join('')}</div>`;
}

export function emptyState({ iconName = 'inbox', title = 'Nothing here yet', text = '', action = '' }) {
  return `<div class="empty-state">
    <div class="es-icon">${icon(iconName)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
    ${action}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

/** Toggle a button into its loading state. */
export function setLoading(btn, loading, text = 'Please wait…') {
  if (!btn) return;
  if (loading) {
    btn.dataset.label = btn.innerHTML;
    btn.classList.add('btn-loading');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${escapeHtml(text)}`;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/** Show an inline alert above a form. */
export function showFormAlert(container, message, type = 'error') {
  const box = typeof container === 'string' ? document.querySelector(container) : container;
  if (!box) return;
  const existing = box.querySelector('.alert[data-form-alert]');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.setAttribute('data-form-alert', '');
  div.innerHTML = `${icon(type === 'error' ? 'alert-circle' : 'check-circle')}<span>${escapeHtml(message)}</span>`;
  box.prepend(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Mark a single field invalid (selector: field wrapper element). */
export function setFieldError(fieldEl, message) {
  if (!fieldEl) return;
  fieldEl.classList.add('invalid');
  const err = fieldEl.querySelector('.field-error');
  if (err) err.innerHTML = `${icon('alert-circle')}${escapeHtml(message)}`;
}

export function clearFieldErrors(form) {
  if (!form) return;
  form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
  const alert = form.querySelector('.alert[data-form-alert]');
  if (alert) alert.remove();
}

/** Validate a set of [fieldElement, condition, message] rules. Returns first error. */
export function validate(rules) {
  for (const [fieldEl, ok, message] of rules) {
    if (!ok) {
      setFieldError(fieldEl, message);
      return { field: fieldEl, message };
    }
    if (fieldEl) fieldEl.classList.remove('invalid');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Charts (Chart.js wrapper that destroys previous instances)          */
/* ------------------------------------------------------------------ */

const chartRegistry = new Map();

export function makeChart(canvasOrId, config) {
  const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
  if (!canvas || !window.Chart) return null;
  const key = canvas.id || `c${Math.random().toString(36).slice(2)}`;
  if (chartRegistry.has(key)) {
    chartRegistry.get(key).destroy();
    chartRegistry.delete(key);
  }
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.color = '#6b7280';
  const chart = new Chart(canvas.getContext('2d'), config);
  chartRegistry.set(key, chart);
  return chart;
}

/** Destroy all charts (called when navigating between pages). */
export function destroyCharts() {
  chartRegistry.forEach((c) => c.destroy());
  chartRegistry.clear();
}

/* Shared chart theme helpers */
export const CHART_COLORS = {
  pending: '#f59e0b',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  collected: '#14b8a6',
  resolved: '#10b981',
};

export function donutOptions(cutout = '68%') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12, weight: 600 } } },
      tooltip: { backgroundColor: '#0b1f17', padding: 11, cornerRadius: 9, titleFont: { weight: 700 } },
    },
  };
}

export function barOptions(horizontal = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0b1f17', padding: 11, cornerRadius: 9 } },
    scales: {
      x: { grid: { display: horizontal, color: '#f1f5f3' }, border: { display: false }, ticks: { font: { size: 11 } } },
      y: { grid: { display: !horizontal, color: '#f1f5f3' }, border: { display: false }, ticks: { font: { size: 11 }, precision: 0 } },
    },
  };
}

export function lineOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12, weight: 600 } } },
      tooltip: { backgroundColor: '#0b1f17', padding: 11, cornerRadius: 9 },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
      y: { grid: { color: '#f1f5f3' }, border: { display: false }, ticks: { font: { size: 11 }, precision: 0 } },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */

/** Open a location in the user's map application / OpenStreetMap. */
export function mapsLink(lat, lng, label = '') {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** Build the Google Maps / default geo: directions link (works on mobile). */
export function directionsLink(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Validate a File as a waste image; returns an error string or null. */
export function validateImageFile(file) {
  if (!file) return 'Please select an image.';
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) return 'Only JPG, PNG, WEBP or GIF images are allowed.';
  if (file.size > 3 * 1024 * 1024) return `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 3 MB.`;
  if (file.size === 0) return 'That file appears to be empty.';
  return null;
}
