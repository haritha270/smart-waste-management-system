/**
 * Analytics - the full reporting suite: KPIs,
 * 30-day trends, status pipeline, priority distribution and locality hotspots.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, formatNumber, loaderHtml, emptyState, toast, makeChart,
  barOptions, lineOptions, CHART_COLORS,
} from '../../ui.js';

function kpi({ iconName, tone, value, label, sub }) {
  return `
    <div class="stat-card">
      <div class="icon-tile ${tone}">${icon(iconName)}</div>
      <div><div class="sc-num">${value}</div><div class="sc-label">${escapeHtml(label)}</div>${sub ? `<div class="sc-delta flat">${escapeHtml(sub)}</div>` : ''}</div>
    </div>`;
}

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>System Analytics</h2>
        <p class="desc">Waste complaint trends, resolution performance, priority distribution and locality hotspots.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-soft" href="#/admin">${icon('grid')} Dashboard</a>
        <a class="btn btn-secondary" href="#/map">${icon('map')} Map</a>
      </div>
    </div>

    <div class="stat-grid" id="kpi-grid">${Array.from({ length: 5 }).map(() => `<div class="stat-card"><div class="skeleton" style="width:44px;height:44px;border-radius:13px"></div><div class="grow"><div class="skeleton skel-line" style="width:70%;height:26px"></div><div class="skeleton skel-line" style="width:90%;margin-bottom:0"></div></div></div>`).join('')}</div>

    <div class="panel-grid">
      <div class="col-12">
        <div class="card">
          <div class="card-head">
            <div><h3>Complaints over time</h3><div class="sub">Received vs resolved - last 30 days</div></div>
            <span class="badge badge-category">${icon('calendar')} Daily trend</span>
          </div>
          <div class="card-body"><div class="chart-box tall"><canvas id="a-trend"></canvas></div></div>
        </div>
      </div>

      <div class="col-6">
        <div class="card" style="height:100%">
          <div class="card-head"><div><h3>Complaints by status</h3><div class="sub">Current pipeline status</div></div></div>
          <div class="card-body"><div class="chart-box"><canvas id="a-status"></canvas></div></div>
        </div>
      </div>
      <div class="col-6">
        <div class="card" style="height:100%">
          <div class="card-head"><div><h3>Complaints by priority</h3><div class="sub">Urgent vs standard requests</div></div></div>
          <div class="card-body"><div class="chart-box"><canvas id="a-priority"></canvas></div></div>
        </div>
      </div>

      <div class="col-12">
        <div class="card">
          <div class="card-head"><div><h3>Locality hotspots</h3><div class="sub">Neighborhoods with the most complaints</div></div></div>
          <div class="card-body" id="locality-list" style="padding:24px">${loaderHtml('Loading localities…')}</div>
        </div>
      </div>
    </div>`;
}

async function mount(root) {
  let a;
  try {
    const data = await api.get('/admin/analytics');
    a = data.analytics;
  } catch (err) {
    toast(err.message, 'error');
    document.getElementById('kpi-grid').innerHTML = emptyState({ iconName: 'alert-circle', title: 'Analytics unavailable', text: err.message });
    return;
  }

  /* KPIs */
  document.getElementById('kpi-grid').innerHTML = [
    kpi({ iconName: 'file-text', tone: '', value: formatNumber(a.totals.reports), label: 'Total Complaints', sub: 'All time' }),
    kpi({ iconName: 'activity', tone: 'amber', value: formatNumber(a.totals.open), label: 'Open Complaints', sub: 'Pending action' }),
    kpi({ iconName: 'check-circle', tone: 'teal', value: formatNumber(a.totals.resolved), label: 'Resolved Complaints', sub: `${a.totals.resolutionRate}% resolution rate` }),
    kpi({ iconName: 'clock', tone: 'blue', value: `${a.totals.avgResolutionHours}h`, label: 'Avg resolution time', sub: 'Submission → Resolved' }),
    kpi({ iconName: 'users', tone: 'slate', value: formatNumber(a.totals.users), label: 'Registered Citizens', sub: 'Community members' }),
  ].join('');

  /* Trend */
  makeChart('a-trend', {
    type: 'line',
    data: {
      labels: a.overTime.map((d) => d.day.slice(5)),
      datasets: [
        { label: 'Received', data: a.overTime.map((d) => d.created), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.12)', fill: true, tension: 0.38, borderWidth: 2.4, pointRadius: 2, pointHoverRadius: 5 },
        { label: 'Resolved', data: a.overTime.map((d) => d.resolved), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.14)', fill: true, tension: 0.38, borderWidth: 2.4, pointRadius: 2, pointHoverRadius: 5 },
      ],
    },
    options: lineOptions(),
  });

  /* Status bar */
  makeChart('a-status', {
    type: 'bar',
    data: {
      labels: a.byStatus.map((s) => s.label),
      datasets: [{ data: a.byStatus.map((s) => s.count), backgroundColor: a.byStatus.map((s) => CHART_COLORS[s.status] || '#10b981'), borderRadius: 8, borderSkipped: false, maxBarThickness: 46 }],
    },
    options: barOptions(),
  });

  /* Priority */
  const priorityOrder = ['urgent', 'high', 'medium', 'low'];
  const prioMap = Object.fromEntries(a.byPriority.map((p) => [p.priority, p.count]));
  makeChart('a-priority', {
    type: 'bar',
    data: {
      labels: priorityOrder.map((p) => p.charAt(0).toUpperCase() + p.slice(1)),
      datasets: [{ data: priorityOrder.map((p) => prioMap[p] || 0), backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#94a3b8'], borderRadius: 8, borderSkipped: false, maxBarThickness: 46 }],
    },
    options: barOptions(),
  });

  /* Localities */
  const max = Math.max(...a.topLocalities.map((l) => l.count), 1);
  const locEl = document.getElementById('locality-list');
  if (locEl) {
    if (!a.topLocalities.length) {
      locEl.innerHTML = emptyState({ iconName: 'map', title: 'No location data', text: 'Complaints with a locality will appear here.' });
    } else {
      locEl.innerHTML = `
        <div class="grid-2" style="gap:20px">
          ${a.topLocalities.map((l) => `
            <div>
              <div class="flex-between text-sm" style="margin-bottom:6px">
                <span class="strong">${escapeHtml(l.locality)}</span>
                <span class="muted">${l.count} complaint${l.count === 1 ? '' : 's'}</span>
              </div>
              <div class="progress-track"><div class="progress-fill" style="width:${Math.max(5, (l.count / max) * 100)}%"></div></div>
            </div>
          `).join('')}
        </div>`;
    }
  }
}

export default { render, mount };
