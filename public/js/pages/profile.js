/**
 * Profile & settings: personal details, password change and account summary.
 */

import { api, session, setSession } from '../api.js';
import { icon } from '../icons.js';
import {
  escapeHtml, toast, setLoading, clearFieldErrors, setFieldError, showFormAlert,
  avatar, formatDate, confirmDialog,
} from '../ui.js';

function render() {
  const u = session.user || {};
  return `
    <div class="page-head">
      <div>
        <h2>Profile &amp; settings</h2>
        <p class="desc">Manage your personal details, password and account preferences.</p>
      </div>
    </div>

    <div class="panel-grid">
      <!-- Account summary -->
      <div class="col-4">
        <div class="card card-pad center">
          ${avatar(u.name, 'avatar-lg')}
          <h3 style="margin-top:14px;font-size:1.15rem">${escapeHtml(u.name || '')}</h3>
          <div class="text-sm muted">${escapeHtml(u.email || '')}</div>
          <div class="flex-center wrap gap-8" style="justify-content:center;margin-top:14px">
            <span class="badge badge-resolved"><span class="dot"></span>${escapeHtml((u.role || '').toUpperCase())}</span>
            <span class="badge badge-category">${icon('shield')} Verified account</span>
          </div>
          <hr />
          <dl class="kv" style="text-align:left">
            <dt>Phone</dt><dd>${escapeHtml(u.phone || 'Not added')}</dd>
            <dt>City</dt><dd>${escapeHtml(u.city || '—')}</dd>
            <dt>Address</dt><dd>${escapeHtml(u.address || 'Not added')}</dd>
            ${session.worker ? `
              <dt>Employee ID</dt><dd><strong>${escapeHtml(session.worker.employee_code || '—')}</strong></dd>
              <dt>Zone / Ward</dt><dd>${escapeHtml(session.worker.zone || 'All Zones')}</dd>
              <dt>Vehicle / Unit</dt><dd>${escapeHtml(session.worker.vehicle || 'Standard')}</dd>
              <dt>Duty Status</dt><dd><span class="badge ${session.worker.status === 'active' ? 'badge-resolved' : 'badge-pending'}">${escapeHtml(session.worker.status || 'active')}</span></dd>
            ` : ''}
            <dt>Member since</dt><dd>${formatDate(u.createdAt)}</dd>
          </dl>
          <button class="btn btn-danger btn-block" id="logout-btn" style="margin-top:18px">${icon('log-out')} Log out</button>
        </div>
      </div>

      <!-- Forms -->
      <div class="col-8" style="display:grid;gap:20px">
        <div class="form-panel">
          <div class="flex-between" style="margin-bottom:18px">
            <div>
              <h3 style="font-size:1.05rem">Personal information</h3>
              <div class="muted text-sm">Used for contact by municipal administrators regarding your complaints.</div>
            </div>
            <span class="icon-tile">${icon('user')}</span>
          </div>
          <form id="profile-form" novalidate>
            <div class="form-row">
              <div class="field" data-field="name">
                <label for="name">Full name <span class="req">*</span></label>
                <input class="input" id="name" name="name" value="${escapeHtml(u.name || '')}" />
                <span class="field-error"></span>
              </div>
              <div class="field" data-field="phone">
                <label for="phone">Phone</label>
                <input class="input" id="phone" name="phone" value="${escapeHtml(u.phone || '')}" placeholder="98765 43210" />
                <span class="field-error"></span>
              </div>
            </div>
            <div class="field" data-field="address">
              <label for="address">Address / locality</label>
              <input class="input" id="address" name="address" value="${escapeHtml(u.address || '')}" />
              <span class="field-error"></span>
            </div>
            <div class="form-row">
              <div class="field" data-field="city">
                <label for="city">City</label>
                <input class="input" id="city" name="city" value="${escapeHtml(u.city || '')}" />
                <span class="field-error"></span>
              </div>
              <div class="field">
                <label for="role">Account type</label>
                <input class="input" id="role" value="${escapeHtml(u.role || '')}" disabled />
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" type="submit" id="save-profile">${icon('check')} Save changes</button>
            </div>
          </form>
        </div>

        <div class="form-panel">
          <div class="flex-between" style="margin-bottom:18px">
            <div>
              <h3 style="font-size:1.05rem">Change password</h3>
              <div class="muted text-sm">Minimum 6 characters. Your current password is required.</div>
            </div>
            <span class="icon-tile blue">${icon('key')}</span>
          </div>
          <form id="password-form" novalidate>
            <div class="field" data-field="currentPassword">
              <label for="currentPassword">Current password <span class="req">*</span></label>
              <input class="input" type="password" id="currentPassword" name="currentPassword" autocomplete="current-password" />
              <span class="field-error"></span>
            </div>
            <div class="form-row">
              <div class="field" data-field="newPassword">
                <label for="newPassword">New password <span class="req">*</span></label>
                <input class="input" type="password" id="newPassword" name="newPassword" autocomplete="new-password" />
                <span class="field-error"></span>
              </div>
              <div class="field" data-field="confirmPassword">
                <label for="confirmPassword">Confirm new password <span class="req">*</span></label>
                <input class="input" type="password" id="confirmPassword" name="confirmPassword" autocomplete="new-password" />
                <span class="field-error"></span>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-secondary" type="submit" id="save-password">${icon('shield')} Update password</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
}

function mount(root) {
  /* Profile update */
  const profileForm = document.getElementById('profile-form');
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(profileForm);
    const v = (n) => profileForm.elements[n].value.trim();
    let ok = true;
    if (v('name').length < 2) { setFieldError(profileForm.querySelector('[data-field="name"]'), 'Name must be at least 2 characters.'); ok = false; }
    if (v('phone') && !/^[0-9+\-\s()]{7,15}$/.test(v('phone'))) { setFieldError(profileForm.querySelector('[data-field="phone"]'), 'Please enter a valid phone number.'); ok = false; }
    if (!ok) return;

    const btn = document.getElementById('save-profile');
    setLoading(btn, true, 'Saving…');
    try {
      const data = await api.put('/auth/me', {
        name: v('name'), phone: v('phone'), address: v('address'), city: v('city'),
      });
      setSession({ user: data.user, unreadNotifications: session.unreadNotifications });
      toast(data.message, 'success');
    } catch (err) {
      showFormAlert(profileForm, err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  /* Password change */
  const pwForm = document.getElementById('password-form');
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(pwForm);
    const v = (n) => pwForm.elements[n].value;
    let ok = true;
    if (!v('currentPassword')) { setFieldError(pwForm.querySelector('[data-field="currentPassword"]'), 'Current password is required.'); ok = false; }
    if (v('newPassword').length < 6) { setFieldError(pwForm.querySelector('[data-field="newPassword"]'), 'New password must be at least 6 characters.'); ok = false; }
    if (v('confirmPassword') !== v('newPassword')) { setFieldError(pwForm.querySelector('[data-field="confirmPassword"]'), 'Passwords do not match.'); ok = false; }
    if (!ok) return;

    const btn = document.getElementById('save-password');
    setLoading(btn, true, 'Updating…');
    try {
      const data = await api.put('/auth/me', {
        currentPassword: v('currentPassword'),
        newPassword: v('newPassword'),
      });
      toast(data.message, 'success');
      pwForm.reset();
    } catch (err) {
      showFormAlert(pwForm, err.message, 'error');
      if (/current password/i.test(err.message)) {
        setFieldError(pwForm.querySelector('[data-field="currentPassword"]'), err.message);
      }
    } finally {
      setLoading(btn, false);
    }
  });

  /* Logout with confirmation */
  document.getElementById('logout-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Log out?',
      message: 'You will be returned to the home page and need to sign in again.',
      confirmText: 'Log out',
      danger: true,
    });
    if (!ok) return;
    try { await api.post('/auth/logout'); } catch (err) { /* ignore */ }
    import('../api.js').then(({ clearSession }) => clearSession());
    toast('You have been logged out.', 'info');
    location.hash = '#/';
  });
}

export default { render, mount };
