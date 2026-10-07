/**
 * Citizen dashboard: welcome header, complaint statistics, quick actions,
 * latest complaints, message administrator modal, and status guide.
 */

import { api, session } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, formatNumber, timeAgo, statusBadge,
  emptyState, loaderHtml, toast, avatar, statusLabel, modal,
} from '../../ui.js';

function statCard({ iconName, tone, value, label, sub }) {
  return `
    <div class="stat-card">
      <div class="icon-tile ${tone}">${icon(iconName)}</div>
      <div>
        <div class="sc-num">${value}</div>
        <div class="sc-label">${escapeHtml(label)}</div>
        ${sub ? `<div class="sc-delta flat">${escapeHtml(sub)}</div>` : ''}
      </div>
    </div>`;
}

function reportRowCard(r) {
  return `
  <a href="#/reports/${r.code}" class="list-item" style="text-decoration:none;color:inherit">
    <div class="icon-tile">${icon('file-text')}</div>
    <div class="grow" style="min-width:0">
      <div class="li-title">${escapeHtml(r.title)}</div>
      <div class="li-sub">${r.code} · ${escapeHtml(r.locality || r.address)} · ${timeAgo(r.reportedAt)}</div>
    </div>
    <div class="li-end">${statusBadge(r.status)}</div>
  </a>`;
}

function render() {
  return `
    <div id="dash-alert"></div>
    <div class="page-head">
      <div>
        <h2 id="welcome-line">Welcome back 👋</h2>
        <p class="desc">Report waste in your locality, message the administrator, and track progress live.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-soft" id="contact-admin-btn">${icon('mail')} Message Admin</button>
        <a class="btn btn-primary" href="#/report">${icon('plus-circle')} Report Waste</a>
      </div>
    </div>

    <div class="stat-grid" id="dash-stats">
      ${Array.from({ length: 4 }).map(() => `<div class="stat-card"><div class="skeleton" style="width:44px;height:44px;border-radius:13px"></div><div class="grow"><div class="skeleton skel-line" style="width:60%;height:26px"></div><div class="skeleton skel-line" style="width:80%;margin-bottom:0"></div></div></div>`).join('')}
    </div>

    <div class="panel-grid">
      <div class="col-8">
        <div class="card">
          <div class="card-head">
            <div><h3>My recent complaints</h3><div class="sub">Latest issues submitted from this account</div></div>
            <a class="btn btn-ghost btn-sm" href="#/reports">View all ${icon('chevron-right')}</a>
          </div>
          <div class="card-body tight" id="recent-reports">${loaderHtml('Loading your complaints…')}</div>
        </div>
      </div>

      <div class="col-4">
        <div class="card" style="margin-bottom:20px">
          <div class="card-head"><div><h3>Quick actions</h3></div></div>
          <div class="card-body" style="display:grid;gap:11px">
            <a class="btn btn-primary btn-block" href="#/report">${icon('camera')} Report new waste</a>
            <button class="btn btn-secondary btn-block" id="dash-msg-btn">${icon('mail')} Message Administrator</button>
            <a class="btn btn-secondary btn-block" href="#/reports">${icon('file-text')} Track my complaints</a>
            <a class="btn btn-soft btn-block" href="#/map">${icon('map')} Open waste map</a>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><h3>Status guide</h3><div class="sub">Complaint lifecycle</div></div></div>
          <div class="card-body">
            <div class="timeline">
              <div class="tl-item pending"><div class="tl-title">Pending</div><div class="tl-meta">Complaint received, administrator notified</div></div>
              <div class="tl-item in_progress"><div class="tl-title">In Progress</div><div class="tl-meta">Municipal administration actively resolving</div></div>
              <div class="tl-item resolved"><div class="tl-title">Resolved</div><div class="tl-meta">Location cleaned and complaint closed</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function openMessageModal() {
  const m = modal({
    title: 'Message Municipal Administrator',
    body: `
      <div class="field" style="margin-bottom:12px">
        <label>Subject</label>
        <input class="input" id="dm-subj" placeholder="e.g. Garbage accumulation near school" />
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Message / Complaint Details <span class="req">*</span></label>
        <textarea class="textarea" id="dm-body" rows="4" placeholder="Type your message or complaint to the administrator here…"></textarea>
      </div>`,
    footer: `
      <button class="btn btn-secondary btn-sm" data-close>Cancel</button>
      <button class="btn btn-primary btn-sm" id="dm-send">${icon('mail')} Send Notification to Admin</button>`,
  });

  m.el.querySelector('#dm-send').onclick = async () => {
    const text = m.el.querySelector('#dm-body').value.trim();
    const subj = m.el.querySelector('#dm-subj').value.trim();
    if (text.length < 5) {
      toast('Please write at least 5 characters.', 'warning');
      return;
    }
    try {
      const res = await api.post('/messages', { message: text, subject: subj });
      toast(res.message || 'Notification delivered to administrator.', 'success');
      m.close();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

async function mount(root) {
  const user = session.user;
  const welcome = document.getElementById('welcome-line');
  if (welcome && user) welcome.textContent = `Welcome, ${user.name.split(' ')[0]} 👋`;

  document.getElementById('contact-admin-btn')?.addEventListener('click', openMessageModal);
  document.getElementById('dash-msg-btn')?.addEventListener('click', openMessageModal);

  try {
    const data = await api.get('/reports/mine');
    const reports = data.reports || [];
    const count = (s) => reports.filter((r) => r.status === s).length;
    const resolved = count('resolved');
    const open = reports.length - resolved;

    const statsBox = document.getElementById('dash-stats');
    if (statsBox) {
      statsBox.innerHTML = [
        statCard({ iconName: 'file-text', tone: '', value: formatNumber(reports.length), label: 'Total complaints', sub: 'All time' }),
        statCard({ iconName: 'clock', tone: 'amber', value: formatNumber(count('pending')), label: 'Pending review', sub: 'Admin notified' }),
        statCard({ iconName: 'activity', tone: 'violet', value: formatNumber(count('in_progress')), label: 'In progress', sub: 'Being handled' }),
        statCard({ iconName: 'check-circle', tone: 'teal', value: formatNumber(resolved), label: 'Resolved', sub: `${reports.length ? Math.round((resolved / reports.length) * 100) : 0}% closure rate` }),
      ].join('');
    }

    const box = document.getElementById('recent-reports');
    if (box) {
      if (!reports.length) {
        box.innerHTML = emptyState({
          iconName: 'camera',
          title: 'No complaints yet',
          text: 'You have not reported any waste so far. Start by submitting a complaint in your locality.',
          action: `<a class="btn btn-primary" href="#/report">${icon('plus-circle')} Report Waste</a>`,
        });
      } else {
        const latest = [...reports].sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)).slice(0, 6);
        box.innerHTML = latest.map(reportRowCard).join('');
      }
    }

    if (open > 0 && welcome) {
      const alert = document.getElementById('dash-alert');
      if (alert) {
        alert.innerHTML = `<div class="alert alert-info">${icon('info')}<span>You have <b>${open}</b> open complaint${open === 1 ? '' : 's'} being tracked by the municipal administrator.</span></div>`;
      }
    }
  } catch (err) {
    toast(err.message, 'error');
    const box = document.getElementById('recent-reports');
    if (box) box.innerHTML = emptyState({ iconName: 'alert-circle', title: 'Could not load complaints', text: err.message });
  }
}

export default { render, mount };
