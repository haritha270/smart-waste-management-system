/**
 * Registration page with role selection (Citizen, Worker, Admin).
 * Client side validation mirrors the server rules and every failure shows an
 * inline field error plus an alert banner.
 */

import { api, setSession } from '../api.js';
import { icon } from '../icons.js';
import { toast, setLoading, clearFieldErrors, setFieldError, showFormAlert } from '../ui.js';

function field(name, label, type, placeholder, extra = '', hint = '') {
  return `
    <div class="field" data-field="${name}">
      <label for="${name}">${label}${extra === 'required' ? ' <span class="req">*</span>' : ''}${hint ? `<span class="hint">${hint}</span>` : ''}</label>
      <div class="input-icon">
        ${icon(name === 'email' ? 'mail' : name === 'phone' ? 'phone' : name === 'password' ? 'key' : name === 'name' ? 'user' : name === 'address' ? 'map-pin' : name === 'vehicle' ? 'truck' : 'building')}
        <input class="input" type="${type}" id="${name}" name="${name}" placeholder="${placeholder}"
          autocomplete="${type === 'password' ? 'new-password' : 'off'}"
          ${name === 'password' || name === 'confirmPassword' ? 'style="padding-right:46px"' : ''} />
        ${type === 'password' ? `<button type="button" class="pw-toggle" data-pw-for="${name}" aria-label="Show password">${icon('eye')}</button>` : ''}
      </div>
      <span class="field-error"></span>
    </div>`;
}

function render() {
  return `
  <div class="auth-wrap">
    <aside class="auth-aside">
      <div>
        <a class="brand" href="#/" style="color:#fff"><span class="brand-mark">♻️</span><span>SmartWMS<small>Municipal Corporation</small></span></a>
        <div style="margin-top:44px">
          <h2>Join the clean city movement.</h2>
          <p style="color:#a9cbbd;font-size:.95rem">Create an account to report waste in your locality, message the administrator, and track resolution.</p>
          <ul>
            <li>${icon('camera')} Citizen reporting with photo and GPS location</li>
            <li>${icon('shield')} Dedicated administration portal to manage all complaints</li>
            <li>${icon('bell')} In-app notification alerts for reports and updates</li>
            <li>${icon('map')} Interactive city waste map &amp; status tracking</li>
          </ul>
        </div>
      </div>
    </aside>

    <div class="auth-panel">
      <div class="auth-card">
        <a class="brand" href="#/" style="margin-bottom:26px"><span class="brand-mark">♻️</span><span>SmartWMS</span></a>
        <h1>Create account</h1>
        <p class="sub">Select your account type and enter your details to get started.</p>

        <form id="register-form" novalidate>
          <div class="role-note" style="margin-bottom:18px">
            ${icon('info')}
            <span><strong>Field Workers Notice:</strong> Sanitation and collection workers are added directly by municipal administrators in the Admin portal. If you are a field worker, please <a href="#/login">sign in</a> with your department credentials.</span>
          </div>

          <div class="field" data-field="role">
            <label for="role">Account Role <span class="req">*</span></label>
            <div class="input-icon">
              ${icon('shield')}
              <select class="input" id="role" name="role" style="background:var(--bg-panel);cursor:pointer">
                <option value="citizen" selected>Citizen / Resident</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <span class="field-error"></span>
          </div>

          <div class="field" data-field="name">
            <label for="name">Full name <span class="req">*</span></label>
            <div class="input-icon">${icon('user')}<input class="input" type="text" id="name" name="name" placeholder="e.g. Priya Sharma" autocomplete="name" /></div>
            <span class="field-error"></span>
          </div>

          <div class="form-row">
            ${field('email', 'Email address', 'email', 'you@example.com', 'required')}
            ${field('phone', 'Phone (optional)', 'tel', '98765 43210')}
          </div>

          <div class="field" data-field="address">
            <label for="address"><span id="address-label">Address / Locality</span> <span class="req">*</span></label>
            <div class="input-icon">${icon('map-pin')}<input class="input" type="text" id="address" name="address" placeholder="Flat / street / locality / office" /></div>
            <span class="field-error"></span>
          </div>

          <div class="form-row">
            ${field('city', 'City', 'text', 'Bengaluru')}
            ${field('password', 'Password', 'password', 'Minimum 6 characters', 'required', 'min. 6 characters')}
          </div>

          <div class="field" data-field="confirmPassword">
            <label for="confirmPassword">Confirm password <span class="req">*</span></label>
            <div class="input-icon">${icon('key')}<input class="input" type="password" id="confirmPassword" name="confirmPassword" placeholder="Repeat password" autocomplete="new-password" style="padding-right:46px" /><button type="button" class="pw-toggle" data-pw-for="confirmPassword" aria-label="Show password">${icon('eye')}</button></div>
            <span class="field-error"></span>
          </div>

          <div class="field" data-field="terms">
            <label class="check">
              <input type="checkbox" id="terms" name="terms" />
              <span>I agree to the terms of use and confirm the information provided is accurate.</span>
            </label>
            <span class="field-error"></span>
          </div>

          <button class="btn btn-primary btn-block btn-lg" type="submit" id="register-btn">
            ${icon('user-plus')} Create my account
          </button>
        </form>

        <p class="auth-alt">Already have an account? <a href="#/login"><b>Sign in</b></a></p>
        <p class="auth-alt" style="margin-top:6px"><a href="#/">${icon('arrow-left')} Back to home</a></p>
      </div>
    </div>
  </div>`;
}

