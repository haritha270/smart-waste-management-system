/**
 * Admin dashboard: headline statistics, interactive charts,
 * the pending complaints queue and latest civic activity.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, formatNumber, statusBadge, priorityBadge, timeAgo, loaderHtml, emptyState, toast,
  makeChart, donutOptions, barOptions, lineOptions, CHART_COLORS, statusLabel,
} from '../../ui.js';

function statCard({ iconName, tone, value, label, sub, delta }) {
  return `
    <div class="stat-card">
      <div class="icon-tile ${tone}">${icon(iconName)}</div>
      <div>
        <div class="sc-num">${value}</div>
        <div class="sc-label">${escapeHtml(label)}</div>
        ${sub ? `<div class="sc-delta ${delta || 'flat'}">${sub}</div>` : ''}
      </div>
    </div>`;
}

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>Administrator Dashboard</h2>
        <p class="desc">Overview of waste complaints, pending citizen issues and resolution metrics.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-soft" href="#/admin/analytics">${icon('bar-chart')} Full analytics</a>
        <a class="btn btn-primary" href="#/admin/reports">${icon('file-text')} Manage complaints</a>
      </div>
    </div>

    <div class="stat-grid" id="admin-stats">
      ${Array.from({ length: 5 }).map(() => `<div class="stat-card"><div class="skeleton" style="width:44px;height:44px;border-radius:13px"></div><div class="grow"><div class="skeleton skel-line" style="width:70%;height:26px"></div><div class="skeleton skel-line" style="width:90%;margin-bottom:0"></div></div></div>`).join('')}
    </div>

    <div class="panel-grid">
      <div class="col-6">
        <div class="card" style="height:100%">
          <div class="card-head"><div><h3>Complaints by status</h3><div class="sub">Current pipeline distribution</div></div></div>
          <div class="card-body"><div class="chart-box"><canvas id="chart-status"></canvas></div></div>
        </div>
      </div>
      <div class="col-6">
        <div class="card" style="height:100%">
          <div class="card-head"><div><h3>Priority breakdown</h3><div class="sub">Urgent &amp; high priority complaints</div></div></div>
          <div class="card-body"><div class="chart-box"><canvas id="chart-priority"></canvas></div></div>
        </div>
      </div>

      <div class="col-8">
        <div class="card">
          <div class="card-head">
            <div><h3>Complaints over time</h3><div class="sub">Last 30 days · received vs resolved</div></div>
            <span class="badge badge-category">${icon('calendar')} 30 days</span>
          </div>
          <div class="card-body"><div class="chart-box short"><canvas id="chart-trend"></canvas></div></div>
        </div>
      </div>

      <div class="col-4">
        <div class="card" style="height:100%">
          <div class="card-head">
            <div><h3>Needs attention</h3><div class="sub">Pending citizen complaints</div></div>
            <a class="btn btn-ghost btn-sm" href="#/admin/reports?status=pending">View all</a>
          </div>
          <div class="card-body tight" id="pending-queue">${loaderHtml('Loading…')}</div>
        </div>
      </div>

      <div class="col-12">
        <div class="card">
          <div class="card-head">
            <div><h3>Latest complaints</h3><div class="sub">Most recent activity from citizens</div></div>
            <a class="btn btn-ghost btn-sm" href="#/admin/reports">Open complaints manager ${icon('chevron-right')}</a>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>Complaint</th><th>Citizen</th><th>Location</th><th>Priority</th><th>Status</th><th>Reported</th><th></th></tr>
              </thead>
              <tbody id="recent-body"><tr><td colspan="7">${loaderHtml('Loading complaints…')}</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

async function mount(root) {
  try {
    const [statsRes, analyticsRes, reportsRes] = await Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/analytics'),
      api.get('/admin/reports?sort=newest'),
    ]);
    paintStats(statsRes.stats);
    paintCharts(analyticsRes.analytics);
    paintPending(reportsRes.reports.filter((r) => r.status === 'pending'));
    paintRecent(reportsRes.reports.slice(0, 8));
  } catch (err) {
    toast(err.message, 'error');
    const box = document.getElementById('pending-queue');
    if (box) box.innerHTML = emptyState({ iconName: 'alert-circle', title: 'Failed to load dashboard', text: err.message });
  }
}

function paintStats(s) {
  const box = document.getElementById('admin-stats');
  if (!box) return;
  box.innerHTML = [
    statCard({ iconName: 'file-text', tone: '', value: formatNumber(s.totalReports), label: 'Total Complaints', sub: `${s.lastWeekReports} this week`, delta: s.reportGrowthPct >= 0 ? 'up' : 'down' }),
    statCard({ iconName: 'clock', tone: 'amber', value: formatNumber(s.pending), label: 'Pending Complaints', sub: 'Awaiting action' }),
    statCard({ iconName: 'activity', tone: 'violet', value: formatNumber(s.inProgress), label: 'In Progress', sub: 'Being handled' }),
    statCard({ iconName: 'check-circle', tone: 'teal', value: formatNumber(s.resolved), label: 'Resolved Complaints', sub: 'Completed' }),
    statCard({ iconName: 'users', tone: 'slate', value: formatNumber(s.totalUsers), label: 'Registered Citizens', sub: 'Active community' }),
  ].join('');
}

function paintCharts(a) {
  /* Status bar */
  makeChart('chart-status', {
    type: 'bar',
    data: {
      labels: a.byStatus.map((s) => s.label),
      datasets: [{
        data: a.byStatus.map((s) => s.count),
        backgroundColor: a.byStatus.map((s) => CHART_COLORS[s.status] || '#10b981'),
        borderRadius: 8, borderSkipped: false, maxBarThickness: 46,
      }],
    },
    options: barOptions(),
  });

  /* Priority doughnut */
  const pColors = { low: '#64748b', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };
  makeChart('chart-priority', {
    type: 'doughnut',
    data: {
      labels: a.byPriority.map((p) => p.priority.charAt(0).toUpperCase() + p.priority.slice(1)),
      datasets: [{
        data: a.byPriority.map((p) => p.count),
        backgroundColor: a.byPriority.map((p) => pColors[p.priority] || '#64748b'),
        borderWidth: 0,
      }],
    },
    options: donutOptions(),
  });

  /* Trend line */
  makeChart('chart-trend', {
    type: 'line',
    data: {
      labels: a.overTime.map((d) => d.day.slice(5)),
      datasets: [
        {
          label: 'Received', data: a.overTime.map((d) => d.created),
          borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.12)',
          fill: true, tension: 0.38, pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 2.4,
        },
        {
          label: 'Resolved', data: a.overTime.map((d) => d.resolved),
          borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.14)',
          fill: true, tension: 0.38, pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 2.4,
        },
      ],
    },
    options: lineOptions(),
  });
}

