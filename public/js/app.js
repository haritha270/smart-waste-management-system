/**
 * Application bootstrap: session loading, hash router, role-based access
 * control and the two layouts (public site / dashboard shell).
 */

import { session, api, setSession, clearSession, onSessionChange, refreshUnread } from './api.js';
import { icon } from './icons.js';
import { escapeHtml as esc, avatarClass, initials, destroyCharts } from './ui.js';

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

const CITIZEN = 'citizen';
const ADMIN = 'admin';
const WORKER = 'worker';

/** roles: 'public' = anyone, 'guest' = only logged out users, array = restricted */
const routes = [
  { path: '/', page: 'landing', layout: 'public', roles: 'public', title: 'Smart Waste Management System' },
  { path: '/about', page: 'about', layout: 'public', roles: 'public', title: 'About the Project' },
  { path: '/login', page: 'login', layout: 'bare', roles: 'guest', title: 'Login' },
  { path: '/register', page: 'register', layout: 'bare', roles: 'guest', title: 'Register' },
  { path: '/forgot-password', page: 'forgot-password', layout: 'bare', roles: 'guest', title: 'Forgot Password' },

  { path: '/dashboard', page: 'citizen/dashboard', layout: 'app', roles: [CITIZEN], title: 'Citizen Dashboard' },
  { path: '/report', page: 'citizen/report-new', layout: 'app', roles: [CITIZEN], title: 'Report Waste' },
  { path: '/reports', page: 'citizen/my-reports', layout: 'app', roles: [CITIZEN], title: 'My Complaints' },
  { path: '/reports/:code', page: 'report-detail', layout: 'app', roles: [CITIZEN, ADMIN, WORKER], title: 'Complaint Details' },
  { path: '/map', page: 'map', layout: 'app', roles: [CITIZEN, ADMIN, WORKER], title: 'Waste Map' },
  { path: '/notifications', page: 'notifications', layout: 'app', roles: [CITIZEN, ADMIN, WORKER], title: 'Notifications' },
  { path: '/profile', page: 'profile', layout: 'app', roles: [CITIZEN, ADMIN, WORKER], title: 'Profile & Settings' },

  { path: '/worker', page: 'worker/dashboard', layout: 'app', roles: [WORKER], title: 'Worker Portal' },
  { path: '/worker/tasks', page: 'worker/tasks', layout: 'app', roles: [WORKER], title: 'My Assigned Tasks' },
  { path: '/worker/action', page: 'worker/action', layout: 'bare', roles: 'public', title: 'Work Order Action' },

  { path: '/admin', page: 'admin/dashboard', layout: 'app', roles: [ADMIN], title: 'Admin Dashboard' },
  { path: '/admin/reports', page: 'admin/reports', layout: 'app', roles: [ADMIN], title: 'Manage Complaints' },
  { path: '/admin/workers', page: 'admin/workers', layout: 'app', roles: [ADMIN], title: 'Manage Workers' },
  { path: '/admin/users', page: 'admin/users', layout: 'app', roles: [ADMIN], title: 'Users & Citizens' },
  { path: '/admin/analytics', page: 'admin/analytics', layout: 'app', roles: [ADMIN], title: 'Analytics' },
  { path: '/admin/notifications', page: 'admin/notifications', layout: 'app', roles: [ADMIN], title: 'Notification Centre' },
];

/** Page modules (loaded lazily). */
const pageModules = {
  landing: () => import('./pages/landing.js'),
  about: () => import('./pages/about.js'),
  login: () => import('./pages/login.js'),
  register: () => import('./pages/register.js'),
  'forgot-password': () => import('./pages/forgot-password.js'),
  'citizen/dashboard': () => import('./pages/citizen/dashboard.js'),
  'citizen/report-new': () => import('./pages/citizen/report-new.js'),
  'citizen/my-reports': () => import('./pages/citizen/my-reports.js'),
  'report-detail': () => import('./pages/report-detail.js'),
  map: () => import('./pages/map.js'),
  notifications: () => import('./pages/notifications.js'),
  profile: () => import('./pages/profile.js'),
  'worker/dashboard': () => import('./pages/worker/dashboard.js'),
  'worker/tasks': () => import('./pages/worker/tasks.js'),
  'worker/action': () => import('./pages/worker/action.js'),
  'admin/dashboard': () => import('./pages/admin/dashboard.js'),
  'admin/reports': () => import('./pages/admin/reports.js'),
  'admin/workers': () => import('./pages/admin/workers.js'),
  'admin/users': () => import('./pages/admin/users.js'),
  'admin/analytics': () => import('./pages/admin/analytics.js'),
  'admin/notifications': () => import('./pages/admin/notifications.js'),
};