function mount(root) {
  const form = document.getElementById('register-form');
  const roleSelect = form.querySelector('#role');
  const addressLabel = form.querySelector('#address-label');

  if (roleSelect && addressLabel) {
    roleSelect.addEventListener('change', () => {
      addressLabel.textContent = roleSelect.value === 'admin' ? 'Office / Department' : 'Address / Locality';
    });
  }

  // Password visibility toggles.
  root.querySelectorAll('[data-pw-for]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = form.querySelector(`#${btn.dataset.pwFor}`);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? icon('eye-off') : icon('eye');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const f = (n) => form.querySelector(`[data-field="${n}"]`);
    const value = (n) => {
      const el = form.elements[n];
      return el ? String(el.value).trim() : '';
    };

    const role = value('role') || 'citizen';
    const name = value('name');
    const email = value('email');
    const phone = value('phone');
    const address = value('address');
    const city = value('city');
    const password = value('password');
    const confirmPassword = value('confirmPassword');
    const terms = form.terms.checked;

    let valid = true;
    const fail = (n, msg) => { setFieldError(f(n), msg); valid = false; };

    if (name.length < 2) fail('name', 'Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('email', 'Please enter a valid email address.');
    if (phone && !/^[0-9+\-\s()]{7,15}$/.test(phone)) fail('phone', 'Please enter a valid phone number.');
    if (address.length < 3) fail('address', 'Please enter your address or department (min 3 characters).');
    if (!city) fail('city', 'City is required.');
    if (password.length < 6) fail('password', 'Password must be at least 6 characters.');
    if (confirmPassword !== password) fail('confirmPassword', 'Passwords do not match.');
    if (!terms) fail('terms', 'Please accept the terms to continue.');

    if (!valid) {
      showFormAlert(form, 'Please correct the highlighted fields.', 'error');
      return;
    }

    const btn = document.getElementById('register-btn');
    setLoading(btn, true, 'Creating account…');
    try {
      const data = await api.post('/auth/register', {
        name,
        email,
        phone,
        address,
        city,
        password,
        confirmPassword,
        role,
      });
      setSession(data);
      toast(`Account created successfully as ${role.toUpperCase()}. Welcome aboard!`, 'success');
      sessionStorage.removeItem('wms_return');
      const roleHome = { citizen: '/dashboard', admin: '/admin' }[data.user.role] || '/dashboard';
      location.hash = '#' + roleHome;
    } catch (err) {
      showFormAlert(form, err.message, 'error');
      if (err.status === 409) setFieldError(f('email'), 'This email is already registered.');
      (err.errors && err.errors.length ? f('email') : f('name')).scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      setLoading(btn, false);
    }
  });
}

export default { render, mount };
