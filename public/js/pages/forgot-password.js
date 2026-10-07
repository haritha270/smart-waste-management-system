/**
 * Forgot & Reset Password page.
 *
 * Allows citizens and administrators to request a 6-digit verification code
 * and reset their account password securely.
 */

import { api } from '../api.js';
import { icon } from '../icons.js';
import {
  escapeHtml, toast, setLoading, clearFieldErrors, setFieldError, showFormAlert,
} from '../ui.js';

let step = 1; // 1: request code, 2: verify code & set new password, 3: success
let resetEmail = '';
let resetOtp = '';
let resetToken = '';

function render() {
  return `
  <div class="auth-wrap">
    <aside class="auth-aside">
      <div>
        <a class="brand" href="#/" style="color:#fff"><span class="brand-mark">♻️</span><span>SmartWMS<small>Municipal Corporation</small></span></a>
        <div style="margin-top:44px">
          <h2>Account Security &amp; Recovery</h2>
          <p style="color:#a9cbbd;font-size:.95rem">Recover your login access with verification code protection and encrypted password updates.</p>
          <ul>
            <li>${icon('shield')} 6-digit one-time verification code</li>
            <li>${icon('clock')} 15-minute secure code expiration</li>
            <li>${icon('check-circle')} Instant in-app security notification</li>
            <li>${icon('key')} Scrypt salted password protection</li>
          </ul>
        </div>
      </div>
    </aside>

    <div class="auth-panel">
      <div class="auth-card" id="recovery-card">
        <a class="brand" href="#/" style="margin-bottom:26px"><span class="brand-mark">♻️</span><span>SmartWMS</span></a>
        
        <div id="step-container">
          ${renderStep()}
        </div>
      </div>
    </div>
  </div>`;
}

function renderStep() {
  if (step === 1) {
    return `
      <span class="eyebrow">${icon('key')} Password Recovery</span>
      <h1 style="margin:8px 0 6px">Forgot password?</h1>
      <p class="sub">Enter your registered email address to receive a 6-digit verification code.</p>

      <form id="forgot-form" novalidate>
        <div class="field" data-field="email">
          <label for="recovery-email">Registered email address <span class="req">*</span></label>
          <div class="input-icon">
            ${icon('mail')}
            <input class="input" type="email" id="recovery-email" name="email" value="${escapeHtml(resetEmail)}" placeholder="you@example.com" autocomplete="email" autofocus />
          </div>
          <span class="field-error"></span>
        </div>

        <button class="btn btn-primary btn-block btn-lg" type="submit" id="send-code-btn" style="margin-top:10px">
          ${icon('send')} Generate Verification Code
        </button>
      </form>

      <p class="auth-alt" style="margin-top:24px">Remembered your password? <a href="#/login"><b>Sign in</b></a></p>
      <p class="auth-alt" style="margin-top:6px"><a href="#/">${icon('arrow-left')} Back to home</a></p>
    `;
  }

  if (step === 2) {
    return `
      <span class="eyebrow" style="color:var(--brand-700)">${icon('shield')} Step 2 of 2</span>
      <h1 style="margin:8px 0 6px">Reset your password</h1>
      <p class="sub">Enter the 6-digit verification code sent to <b>${escapeHtml(resetEmail)}</b> and your new password.</p>

      <div style="background:var(--brand-50);border:1.5px solid var(--brand-200);border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div class="text-xs muted" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700">Your Verification Code</div>
          <div style="font-size:1.4rem;font-weight:800;color:var(--brand-800);letter-spacing:.1em">${escapeHtml(resetOtp)}</div>
        </div>
        <button class="btn btn-soft btn-sm" id="copy-otp-btn" type="button">${icon('file-text')} Copy Code</button>
      </div>

      <form id="reset-form" novalidate>
        <div class="field" data-field="otpCode">
          <label for="otpCode">6-Digit Verification Code <span class="req">*</span></label>
          <div class="input-icon">
            ${icon('shield')}
            <input class="input" type="text" id="otpCode" name="otpCode" value="${escapeHtml(resetOtp)}" placeholder="123456" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" />
          </div>
          <span class="field-error"></span>
        </div>

        <div class="field" data-field="newPassword">
          <label for="newPassword">New Password <span class="req">*</span> <span class="hint">min. 6 characters</span></label>
          <div class="input-icon" style="position:relative">
            ${icon('key')}
            <input class="input" type="password" id="newPassword" name="newPassword" placeholder="••••••••" autocomplete="new-password" style="padding-right:46px" />
            <button type="button" class="pw-toggle" id="pw-toggle-1" aria-label="Show password">${icon('eye')}</button>
          </div>
          <span class="field-error"></span>
        </div>

        <div class="field" data-field="confirmPassword">
          <label for="confirmPassword">Confirm New Password <span class="req">*</span></label>
          <div class="input-icon" style="position:relative">
            ${icon('key')}
            <input class="input" type="password" id="confirmPassword" name="confirmPassword" placeholder="••••••••" autocomplete="new-password" style="padding-right:46px" />
            <button type="button" class="pw-toggle" id="pw-toggle-2" aria-label="Show password">${icon('eye')}</button>
          </div>
          <span class="field-error"></span>
        </div>

        <button class="btn btn-primary btn-block btn-lg" type="submit" id="reset-submit-btn" style="margin-top:10px">
          ${icon('check-circle')} Update &amp; Save Password
        </button>
      </form>

      <div class="flex-between wrap" style="margin-top:20px;font-size:.88rem">
        <button class="btn btn-ghost btn-sm" id="resend-code-btn" type="button">${icon('refresh')} Resend code</button>
        <a href="#/login" class="muted strong">Cancel and back to sign in</a>
      </div>
    `;
  }

  // Step 3: Success
  return `
    <div style="text-align:center;padding:10px 0">
      <div class="es-icon" style="width:76px;height:76px;border-radius:50%;background:var(--brand-100);color:var(--brand-700);display:grid;place-items:center;margin:0 auto 18px">
        ${icon('check-circle')}
      </div>
      <h2 style="margin:10px 0 8px">Password Reset Complete!</h2>
      <p class="muted" style="margin-bottom:24px">Your account password has been updated securely. You can now sign in to your dashboard with your new credentials.</p>

      <a class="btn btn-primary btn-block btn-lg" href="#/login">
        ${icon('log-out')} Sign In Now
      </a>
    </div>
  `;
}

