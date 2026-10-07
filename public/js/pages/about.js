/**
 * About the Project page - problem, solution, architecture, workflow,
 * technology stack, database design and future enhancements.
 */

import { icon } from '../icons.js';
import { escapeHtml } from '../ui.js';

const OBJECTIVES = [
  'Give every citizen a 30-second way to report garbage and dumping with photo proof and GPS.',
  'Replace untracked phone complaints with unique, auditable report IDs and a status timeline.',
  'Let municipal administrators manage all incoming complaints, update progress and communicate with citizens.',
  'Provide immediate in-app notifications to administrators when citizens submit new complaints or messages.',
  'Publish city-wide analytics: status distribution, 30-day trends and locality hotspots.',
  'Keep the stack lightweight, robust and free of paid external APIs.',
];

const ARCHITECTURE = [
  { role: 'Citizen', icon: 'user', tone: '', points: ['Register / login', 'Report waste with photo + GPS location', 'Send direct messages to administrator', 'Track live status & in-app alerts'] },
  { role: 'Field Worker', icon: 'truck', tone: 'teal', points: ['Admin-added worker account', 'Assigned tasks dashboard & mobile layout', 'Complainant contact info & GPS map directions', 'One-click "I completed the work" resolution'] },
  { role: 'Administrator', icon: 'shield', tone: 'violet', points: ['Municipal dashboard with KPIs & charts', 'Add field workers & assign tasks to workers', 'Receive instant notifications for citizen complaints', 'Review resolution remarks & broadcast alerts'] },
];

const STACK = [
  ['Frontend', 'HTML5, CSS3, modern JavaScript (ES modules), no build step'],
  ['Charts', 'Chart.js (bar, doughnut, line charts)'],
  ['Maps', 'Leaflet + OpenStreetMap tiles (free, no API key)'],
  ['Backend', 'Node.js + Express REST API'],
  ['Database', 'SQLite schema (users, workers, assignments, reports, notifications, status_history, sessions)'],
  ['Auth', 'Session cookies + scrypt password hashing, role-based route guards'],
  ['Uploads', 'Multer image upload with live camera and file upload validation'],
];

const FUTURE = [
  ['Smart-bin IoT sensors', 'Fill-level sensors push complaints before a bin overflows.'],
  ['Route optimisation', 'Cluster open reports and generate shortest collection paths.'],
  ['QR-based bin identification', 'Scan a bin QR code to prefill location and ward automatically.'],
  ['Email / SMS gateway integration', 'Optionally bridge in-app notifications with external email services.'],
  ['Reward points for citizens', 'Gamify reporting with points, badges and leaderboards for clean localities.'],
  ['Predictive analytics', 'Forecast waste generation by locality, season and festival.'],
];

const WORKFLOW = [
  { who: 'Citizen', steps: ['Register / Login', 'Report waste + photo + GPS location', 'Receive Complaint ID', 'Send queries / messages to admin', 'Get real-time notification on resolution'] },
  { who: 'Administrator', steps: ['Receive in-app notification', 'Review complaint & photos on map', 'Add worker & assign task to worker', 'Track field progress and resolution analytics'] },
  { who: 'Worker', steps: ['Receive assignment notification', 'View citizen address & GPS map navigation', 'Begin collection (In Progress)', 'Click "I completed the work"', 'System notifies citizen & administrator'] },
];