/** Where each role lands after login (and on access errors). */
export const ROLE_HOME = { citizen: '/dashboard', worker: '/worker', admin: '/admin' };

/* ------------------------------------------------------------------ */
/* Sidebar navigation per role                                         */
/* ------------------------------------------------------------------ */

const NAV = {
  citizen: [
    { section: 'Overview' },
    { path: '/dashboard', label: 'Dashboard', icon: 'grid' },
    { path: '/report', label: 'Report Waste', icon: 'plus-circle' },
    { path: '/reports', label: 'My Complaints', icon: 'file-text' },
    { section: 'Explore' },
    { path: '/map', label: 'Waste Map', icon: 'map' },
    { path: '/notifications', label: 'Notifications', icon: 'bell', badge: 'unread' },
    { path: '/profile', label: 'Profile & Settings', icon: 'settings' },
  ],
  worker: [
    { section: 'Field Work' },
    { path: '/worker', label: 'Worker Dashboard', icon: 'grid' },
    { path: '/worker/tasks', label: 'Assigned Tasks', icon: 'truck' },
    { section: 'Explore' },
    { path: '/map', label: 'Waste Map', icon: 'map' },
    { path: '/notifications', label: 'Notifications', icon: 'bell', badge: 'unread' },
    { path: '/profile', label: 'Profile & Settings', icon: 'settings' },
  ],
  admin: [
    { section: 'Management' },
    { path: '/admin', label: 'Dashboard', icon: 'grid' },
    { path: '/admin/reports', label: 'Complaints', icon: 'file-text' },
    { path: '/admin/workers', label: 'Manage Workers', icon: 'truck' },
    { path: '/admin/users', label: 'Citizens & Users', icon: 'users' },
    { section: 'Insights' },
    { path: '/admin/analytics', label: 'Analytics', icon: 'bar-chart' },
    { path: '/map', label: 'Waste Map', icon: 'map' },
    { path: '/admin/notifications', label: 'Broadcast / Alerts', icon: 'megaphone', badge: 'unread' },
    { path: '/profile', label: 'Profile & Settings', icon: 'settings' },
  ],
};

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const appRoot = () => document.getElementById('app');
let currentCleanup = null;
let bootstrapped = false;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart || '/';
  const query = {};
  new URLSearchParams(queryPart || '').forEach((v, k) => { query[k] = v; });
  return { path, query };
}

/** Match a route pattern such as /reports/:code. Returns params or null. */
function matchRoute(pattern, path) {
  const pp = pattern.split('/').filter(Boolean);
  const ap = path.split('/').filter(Boolean);
  if (pp.length !== ap.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
    else if (pp[i] !== ap[i]) return null;
  }
  return params;
}

