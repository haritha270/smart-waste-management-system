/**
 * Landing / home page.
 * "Cleaner Cities. Smarter Waste Management."
 * Sections: hero, live statistics, how it works,
 * key benefits, statistics band, how citizens can help, CTA.
 */

import { api } from '../api.js';
import { icon } from '../icons.js';
import { escapeHtml, formatNumber } from '../ui.js';

const STEPS = [
  { n: 1, icon: 'camera', title: 'Report the problem', text: 'Click a photo of the waste and drop the pin on the map or use your current GPS location.' },
  { n: 2, icon: 'shield', title: 'Admin assigns worker', text: 'The Administrator reviews the complaint and assigns a dedicated field collection worker.' },
  { n: 3, icon: 'truck', title: 'Worker receives task & map', text: 'The assigned worker gets instant in-app notifications, citizen address & GPS map tracking.' },
  { n: 4, icon: 'check-circle', title: 'I completed the work', text: 'Worker resolves the task with one-click completion, instantly notifying citizen and admin.' },
];

const BENEFITS = [
  { icon: 'zap', tone: 'amber', title: 'Instant reporting', text: 'Report an issue in under 30 seconds from a phone, tablet or laptop - no phone calls needed.' },
  { icon: 'navigation', tone: 'blue', title: 'Pinpoint accuracy', text: 'GPS coordinates and an address are stored with every complaint so teams reach the exact spot.' },
  { icon: 'clock', tone: 'violet', title: 'Live status tracking', text: 'A visual timeline shows exactly where your complaint is in the resolution workflow.' },
  { icon: 'bell', tone: 'teal', title: 'In-app notifications', text: 'The administrator gets instant in-app alerts on new complaints and messages from citizens.' },
  { icon: 'map', tone: '', title: 'City-wide waste map', text: 'An interactive OpenStreetMap view reveals complaint hotspots and resolved cleanups.' },
  { icon: 'shield', tone: 'red', title: 'Direct administration', text: 'Municipal administrators have complete visibility and control over complaint resolution.' },
];

const HELP_ITEMS = [
  { title: 'Report within 24 hours', text: 'Early reporting stops small dumps from becoming large, health-hazardous piles.' },
  { title: 'Add a clear photo', text: 'A good image helps the administration estimate volume and take quick action.' },
  { title: 'Accurate GPS Pin', text: 'Pin the exact spot on the map so municipal teams can navigate directly without delays.' },
  { title: 'Share the complaint ID', text: 'Quote your WM-ID to neighbours or ward offices to speed up follow-ups.' },
  { title: 'Track until resolved', text: 'Follow the status timeline until closure and receive real-time notifications.' },
  { title: 'Encourage your community', text: 'Every active resident helps make their locality cleaner and safer for everyone.' },
];

