/**
 * My Complaints - the citizen's complaint history with status filters, search
 * and a card grid linking to the full complaint details page.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, timeAgo, statusBadge, priorityBadge, emptyState, skeletonCards, toast,
} from '../../ui.js';

const FILTERS = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['in_progress', 'In Progress'],
  ['resolved', 'Resolved'],
];

let reports = [];
let activeFilter = 'all';
let search = '';

function card(r) {
  return `
  <article class="report-card">
    <div class="report-thumb">
      <img src="${escapeHtml(r.image || '')}" alt="${escapeHtml(r.title)}" loading="lazy"
           onerror="this.style.display='none';this.parentNode.style.background='linear-gradient(135deg,var(--brand-700),var(--ink-900))'" />
      <div class="thumb-badges">
        <span class="code-chip">${escapeHtml(r.code)}</span>
        ${statusBadge(r.status)}
      </div>
    </div>
    <div class="report-body">
      <div class="flex-center wrap gap-8">
        ${priorityBadge(r.priority)}
      </div>
      <h3>${escapeHtml(r.title)}</h3>
      <div class="report-meta">
        <div class="row">${icon('map-pin')}<span>${escapeHtml(r.locality || r.address)}</span></div>
        <div class="row">${icon('clock')}<span>Reported ${timeAgo(r.reportedAt)}</span></div>
      </div>
      <div class="report-foot">
        <span class="text-xs muted">${escapeHtml(r.address)}</span>
        <a class="btn btn-soft btn-sm" href="#/reports/${escapeHtml(r.code)}">Details ${icon('chevron-right')}</a>
      </div>
    </div>
  </article>`;
}

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>My complaints</h2>
        <p class="desc">Every waste issue you have raised, with live updates from the administrator.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-primary" href="#/report">${icon('plus-circle')} Report Waste</a>
      </div>
    </div>

    <div class="filters">
      <div class="search input-icon">
        ${icon('search')}
        <input class="input" type="search" id="search-input" placeholder="Search by title, ID or locality…" />
      </div>
      <div class="flex-center wrap gap-8" id="filter-chips">
        ${FILTERS.map(([v, l]) => `<button type="button" class="chip ${v === activeFilter ? 'active' : ''}" data-filter="${v}">${l}</button>`).join('')}
      </div>
    </div>

    <div class="flex-between" style="margin-bottom:16px">
      <div class="text-sm muted" id="result-count">Loading…</div>
      <div class="text-sm muted">${icon('database')} <span id="total-count"></span></div>
    </div>

    <div id="report-list">${skeletonCards(6)}</div>`;
}

function paint() {
  const list = document.getElementById('report-list');
  const countEl = document.getElementById('result-count');
  if (!list) return;

  const filtered = reports.filter((r) => {
    const statusOk = activeFilter === 'all' || r.status === activeFilter;
    const q = search.trim().toLowerCase();
    const searchOk = !q || [r.code, r.title, r.locality, r.address]
      .filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    return statusOk && searchOk;
  });

  if (countEl) countEl.innerHTML = `<b>${filtered.length}</b> of ${reports.length} complaint${reports.length === 1 ? '' : 's'} shown`;
  const totalEl = document.getElementById('total-count');
  if (totalEl) totalEl.textContent = `${reports.length} total`;

  if (!reports.length) {
    list.innerHTML = emptyState({
      iconName: 'camera',
      title: 'No complaints yet',
      text: 'Submit your first waste complaint and track its resolution here.',
      action: `<a class="btn btn-primary" href="#/report">${icon('plus-circle')} Report Waste</a>`,
    });
    return;
  }
  if (!filtered.length) {
    list.innerHTML = emptyState({
      iconName: 'search',
      title: 'No matching complaints',
      text: 'Try a different search term or clear the active status filter.',
      action: `<button class="btn btn-secondary" id="clear-filters">${icon('refresh')} Clear filters</button>`,
    });
    const clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
      clearBtn.onclick = () => {
        activeFilter = 'all';
        search = '';
        document.getElementById('search-input').value = '';
        document.querySelectorAll('#filter-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.filter === 'all'));
        paint();
      };
    }
    return;
  }
  list.innerHTML = `<div class="report-grid">${filtered.map(card).join('')}</div>`;
}

async function mount(root) {
  try {
    const data = await api.get('/reports/mine');
    reports = data.reports || [];
  } catch (err) {
    toast(err.message, 'error');
    document.getElementById('report-list').innerHTML = emptyState({
      iconName: 'alert-circle', title: 'Could not load your complaints', text: err.message,
    });
    return;
  }

  paint();

  document.getElementById('search-input').addEventListener('input', (e) => {
    search = e.target.value;
    paint();
  });

  document.querySelectorAll('#filter-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll('#filter-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
      paint();
    });
  });
}

export default { render, mount };