function navigate(path) {
  const clean = String(path || '/').replace(/^#/, '');
  location.hash = '#' + (clean.startsWith('/') ? clean : '/' + clean);
}

/* ------------------------------------------------------------------ */
/* Layouts                                                             */
/* ------------------------------------------------------------------ */

function footerHtml() {
  return `
  <footer class="footer">
    <div class="footer-grid">
      <div>
        <a class="brand" href="#/"><span class="brand-mark">♻️</span><span>SmartWMS</span></a>
        <p>A civic technology platform connecting citizens and municipal administrators to keep our cities clean, healthy and liveable.</p>
        <div class="footer-social">
          <a href="#/about" aria-label="About the project">${icon('info')}</a>
          <a href="#/login" aria-label="Login">${icon('log-out')}</a>
          <a href="#/register" aria-label="Register">${icon('user-plus')}</a>
        </div>
      </div>
      <div>
        <h4>Citizens</h4>
        <a href="#/register">Create an account</a>
        <a href="#/report">Report waste</a>
        <a href="#/reports">Track complaints</a>
        <a href="#/map">Waste map</a>
      </div>
      <div>
        <h4>Municipality</h4>
        <a href="#/login">Admin login</a>
        <a href="#/admin">Admin dashboard</a>
        <a href="#/admin/analytics">Analytics</a>
        <a href="#/about">Project workflow</a>
      </div>
      <div>
        <h4>Support</h4>
        <a href="#/about">About the project</a>
        <a href="#/about">Technologies</a>
        <a href="#/notifications">Notifications</a>
        <a href="#/profile">Settings</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} Smart Waste Management System · Municipal Corporation</span>
      <span>Built with Express, SQLite, Leaflet &amp; Chart.js · Map data © OpenStreetMap</span>
    </div>
  </footer>`;
}

function publicLayout(title, inner, activePath) {
  const logged = !!session.user;
  return `
  <div class="public-shell">
    <nav class="nav">
      <div class="nav-inner">
        <a class="brand" href="#/">
          <span class="brand-mark">♻️</span>
          <span>SmartWMS<small>Municipal Corporation</small></span>
        </a>
        <div class="nav-links">
          <a href="#/" class="${activePath === '/' ? 'active' : ''}">Home</a>
          <a href="#/about" class="${activePath === '/about' ? 'active' : ''}">About</a>
          ${logged ? `<a href="#${ROLE_HOME[session.user.role]}">Dashboard</a><a href="#/map">Waste Map</a>` : ''}
        </div>
        <div class="nav-actions">
          ${logged
            ? `<a class="btn btn-primary btn-sm" href="#${ROLE_HOME[session.user.role]}">${icon('grid')} Open Dashboard</a>`
            : `<a class="btn btn-ghost btn-sm" href="#/login">Login</a>
               <a class="btn btn-primary btn-sm" href="#/register">${icon('user-plus')} Register</a>`}
        </div>
      </div>
    </nav>
    <main class="public-main route-enter">${inner}</main>
    ${footerHtml()}
  </div>`;
}

function appLayout(route, ctx) {
  const user = session.user;
  const items = NAV[user.role] || [];
  const current = ctx.path;

  const navHtml = (() => {
    const pathItems = items.filter((i) => !i.section);
    // Exact match wins; otherwise use the most specific prefix match so that
    // "/admin/workers" highlights "Workers" and not also "Dashboard".
    let activePath = pathItems.find((i) => i.path === current);
    if (!activePath) {
      activePath = pathItems
        .filter((i) => i.path !== '/' && current.startsWith(i.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0];
    }
    return items.map((it) => {
      if (it.section) return `<div class="nav-label">${esc(it.section)}</div>`;
      const active = activePath && activePath.path === it.path;
      const badge = it.badge === 'unread' && session.unreadNotifications > 0
        ? `<span class="side-count">${session.unreadNotifications}</span>`
        : '';
      return `<a class="side-link ${active ? 'active' : ''}" href="#${it.path}">${icon(it.icon)}<span>${esc(it.label)}</span>${badge}</a>`;
    }).join('');
  })();

  const roleLabel = { citizen: 'Citizen Portal', worker: 'Field Collection Worker', admin: 'Administrator' }[user.role] || 'User Portal';

  return `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head">
        <a class="brand" href="#/"><span class="brand-mark">♻️</span><span>SmartWMS</span></a>
        <span class="sidebar-role">${icon(user.role === 'admin' ? 'shield' : user.role === 'worker' ? 'truck' : 'user')} ${roleLabel}</span>
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-foot">
        <div class="sidebar-user">
          <span class="avatar ${avatarClass(user.name)}">${esc(initials(user.name))}</span>
          <div class="grow" style="min-width:0">
            <div class="su-name">${esc(user.name)}</div>
            <div class="su-mail">${esc(user.email)}</div>
          </div>
          <button class="modal-x" id="side-logout" title="Logout" style="color:#8fa89d">${icon('log-out')}</button>
        </div>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>

    <div class="main-col">
      <header class="topbar">
        <button class="burger" id="burger" aria-label="Toggle menu">${icon('menu')}</button>
        <div style="min-width:0">
          <h1>${esc(route.title)}</h1>
          <div class="crumb">${esc(roleLabel)} · ${esc(ctx.path)}</div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="top-bell" title="Notifications">
            ${icon('bell')}
            <span class="ping ${session.unreadNotifications ? '' : 'hidden'}" id="bell-count">${session.unreadNotifications}</span>
          </button>
          <div class="user-menu">
            <button class="user-btn" id="user-btn">
              <span class="avatar ${avatarClass(user.name)} avatar-sm">${esc(initials(user.name))}</span>
              <span>
                <span class="ub-name">${esc(user.name)}</span>
                <span class="ub-role">${esc(user.role)}</span>
              </span>
              ${icon('chevron-down')}
            </button>
          </div>
        </div>
      </header>
      <div class="page route-enter" id="page-content"></div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Render cycle                                                        */
/* ------------------------------------------------------------------ */

function notFoundScreen(path) {
  return `
    <div class="section" style="display:grid;place-items:center;min-height:70vh;text-align:center">
      <div>
        <div style="font-size:4rem">🗑️</div>
        <h1 style="font-size:2rem;margin:12px 0 6px">Page not found</h1>
        <p class="muted">The page <code>${esc(path)}</code> does not exist.</p>
        <a class="btn btn-primary" href="#/">${icon('home')} Back to home</a>
      </div>
    </div>`;
}

function deniedScreen(route) {
  const home = session.user ? ROLE_HOME[session.user.role] : '/';
  return `
  <div class="section" style="display:grid;place-items:center;min-height:70vh;padding:24px">
    <div class="card card-pad center" style="max-width:480px">
      <div class="empty-state" style="border:none;padding:0">
        <div class="es-icon" style="background:#fef2f2;color:#dc2626">${icon('shield')}</div>
        <h3>Access denied</h3>
        <p>Your account (<strong>${esc(session.user.role)}</strong>) cannot open <strong>${esc(route.title)}</strong>.
        Role-based access keeps citizen and admin areas separated.</p>
        <a class="btn btn-primary" href="#${home}">${icon('home')} Go to my dashboard</a>
      </div>
    </div>
  </div>`;
}

async function render() {
  if (!bootstrapped) return;
  const { path, query } = parseHash();
  const app = appRoot();

  // Cleanup the previous page (charts, maps, listeners).
  destroyCharts();
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (err) { console.error(err); }
  }
  currentCleanup = null;
  closeUserDropdown();

  const matched = routes.map((r) => ({ r, params: matchRoute(r.path, path) })).find((m) => m.params !== null);

  /* Unknown route */
  if (!matched) {
    if (session.user) {
      app.innerHTML = appLayout({ title: 'Not Found' }, { path });
      document.getElementById('page-content').innerHTML = notFoundScreen(path);
      wireShell();
    } else {
      app.innerHTML = `<div class="public-shell"><main class="public-main">${notFoundScreen(path)}</main>${footerHtml()}</div>`;
    }
    document.title = 'Page not found · SmartWMS';
    return;
  }

  const route = matched.r;
  const params = matched.params;

  /* Access control ------------------------------------------------- */
  if (route.roles === 'guest' && session.user) {
    navigate(ROLE_HOME[session.user.role]);
    return;
  }
  if (Array.isArray(route.roles) && !session.user) {
    // Store the path without the leading '#' (same convention as api.js).
    sessionStorage.setItem('wms_return', location.hash.replace(/^#/, ''));
    import('./ui.js').then(({ toast }) => toast('Please log in to access that page.', 'warning'));
    navigate('/login');
    return;
  }
  if (Array.isArray(route.roles) && session.user && !route.roles.includes(session.user.role)) {
    app.innerHTML = deniedScreen(route);
    document.title = 'Access denied · SmartWMS';
    return;
  }

  /* Load the page module ------------------------------------------- */
  let mod;
  try {
    mod = await pageModules[route.page]();
  } catch (err) {
    console.error('Failed to load page module', route.page, err);
    app.innerHTML = `<div class="page"><div class="alert alert-error">${icon('alert-circle')} Failed to load this page. Please reload.</div></div>`;
    return;
  }
  const page = mod.default || mod;
  const ctx = { params, query, path, user: session.user, navigate };
  const html = page.render(ctx);

  /* Build the shell ------------------------------------------------- */
  if (route.layout === 'app') {
    app.innerHTML = appLayout(route, ctx);
    document.getElementById('page-content').innerHTML = html;
    wireShell();
  } else if (route.layout === 'bare') {
    app.innerHTML = html;
  } else {
    app.innerHTML = publicLayout(route.title, html, path);
  }

  document.title = `${route.title} · Smart Waste Management System`;

  /* Mount: data loading + event wiring ------------------------------ */
  const content = document.getElementById('page-content') || app.querySelector('main') || app;
  if (typeof page.mount === 'function') {
    try {
      const cleanup = page.mount(content, ctx);
      if (typeof cleanup === 'function') currentCleanup = cleanup;
    } catch (err) {
      console.error('Page mount failed:', err);
      content.insertAdjacentHTML('afterbegin', `<div class="alert alert-error">${icon('alert-circle')} This page failed to render properly. ${esc(err.message)}</div>`);
    }
  }
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ */
/* Shell wiring (sidebar, dropdowns, bell)                             */
/* ------------------------------------------------------------------ */

function wireShell() {
  const burger = document.getElementById('burger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const close = () => {
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  };

  if (burger) burger.onclick = () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); };
  if (overlay) overlay.onclick = close;
  document.querySelectorAll('.side-link').forEach((a) => a.addEventListener('click', close));

  const bell = document.getElementById('top-bell');
  if (bell) bell.onclick = () => navigate('/notifications');

  const logoutBtn = document.getElementById('side-logout');
  if (logoutBtn) logoutBtn.onclick = doLogout;

  const userBtn = document.getElementById('user-btn');
  if (userBtn) {
    userBtn.onclick = (e) => {
      e.stopPropagation();
      if (ddEl) return closeUserDropdown();
      openUserDropdown();
      // Close as soon as the user clicks anywhere else.
      setTimeout(() => document.addEventListener('click', outsideDropdown), 0);
    };
  }
}

function outsideDropdown(e) {
  if (ddEl && !ddEl.contains(e.target)) closeUserDropdown();
}

let ddEl = null;
function openUserDropdown() {
  const menu = document.querySelector('.user-menu');
  if (!menu || !session.user) return;
  const u = session.user;
  ddEl = document.createElement('div');
  ddEl.className = 'dropdown';
  ddEl.innerHTML = `
    <div class="dd-head">
      <strong>${esc(u.name)}</strong>
      <span>${esc(u.email)} · ${esc(u.role)}</span>
    </div>
    <a href="#/profile">${icon('user')} Profile &amp; settings</a>
    <a href="#/notifications">${icon('bell')} Notifications</a>
    <div class="divider"></div>
    <button class="danger" id="dd-logout">${icon('log-out')} Log out</button>`;
  menu.appendChild(ddEl);
  ddEl.querySelector('#dd-logout').onclick = doLogout;
}

function closeUserDropdown() {
  document.removeEventListener('click', outsideDropdown);
  if (ddEl) { ddEl.remove(); ddEl = null; }
}

async function doLogout() {
  try { await api.post('/auth/logout'); } catch (err) { /* ignore */ }
  clearSession();
  closeUserDropdown();
  navigate('/');
  import('./ui.js').then(({ toast }) => toast('You have been logged out.', 'info'));
}

/* Keep the unread badge in sync whenever the session changes. */
onSessionChange((s) => {
  const count = document.getElementById('bell-count');
  if (count) {
    count.textContent = s.unreadNotifications;
    count.classList.toggle('hidden', !s.unreadNotifications);
  }
  document.querySelectorAll('.side-link .side-count').forEach((c) => {
    c.textContent = s.unreadNotifications;
    c.classList.toggle('hidden', !s.unreadNotifications);
  });
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  try {
    const data = await api.get('/auth/me');
    setSession({ user: data.user, unreadNotifications: data.unreadNotifications });
  } catch (err) {
    clearSession();
  }
  bootstrapped = true;

  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/';
  else await render();

  // Poll for new notifications while the tab stays open.
  setInterval(() => { if (session.user) refreshUnread(); }, 25000);
}

boot();

/* Small helper other modules can use if they need a full re-render. */
window.WMS = { navigate, refresh: render };