function heroHtml() {
  return `
  <section class="hero">
    <!-- Background footage: municipal garbage van collecting on its route with a field worker (Mixkit, free license) -->
    <video class="hero-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true" tabindex="-1">
      <source src="/assets/videos/hero-cleaning.mp4" type="video/mp4" />
    </video>
    <div class="hero-video-shade" aria-hidden="true"></div>
    <div class="hero-inner">
      <div>
        <div class="hero-badges">
          <span class="hero-badge">${icon('shield')} Municipal Administrator Portal</span>
          <span class="hero-badge">${icon('map')} OpenStreetMap Powered</span>
          <span class="hero-badge">${icon('bell')} In-App Notifications</span>
        </div>
        <h1>Cleaner Cities. <em>Smarter Waste Management.</em></h1>
        <p class="lead">Report waste problems, message the administrator, and help build a cleaner and healthier community.</p>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg" href="#/register">${icon('plus-circle')} Report Waste</a>
          <a class="btn btn-outline-light btn-lg" href="#/login">${icon('grid')} Explore Dashboard</a>
        </div>
        <div class="hero-note">${icon('info')} Free for citizens · Real-time notifications · Transparent workflow</div>
      </div>
      <div class="hero-visual">
        <div class="hero-map">
          <div class="grid-lines"></div>
          <div class="hero-pin p1"><span>📍</span></div>
          <div class="hero-pin p2"><span>📍</span></div>
          <div class="hero-pin p3"><span>📍</span></div>
          <div class="hero-pin p4"><span>📍</span></div>
        </div>
        <div class="float-card fc-1">
          <div class="fc-top"><span class="badge badge-pending"><span class="dot"></span>Pending</span><span class="fc-code">WM1048</span></div>
          <div class="fc-title">Garbage accumulation near lane</div>
          <div class="fc-sub">📍 100 Ft Road, Indiranagar</div>
        </div>
        <div class="float-card fc-2">
          <div class="fc-top"><span class="badge badge-in_progress"><span class="dot"></span>In Progress</span><span class="fc-code">WM1031</span></div>
          <div class="fc-title">Street waste cleanup</div>
          <div class="fc-sub">🛡️ Admin handling underway</div>
        </div>
        <div class="float-card fc-3">
          <div class="fc-top"><span class="badge badge-resolved"><span class="dot"></span>Resolved</span><span class="fc-code">WM1012</span></div>
          <div class="fc-title">Debris cleared</div>
          <div class="fc-sub">✅ Resolved by Administrator</div>
        </div>
      </div>
    </div>
  </section>`;
}

function statsBandHtml(stats) {
  const s = stats || {};
  const items = [
    { num: formatNumber(s.reports ?? 0), lbl: 'Complaints tracked across the city' },
    { num: `${s.resolutionRate ?? 0}%`, lbl: 'Complaints resolved to closure' },
    { num: formatNumber(s.citizens ?? 0), lbl: 'Registered citizens on the platform' },
    { num: formatNumber(s.localities ?? 0), lbl: 'Localities actively served' },
  ];
  return `<div class="stats-band">${items
    .map((i) => `<div class="stat"><div class="num">${i.num}</div><div class="lbl">${escapeHtml(i.lbl)}</div></div>`)
    .join('')}</div>`;
}

