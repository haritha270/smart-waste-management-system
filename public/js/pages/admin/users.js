/**
 * Users & citizens - searchable directory of every account with role filter.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, emptyState, skeletonRows, toast, avatar, formatDate, timeAgo,
} from '../../ui.js';

let users = [];
let role = 'all';
let q = '';

function roleBadge(r) {
  const map = { citizen: ['badge-resolved', 'Citizen'], admin: ['badge-in_progress', 'Admin'] };
  const [cls, label] = map[r] || ['badge-category', r];
  return `<span class="badge ${cls}"><span class="dot"></span>${label}</span>`;
}

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>Users &amp; citizens</h2>
        <p class="desc">Directory of registered citizens and municipal administrators.</p>
      </div>
    </div>

    <div class="filters">
      <div class="search input-icon">
        ${icon('search')}
        <input class="input" type="search" id="u-search" placeholder="Search name, email or phone…" />
      </div>
      <div class="flex-center gap-8" id="role-chips">
        <button class="chip active" data-role="all">All</button>
        <button class="chip" data-role="citizen">Citizens</button>
        <button class="chip" data-role="admin">Administrators</button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>User</th><th>Role</th><th>Phone</th><th>City / Zone</th><th>Reports</th><th>Joined</th><th>Status</th></tr></thead>
          <tbody id="u-body"><tr><td colspan="7">${skeletonRows(6)}</td></tr></tbody>
        </table>
      </div>
    </div>`;
}

function paint() {
  const body = document.getElementById('u-body');
  if (!body) return;
  const filtered = users.filter((u) => {
    const roleOk = role === 'all' || u.role === role;
    const searchOk = !q || [u.name, u.email, u.phone, u.city].some((s) => String(s || '').toLowerCase().includes(q));
    return roleOk && searchOk;
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="7">${emptyState({ iconName: 'search', title: 'No users found', text: 'Try a different search term or role filter.' })}</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map((u) => `
    <tr>
      <td>
        <div class="flex-center" style="gap:11px">
          ${avatar(u.name)}
          <div><div class="cell-title">${escapeHtml(u.name)}</div><div class="cell-sub">${escapeHtml(u.email)}</div></div>
        </div>
      </td>
      <td>${roleBadge(u.role)}</td>
      <td class="cell-sub">${escapeHtml(u.phone || '—')}</td>
      <td class="cell-sub">${escapeHtml(u.city || '—')}</td>
      <td>${u.role === 'citizen' ? `<span class="badge badge-category">${u.reportCount} report${u.reportCount === 1 ? '' : 's'}</span>` : '<span class="muted">—</span>'}</td>
      <td class="cell-sub">${formatDate(u.createdAt)}</td>
      <td><span class="badge ${u.active ? 'badge-resolved' : 'badge-pending'}"><span class="dot"></span>${u.active ? 'Active' : 'Disabled'}</span></td>
    </tr>`).join('');
}

async function mount(root) {
  try {
    const data = await api.get('/admin/users');
    users = data.users || [];
  } catch (err) {
    toast(err.message, 'error');
    document.getElementById('u-body').innerHTML = `<tr><td colspan="7">${emptyState({ iconName: 'alert-circle', title: 'Could not load users', text: err.message })}</td></tr>`;
    return;
  }
  paint();

  document.getElementById('u-search').addEventListener('input', (e) => { q = e.target.value.toLowerCase(); paint(); });
  document.querySelectorAll('#role-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      role = chip.dataset.role;
      document.querySelectorAll('#role-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
      paint();
    });
  });
}

export default { render, mount };
