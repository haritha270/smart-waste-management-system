import { api, setSession } from '../api.js';
import { icon } from '../icons.js';
import { escapeHtml, toast, setLoading, clearFieldErrors, setFieldError, showFormAlert } from '../ui.js';

function render() {
  return `
  <div class="auth-wrap">
    <aside class="auth-aside">
      <div>
        <a class="brand" href="#/" style="color:#fff"><span class="brand-mark">♻️</span><span>SmartWMS<small>Municipal Corporation</small></span></a>
        <div style="margin-top:44px">
          <h2>Welcome back to cleaner cities.</h2>
          <p style="color:#a9cbbd;font-size:.95rem">Login to report waste, track complaints, message administrators, and manage municipal operations.</p>
          <ul>
            <li>${icon('check-circle')} Unique complaint IDs with full resolution timeline</li>
            <li>${icon('check-circle')} Live map of every reported complaint in the city</li>
            <li>${icon('check-circle')} Instant in-app notifications on status updates</li>
            <li>${icon('check-circle')} Direct municipal management & resolution</li>
          </ul>
        </div>
      </div>
    </aside>

    <div class="auth-panel">
      <div class="auth-card">
        <a class="brand" href="#/" style="margin-bottom:26px"><span class="brand-mark">♻️</span><span>SmartWMS</span></a>
        <h1>Sign in</h1>
        <p class="sub">Enter your credentials to access your dashboard.</p>

        <form id="login-form" novalidate>
          <div class="role-note">${icon('info')}<span>Citizens, field workers and administrators share one sign-in portal. Your role determines your dashboard.</span></div>

          <div class="field" data-field="email">
            <label for="email">Email address <span class="req">*</span></label>
            <div class="input-icon">
              ${icon('mail')}
              <input class="input" type="email" id="email" name="email" placeholder="you@example.com" autocomplete="email" />
            </div>
            <span class="field-error"></span>
          </div>

          <div class="field" data-field="password">
            <label for="password">Password <span class="req">*</span>
              <span class="hint">min. 6 characters</span>
            </label>
            <div class="input-icon" style="position:relative">
              ${icon('key')}
              <input class="input" type="password" id="password" name="password" placeholder="••••••••" autocomplete="current-password" style="padding-right:46px" />
              <button type="button" class="pw-toggle" id="pw-toggle" aria-label="Show password">${icon('eye')}</button>
            </div>
            <span class="field-error"></span>
          </div>

          <div class="flex-between" style="margin:4px 0 20px">
            <label class="check"><input type="checkbox" id="remember" checked /> <span>Keep me signed in</span></label>
            <a href="#/forgot-password" class="text-sm strong" style="color:var(--brand-700)">Forgot password?</a>
          </div>

          <button class="btn btn-primary btn-block btn-lg" type="submit" id="login-btn">
            ${icon('log-out')} Sign in
          </button>
        </form>

        <p class="auth-alt">New to SmartWMS? <a href="#/register"><b>Create a citizen account</b></a></p>
        <p class="auth-alt" style="margin-top:6px"><a href="#/">${icon('arrow-left')} Back to home</a></p>
      </div>
    </div>
  </div>`;
}

function mount(root) {
  const form = document.getElementById('login-form');
  const emailField = form.querySelector('[data-field="email"]');
  const pwField = form.querySelector('[data-field="password"]');

  // Show / hide password.
  const pwToggle = document.getElementById('pw-toggle');
  pwToggle.addEventListener('click', () => {
    const input = form.password;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    pwToggle.innerHTML = show ? icon('eye-off') : icon('eye');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const email = form.email.value.trim();
    const password = form.password.value;
    let valid = true;

    if (!email) { setFieldError(emailField, 'Email is required.'); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setFieldError(emailField, 'Please enter a valid email address.'); valid = false; }

    if (!password) { setFieldError(pwField, 'Password is required.'); valid = false; }
    else if (password.length < 6) { setFieldError(pwField, 'Password must be at least 6 characters.'); valid = false; }

    if (!valid) {
      showFormAlert(form, 'Please correct the highlighted fields and try again.', 'error');
      return;
    }

    const btn = document.getElementById('login-btn');
    setLoading(btn, true, 'Signing in…');
    try {
      const data = await api.post('/auth/login', { email, password });
      setSession(data);
      toast(data.message || 'Logged in successfully.', 'success');

      const back = (sessionStorage.getItem('wms_return') || '').replace(/^#+/, '');
      sessionStorage.removeItem('wms_return');
      const roleHome = { citizen: '/dashboard', worker: '/worker', admin: '/admin' }[data.user.role] || '/dashboard';
      // Normalise the target to a single leading slash so the hash is always '#/path'.
      let target = back && !back.startsWith('/login') ? back : roleHome;
      if (!target.startsWith('/')) target = '/' + target;
      location.hash = '#' + target;
    } catch (err) {
      showFormAlert(form, err.message, 'error');
      if (err.status === 401) {
        setFieldError(pwField, 'Incorrect password for this email.');
      }
    } finally {
      setLoading(btn, false);
    }
  });
}

export default { render, mount };
