/**
 * Waste Map - interactive OpenStreetMap view of every reported dump.
 * Markers are colour coded by status; popups show report ID, category,
 * location, status and date, with a link to the full report page.
 */

import { api } from '../api.js';
import { icon } from '../icons.js';
import {
  escapeHtml, statusLabel, formatDate, emptyState, loaderHtml, toast, timeAgo,
} from '../ui.js';

const STATUS_COLORS = {
  pending: '#f59e0b',
  assigned: '#3b82f6',
  in_progress: '#8b5cf6',
  collected: '#14b8a6',
  resolved: '#10b981',
};
const STATUS_EMOJI = { pending: '!', assigned: '→', in_progress: '⟳', collected: '✓', resolved: '✓' };

let map = null;
let layerGroup = null;
let allReports = [];
let activeFilter = 'all';

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>Waste map</h2>
        <p class="desc">Every reported waste location across the city. Click a marker to preview the report and open its full details.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-soft" href="#/reports">${icon('file-text')} My reports</a>
        <a class="btn btn-primary" href="#/report">${icon('plus-circle')} Report Waste</a>
      </div>
    </div>

    <div class="filters" style="padding:12px 14px">
      <div class="search input-icon">
        ${icon('search')}
        <input class="input" type="search" id="map-search" placeholder="Search ID, title or locality…" />
      </div>
      <div class="flex-center wrap gap-8" id="map-filters">
        <button class="chip active" data-filter="all">All</button>
        ${Object.keys(STATUS_COLORS).map((s) => `<button class="chip" data-filter="${s}">${statusLabel(s)}</button>`).join('')}
      </div>
    </div>

    <div class="map-shell" id="map-shell">
      <div class="loader-inline" id="map-loading">${icon('map')} Loading map &amp; reports…</div>
      <div id="waste-map" class="hidden"></div>
      <div class="map-toolbar hidden" id="map-toolbar">
        <input class="map-search" id="map-search-float" placeholder="Search reports on the map…" />
      </div>
      <div class="map-count hidden" id="map-count">0 reports</div>
      <div class="map-legend hidden" id="map-legend">
        ${Object.keys(STATUS_COLORS).map((s) => `<span class="lg"><i style="background:${STATUS_COLORS[s]}"></i>${statusLabel(s)}</span>`).join('')}
      </div>
    </div>

    <div id="map-list" style="margin-top:18px">${loaderHtml('Loading reports…')}</div>`;
}

function markerIcon(status) {
  const color = STATUS_COLORS[status] || '#64748b';
  return L.divIcon({
    className: '',
    html: `<div class="waste-marker" style="background:${color}"><span>${STATUS_EMOJI[status] || '!'}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -26],
  });
}

function popupHtml(r) {
  return `
    ${r.image ? `<img class="popup-img" src="${escapeHtml(r.image)}" alt="" />` : ''}
    <div class="flex-between" style="gap:8px">
      <span class="badge badge-${escapeHtml(r.status)}"><span class="dot"></span>${escapeHtml(r.statusLabel || statusLabel(r.status))}</span>
      ${r.priority ? `<span class="badge badge-subtle">${escapeHtml(r.priority.toUpperCase())}</span>` : ''}
    </div>
    <div class="popup-title">${escapeHtml(r.code)} · ${escapeHtml(r.title)}</div>
    <div class="popup-row"><span>Location</span><b>${escapeHtml(r.locality || r.address)}</b></div>
    <div class="popup-row"><span>Reported</span><b>${formatDate(r.reportedAt, true)}</b></div>
    <a class="btn btn-primary btn-sm full" style="margin-top:10px" href="#/reports/${escapeHtml(r.code)}">${icon('eye')} Open report</a>`;
}