function render() {
  return `
  ${heroHtml()}

  <!-- Live statistics -->
  <section class="section" style="padding-top:clamp(40px,6vw,64px)">
    <div class="container" id="landing-stats">
      ${statsBandHtml(null)}
    </div>
  </section>

  <!-- How it works -->
  <section class="section alt">
    <div class="container">
      <div class="section-head center">
        <span class="eyebrow">${icon('activity')} The workflow</span>
        <h2 class="section-title">How It Works</h2>
        <p class="section-sub" style="margin:12px auto 0">From a photo on your phone to a clean street - direct connection between citizens and municipal administrators.</p>
      </div>
      <div class="grid-4">
        ${STEPS.map((s) => `
          <div class="step-card">
            <div class="step-num">${s.n}</div>
            <div class="icon-tile" style="margin-bottom:12px">${icon(s.icon)}</div>
            <h3>${escapeHtml(s.title)}</h3>
            <p>${escapeHtml(s.text)}</p>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- Key benefits -->
  <section class="section">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">${icon('star')} Why SmartWMS</span>
        <h2 class="section-title">Key Benefits</h2>
        <p class="section-sub">A single platform replaces phone calls, paper registers and guesswork with a transparent, auditable workflow.</p>
      </div>
      <div class="grid-3">
        ${BENEFITS.map((b) => `
          <div class="benefit card-hover">
            <div class="icon-tile ${b.tone}">${icon(b.icon)}</div>
            <div>
              <h3>${escapeHtml(b.title)}</h3>
              <p>${escapeHtml(b.text)}</p>
            </div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- Statistics / impact -->
  <section class="section alt">
    <div class="container">
      <div class="grid-2" style="align-items:center;gap:44px">
        <div>
          <span class="eyebrow">${icon('bar-chart')} City statistics</span>
          <h2 class="section-title" style="margin-top:12px">Every report moves the needle</h2>
          <p class="lead" style="margin-top:14px">Complaints flow through an auditable workflow with status tracking, so nothing gets lost.</p>
          <div class="help-list" style="margin-top:22px">
            <div class="help-item">
              <span class="tick">${icon('check')}</span>
              <div><strong>Live in-app notifications</strong><span>Administrators receive notifications the moment a citizen registers or submits an issue.</span></div>
            </div>
            <div class="help-item">
              <span class="tick">${icon('check')}</span>
              <div><strong>Locality insights</strong><span>Real-time tracking of neighborhoods generating complaints and resolution speed.</span></div>
            </div>
            <div class="help-item">
              <span class="tick">${icon('check')}</span>
              <div><strong>Direct administration</strong><span>Admin manages statuses, adds remarks and keeps citizens informed.</span></div>
            </div>
          </div>
          <a class="btn btn-soft" style="margin-top:22px" href="#/register">${icon('arrow-right')} Start reporting</a>
        </div>
        <div class="card card-pad">
          <div class="flex-between" style="margin-bottom:18px">
            <div><h3 style="font-size:1.05rem">City snapshot</h3><div class="muted text-sm">Live figures from the running application</div></div>
            <span class="badge badge-resolved"><span class="dot"></span>Live</span>
          </div>
          <div id="landing-impact">${Array.from({ length: 4 }).map(() => '<div class="skeleton skel-line" style="height:38px"></div>').join('')}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- How citizens can help -->
  <section class="section">
    <div class="container">
      <div class="section-head center">
        <span class="eyebrow">${icon('users')} Citizen participation</span>
        <h2 class="section-title">How Citizens Can Help</h2>
        <p class="section-sub" style="margin:12px auto 0">Technology works best when the community works with it. Simple habits make a visible difference.</p>
      </div>
      <div class="grid-3">
        ${HELP_ITEMS.map((h, i) => `
          <div class="benefit" style="align-items:flex-start">
            <div class="icon-tile ${i % 2 ? 'blue' : ''}" style="width:38px;height:38px;font-weight:800;font-size:.9rem">${i + 1}</div>
            <div><h3>${escapeHtml(h.title)}</h3><p>${escapeHtml(h.text)}</p></div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="section alt">
    <div class="container">
      <div class="cta-band">
        <div>
          <h2>See garbage? Report it in 30 seconds.</h2>
          <p>Create your account, submit a photo with the exact location, and follow your complaint until it is resolved.</p>
        </div>
        <div class="flex-center wrap">
          <a class="btn btn-primary btn-lg" href="#/register">${icon('plus-circle')} Report Waste</a>
          <a class="btn btn-outline-light btn-lg" href="#/about">${icon('info')} About the Project</a>
        </div>
      </div>
    </div>
  </section>`;
}

function mount(root) {
  api.get('/public-stats')
    .then((data) => {
      const band = document.getElementById('landing-stats');
      if (band) band.innerHTML = statsBandHtml(data.stats);
      const impact = document.getElementById('landing-impact');
      if (impact && data.stats) {
        const s = data.stats;
        const rows = [
          { label: 'Total complaints', value: s.reports, pct: 100, tone: '' },
          { label: 'Resolved complaints', value: s.resolved, pct: s.resolutionRate, tone: '' },
          { label: 'Open complaints', value: s.reports - s.resolved, pct: 100 - s.resolutionRate, tone: 'amber' },
          { label: 'Localities covered', value: s.localities, pct: Math.min(100, s.localities * 12), tone: 'blue' },
        ];
        impact.innerHTML = rows
          .map(
            (r) => `<div style="margin-bottom:15px">
              <div class="flex-between" style="font-size:.85rem;margin-bottom:6px">
                <span class="strong">${escapeHtml(r.label)}</span>
                <span class="muted"><b class="strong">${formatNumber(r.value)}</b></span>
              </div>
              <div class="progress-track"><div class="progress-fill ${r.tone}" style="width:${Math.max(4, r.pct)}%"></div></div>
            </div>`
          )
          .join('');
      }
    })
    .catch(() => { /* keep the fallback markup */ });
}

export default { render, mount };