function render() {
  return `
  <section class="about-hero">
    <div class="container">
      <div>
        <a class="btn btn-outline-light btn-sm" href="#/" style="margin-bottom:22px">${icon('arrow-left')} Back to home</a>
        <span class="eyebrow" style="color:#6ee7b7">${icon('info')} About the Project</span>
        <h1 style="margin-top:14px">Smart Waste Management System</h1>
        <p>A full-stack civic application that connects citizens directly with municipal administrators on one transparent, data-driven platform - from the moment garbage is reported to the moment the street is clean.</p>
        <div class="flex-center wrap" style="margin-top:24px;gap:12px">
          <span class="tech-pill" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#dff1e9">${icon('zap')} Node + Express</span>
          <span class="tech-pill" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#dff1e9">${icon('database')} SQLite</span>
          <span class="tech-pill" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#dff1e9">${icon('map')} Leaflet + OSM</span>
          <span class="tech-pill" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#dff1e9">${icon('bar-chart')} Chart.js</span>
        </div>
      </div>
      <div class="about-card">
        <h3 style="color:#fff;font-size:1rem;margin-bottom:14px">The problem</h3>
        <p style="color:#b9d5c9;font-size:.92rem">In most cities garbage complaints travel by phone call or word of mouth. Reports are untracked, nobody receives an ID, the same spot is reported repeatedly and there is no record of how long resolution took.</p>
        <h3 style="color:#fff;font-size:1rem;margin:18px 0 12px">Our solution</h3>
        <p style="color:#b9d5c9;font-size:.92rem;margin:0">One direct workflow with unique complaint IDs, a transparent 3-stage status pipeline, in-app notifications to admin, a live map and analytics - so every issue is visible and manageable.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">${icon('target') || icon('crosshair')} Objectives</span>
        <h2 class="section-title">Project objectives</h2>
        <p class="section-sub">What this application sets out to achieve.</p>
      </div>
      <div class="grid-2">
        ${OBJECTIVES.map((o, i) => `
          <div class="help-item">
            <span class="tick">${icon('check')}</span>
            <div><strong>Objective ${i + 1}</strong><span>${escapeHtml(o)}</span></div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section alt">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">${icon('layers')} Roles &amp; access</span>
        <h2 class="section-title">Three roles, one platform</h2>
        <p class="section-sub">Every screen and API route is protected by role-based guards - citizens report, administrators manage and assign, and field workers collect and resolve.</p>
      </div>
      <div class="grid-3" style="max-width:1080px;margin:0 auto">
        ${ARCHITECTURE.map((a) => `
          <div class="card card-pad card-hover">
            <div class="icon-tile ${a.tone}" style="margin-bottom:14px">${icon(a.icon)}</div>
            <h3 style="font-size:1.05rem;margin-bottom:12px">${a.role}</h3>
            <ul style="list-style:none;padding:0;margin:0;display:grid;gap:9px">
              ${a.points.map((p) => `<li class="flex-center" style="gap:9px;font-size:.88rem;color:var(--ink-500)"><span style="width:6px;height:6px;border-radius:50%;background:var(--brand-500);flex:none"></span>${escapeHtml(p)}</li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">${icon('refresh')} Project workflow</span>
        <h2 class="section-title">How the system operates</h2>
      </div>
      <div class="grid-3" style="max-width:1080px;margin:0 auto;gap:24px">
        ${WORKFLOW.map((w) => `
          <div class="card">
            <div class="card-head"><h3>${w.who} workflow</h3></div>
            <div class="card-body">
              <div class="timeline">
                ${w.steps.map((s, i) => `<div class="tl-item ${i === w.steps.length - 1 ? 'resolved' : 'in_progress'}">
                  <div class="tl-title">${escapeHtml(s)}</div>
                </div>`).join('')}
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div class="card card-pad" style="margin-top:22px;max-width:860px;margin-left:auto;margin-right:auto">
        <h3 style="font-size:1.02rem;margin-bottom:12px">Complaint status pipeline</h3>
        <div class="stepper">
          ${['Pending', 'In Progress', 'Resolved'].map((s, i, arr) => `
            <div class="step ${i === arr.length - 1 ? 'done' : 'current'}">
              <div class="step-dot">${icon(['clock', 'activity', 'check-circle'][i])}</div>
              <div class="step-label">${s}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  </section>

  <section class="section alt">
    <div class="container">
      <div class="grid-2" style="gap:34px">
        <div>
          <div class="section-head" style="margin-bottom:20px">
            <span class="eyebrow">${icon('database')} Database design</span>
            <h2 class="section-title">Tables</h2>
          </div>
          <div class="card">
            <div class="table-wrap">
              <table class="table" style="min-width:auto">
                <thead><tr><th>Table</th><th>Purpose</th></tr></thead>
                <tbody>
                  <tr><td class="cell-title">users</td><td>Citizens and Administrators with secure scrypt hashed passwords</td></tr>
                  <tr><td class="cell-title">reports</td><td>Complaint ID, citizen, description, image, location, status, admin notes</td></tr>
                  <tr><td class="cell-title">status_history</td><td>Audit trail of every status transition</td></tr>
                  <tr><td class="cell-title">notifications</td><td>In-app notifications for citizens and administrators</td></tr>
                  <tr><td class="cell-title">sessions</td><td>Server side login sessions stored in httpOnly cookie</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div>
          <div class="section-head" style="margin-bottom:20px">
            <span class="eyebrow">${icon('layers')} Technologies</span>
            <h2 class="section-title">Tech stack</h2>
          </div>
          <div class="card card-pad" style="display:grid;gap:16px">
            ${STACK.map(([k, v]) => `
              <div>
                <div class="text-xs strong" style="text-transform:uppercase;letter-spacing:.08em;color:var(--brand-700)">${escapeHtml(k)}</div>
                <div style="font-size:.9rem;color:var(--ink-600);margin-top:3px">${escapeHtml(v)}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">${icon('trend')} Roadmap</span>
        <h2 class="section-title">Future enhancements</h2>
        <p class="section-sub">The architecture is ready to grow into these features cleanly.</p>
      </div>
      <div class="grid-3">
        ${FUTURE.map(([t, d], i) => `
          <div class="card card-pad card-hover">
            <div class="flex-center" style="gap:12px;margin-bottom:10px">
              <div class="icon-tile ${['', 'blue', 'violet', 'amber', 'teal', 'red'][i % 6]}" style="width:38px;height:38px">${icon(['zap', 'activity', 'map', 'mail', 'star', 'bar-chart'][i % 6])}</div>
              <h3 style="font-size:.98rem">${escapeHtml(t)}</h3>
            </div>
            <p style="font-size:.87rem;color:var(--ink-500);margin:0">${escapeHtml(d)}</p>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section alt">
    <div class="container">
      <div class="cta-band">
        <div>
          <h2>Ready to get started?</h2>
          <p>Create an account or sign in to access the citizen and administrator portals.</p>
        </div>
        <div class="flex-center wrap">
          <a class="btn btn-primary btn-lg" href="#/login">${icon('log-out')} Open Login</a>
          <a class="btn btn-outline-light btn-lg" href="#/register">${icon('user-plus')} Register</a>
        </div>
      </div>
    </div>
  </section>`;
}

export default { render };