function paintList(reports) {
  const list = document.getElementById('map-list');
  if (!list) return;
  if (!reports.length) {
    list.innerHTML = emptyState({
      iconName: 'search', title: 'No reports match',
      text: 'Try another status filter or search term.',
    });
    return;
  }
  list.innerHTML = `
    <div class="report-grid">
      ${reports.slice(0, 12).map((r) => `
        <a href="#/reports/${escapeHtml(r.code)}" class="card card-pad card-hover" style="text-decoration:none;display:flex;gap:14px;align-items:center;padding:16px">
          <span class="waste-marker" style="background:${STATUS_COLORS[r.status]};transform:rotate(0deg);border-radius:10px;flex:none">
            <span style="transform:none">${STATUS_EMOJI[r.status] || '!'}</span>
          </span>
          <span class="grow" style="min-width:0">
            <span class="flex-center gap-8" style="margin-bottom:4px">
              <b class="strong">${escapeHtml(r.code)}</b>
              <span class="badge badge-${escapeHtml(r.status)}">${escapeHtml(r.statusLabel || statusLabel(r.status))}</span>
            </span>
            <span style="display:block;font-size:.9rem;font-weight:600;color:var(--ink-800)">${escapeHtml(r.title)}</span>
            <span style="display:block;font-size:.78rem;color:var(--ink-400)">${escapeHtml(r.locality || r.address)} · ${timeAgo(r.reportedAt)}</span>
          </span>
        </a>`)
      .join('')}
    </div>
    ${reports.length > 12 ? `<p class="center muted text-sm" style="margin-top:14px">Showing 12 of ${reports.length} reports on the map.</p>` : ''}`;
}

function applyFilters() {
  const q = (document.getElementById('map-search-float').value || document.getElementById('map-search').value || '').trim().toLowerCase();
  const filtered = allReports.filter((r) => {
    const statusOk = activeFilter === 'all' || r.status === activeFilter;
    const searchOk = !q || [r.code, r.title, r.locality, r.address].some((s) => String(s || '').toLowerCase().includes(q));
    return statusOk && searchOk;
  });

  const countEl = document.getElementById('map-count');
  countEl.textContent = `${filtered.length} report${filtered.length === 1 ? '' : 's'}`;
  countEl.classList.remove('hidden');

  if (layerGroup) layerGroup.clearLayers();
  const bounds = [];
  filtered.forEach((r) => {
    if (!layerGroup) return;
    const m = L.marker([r.latitude, r.longitude], { icon: markerIcon(r.status) }).bindPopup(popupHtml(r), { maxWidth: 300 });
    m.addTo(layerGroup);
    bounds.push([r.latitude, r.longitude]);
  });

  if (bounds.length && map) {
    map.fitBounds(bounds, { padding: [46, 46], maxZoom: 14 });
  }
  paintList(filtered);
}

async function mount(root) {
  try {
    const data = await api.get('/map/reports');
    allReports = data.reports || [];
  } catch (err) {
    toast(err.message, 'error');
    document.getElementById('map-list').innerHTML = emptyState({ iconName: 'alert-circle', title: 'Could not load map data', text: err.message });
    document.getElementById('map-loading')?.remove();
    return;
  }

  if (!window.L) {
    document.getElementById('map-shell').innerHTML = emptyState({
      iconName: 'map', title: 'Map library unavailable', text: 'Leaflet could not be loaded. The report list below still works.',
    });
    paintList(allReports);
    return;
  }

  document.getElementById('map-loading').remove();
  const mapEl = document.getElementById('waste-map');
  mapEl.classList.remove('hidden');
  document.getElementById('map-toolbar').classList.remove('hidden');
  document.getElementById('map-legend').classList.remove('hidden');

  map = L.map('waste-map', { scrollWheelZoom: true }).setView([12.9716, 77.5946], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);

  applyFilters();

  /* Filters + search */
  document.querySelectorAll('#map-filters .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll('#map-filters .chip').forEach((c) => c.classList.toggle('active', c === chip));
      applyFilters();
    });
  });
  const onSearch = (e) => {
    const v = e.target.value;
    document.getElementById('map-search').value = v;
    document.getElementById('map-search-float').value = v;
    applyFilters();
  };
  document.getElementById('map-search').addEventListener('input', onSearch);
  document.getElementById('map-search-float').addEventListener('input', onSearch);

  setTimeout(() => map.invalidateSize(), 300);

  return () => { if (map) { map.remove(); map = null; layerGroup = null; } };
}

export default { render, mount };