function paintPending(pending) {
  const box = document.getElementById('pending-queue');
  if (!box) return;
  if (!pending.length) {
    box.innerHTML = emptyState({ iconName: 'check-circle', title: 'Queue is clear', text: 'All complaints have been acted upon.' });
    return;
  }
  box.innerHTML = pending.slice(0, 6).map((r) => `
    <a href="#/reports/${escapeHtml(r.code)}" class="list-item" style="text-decoration:none;color:inherit">
      <div class="icon-tile amber">${icon('clock')}</div>
      <div class="grow" style="min-width:0">
        <div class="li-title">${escapeHtml(r.title)}</div>
        <div class="li-sub">${escapeHtml(r.code)} · ${escapeHtml(r.locality || r.address)} · ${timeAgo(r.reportedAt)}</div>
      </div>
      <div class="li-end"><span class="btn btn-soft btn-sm">${icon('arrow-right')} Review</span></div>
    </a>`).join('');
}

function paintRecent(reports) {
  const body = document.getElementById('recent-body');
  if (!body) return;
  if (!reports.length) {
    body.innerHTML = `<tr><td colspan="7">${emptyState({ iconName: 'inbox', title: 'No complaints', text: 'Complaints will appear here once citizens submit reports.' })}</td></tr>`;
    return;
  }
  body.innerHTML = reports.map((r) => `
    <tr>
      <td><div class="cell-title">${escapeHtml(r.code)}</div><div class="cell-sub">${escapeHtml(r.title)}</div></td>
      <td>${escapeHtml(r.reporter.name)}</td>
      <td><div>${escapeHtml(r.locality || '—')}</div><div class="cell-sub">${escapeHtml(r.address)}</div></td>
      <td>${priorityBadge(r.priority)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="cell-sub">${timeAgo(r.reportedAt)}</td>
      <td><div class="actions"><a class="btn btn-ghost btn-sm" href="#/reports/${escapeHtml(r.code)}">${icon('eye')} Open</a></div></td>
    </tr>`).join('');
}

export default { render, mount };
