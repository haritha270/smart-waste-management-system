/**
 * Notification centre: unread badge, mark-as-read actions, filter and links
 * back to the related report.
 */

import { api, session, setUnread } from '../api.js';
import { icon } from '../icons.js';
import { escapeHtml, timeAgo, emptyState, loaderHtml, toast, statusLabel } from '../ui.js';

const TYPE_ICON = {
  success: ['check-circle', 'teal'],
  info: ['info', 'blue'],
  warning: ['alert-triangle', 'amber'],
  task: ['clipboard', 'violet'],
  error: ['alert-circle', 'red'],
};

let onlyUnread = false;

function itemHtml(n) {
  const [ic, tone] = TYPE_ICON[n.type] || TYPE_ICON.info;
  return `
  <div class="notif ${n.isRead ? '' : 'unread'}" data-notif="${n.id}">
    <div class="icon-tile ${tone}">${icon(ic)}</div>
    <div class="n-body">
      <div class="n-title">${escapeHtml(n.title)}</div>
      <div class="n-msg">${escapeHtml(n.message)}</div>
      <div class="n-time">
        <span>${timeAgo(n.createdAt)}</span>
        ${n.reportCode ? `<a href="#/reports/${escapeHtml(n.reportCode)}">${icon('external-link')} ${escapeHtml(n.reportCode)}</a>` : ''}
        ${n.isRead ? '<span>· Read</span>' : '<span style="color:var(--brand-700);font-weight:800">· New</span>'}
      </div>
    </div>
    <div class="n-actions">
      ${n.isRead ? '' : `<button class="btn btn-ghost btn-sm" data-read="${n.id}">${icon('check')} Mark read</button>`}
      ${n.link ? `<a class="btn btn-soft btn-sm" href="${escapeHtml(n.link)}">Open</a>` : ''}
    </div>
  </div>`;
}

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>Notifications</h2>
        <p class="desc">Updates about your reports, assigned tasks and municipal announcements.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-secondary" id="toggle-unread">${icon('filter')} <span id="toggle-label">Unread only</span></button>
        <button class="btn btn-primary" id="read-all">${icon('check-circle')} Mark all as read</button>
      </div>
    </div>

    <div class="flex-between" style="margin-bottom:16px">
      <div class="text-sm muted" id="notif-summary">Loading…</div>
      <span class="badge badge-resolved" id="unread-pill">${icon('bell')} 0 unread</span>
    </div>

    <div class="notif-list" id="notif-list">${loaderHtml('Loading notifications…')}</div>`;
}

async function load() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  try {
    const data = await api.get(`/notifications?limit=60${onlyUnread ? '&unread=true' : ''}`);
    const items = data.notifications || [];
    setUnread(data.unreadCount || 0);

    const summary = document.getElementById('notif-summary');
    if (summary) summary.innerHTML = `<b>${items.length}</b> notification${items.length === 1 ? '' : 's'}${onlyUnread ? ' (unread)' : ''}`;
    const pill = document.getElementById('unread-pill');
    if (pill) pill.innerHTML = `${icon('bell')} ${data.unreadCount || 0} unread`;

    if (!items.length) {
      list.innerHTML = onlyUnread
        ? emptyState({ iconName: 'check-circle', title: 'You are all caught up', text: 'No unread notifications right now.' })
        : emptyState({ iconName: 'bell', title: 'No notifications yet', text: 'When you submit a report or an administrator updates your complaint, the update appears here.' });
      return;
    }
    list.innerHTML = items.map(itemHtml).join('');

    list.querySelectorAll('[data-read]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api.post(`/notifications/${btn.dataset.read}/read`);
          setUnread(res.unreadCount || 0);
          await load();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  } catch (err) {
    toast(err.message, 'error');
    list.innerHTML = emptyState({ iconName: 'alert-circle', title: 'Could not load notifications', text: err.message });
  }
}

function mount(root) {
  load();

  document.getElementById('read-all').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await api.post('/notifications/read-all');
      setUnread(0);
      toast(res.message, 'success');
      await load();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  document.getElementById('toggle-unread').addEventListener('click', () => {
    onlyUnread = !onlyUnread;
    document.getElementById('toggle-label').textContent = onlyUnread ? 'Show all' : 'Unread only';
    load();
  });
}

export default { render, mount };