function attachEvents() {
  const container = document.getElementById('step-container');
  if (!container) return;

  if (step === 1) {
    const form = document.getElementById('forgot-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);

      const emailInput = form.querySelector('#recovery-email');
      const email = (emailInput?.value || '').trim();

      if (!email) {
        setFieldError(form.querySelector('[data-field="email"]'), 'Please enter your email address.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldError(form.querySelector('[data-field="email"]'), 'Please enter a valid email address.');
        return;
      }

      const btn = document.getElementById('send-code-btn');
      setLoading(btn, true, 'Generating code…');

      try {
        const res = await api.post('/auth/forgot-password', { email });
        resetEmail = res.email || email;
        resetOtp = res.otpCode || '';
        resetToken = res.token || '';
        step = 2;
        toast(res.message || 'Verification code generated.', 'success');
        container.innerHTML = renderStep();
        attachEvents();
      } catch (err) {
        showFormAlert(form, err.message, 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  } else if (step === 2) {
    const form = document.getElementById('reset-form');
    if (!form) return;

    // Toggle password visibility
    document.getElementById('pw-toggle-1')?.addEventListener('click', (e) => {
      const input = document.getElementById('newPassword');
      if (!input) return;
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      e.currentTarget.classList.toggle('active', isPw);
    });

    document.getElementById('pw-toggle-2')?.addEventListener('click', (e) => {
      const input = document.getElementById('confirmPassword');
      if (!input) return;
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      e.currentTarget.classList.toggle('active', isPw);
    });

    // Copy OTP button
    document.getElementById('copy-otp-btn')?.addEventListener('click', () => {
      if (resetOtp) {
        navigator.clipboard?.writeText(resetOtp);
        toast('Verification code copied to clipboard!', 'success');
      }
    });

    // Resend code button
    document.getElementById('resend-code-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.post('/auth/forgot-password', { email: resetEmail });
        resetOtp = res.otpCode || '';
        resetToken = res.token || '';
        toast('New verification code generated!', 'success');
        container.innerHTML = renderStep();
        attachEvents();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Reset password submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);

      const otp = (form.querySelector('#otpCode')?.value || '').trim();
      const pw = form.querySelector('#newPassword')?.value || '';
      const cpw = form.querySelector('#confirmPassword')?.value || '';

      let valid = true;
      if (!otp || otp.length !== 6) {
        setFieldError(form.querySelector('[data-field="otpCode"]'), 'Please enter the 6-digit verification code.');
        valid = false;
      }
      if (!pw || pw.length < 6) {
        setFieldError(form.querySelector('[data-field="newPassword"]'), 'Password must be at least 6 characters long.');
        valid = false;
      }
      if (pw !== cpw) {
        setFieldError(form.querySelector('[data-field="confirmPassword"]'), 'Passwords do not match.');
        valid = false;
      }

      if (!valid) return;

      const btn = document.getElementById('reset-submit-btn');
      setLoading(btn, true, 'Updating password…');

      try {
        const res = await api.post('/auth/reset-password', {
          email: resetEmail,
          otpCode: otp,
          token: resetToken,
          newPassword: pw,
          confirmPassword: cpw,
        });
        toast(res.message || 'Password reset successfully!', 'success');
        step = 3;
        container.innerHTML = renderStep();
        attachEvents();
      } catch (err) {
        showFormAlert(form, err.message, 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  }
}

function mount() {
  step = 1;
  resetEmail = '';
  resetOtp = '';
  resetToken = '';
  attachEvents();
}

export default { render, mount };
