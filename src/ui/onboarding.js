/**
 * DutchIT – Onboarding Screen (First Visit)
 */
import { User } from '../js/user.js';
import { isCloudMode } from '../js/config.js';
import { showToast } from './modals.js';

export function renderOnboarding(onComplete) {
  const app = document.getElementById('app');
  const cloud = isCloudMode();

  const screen = document.createElement('div');
  screen.className = 'onboarding-screen';
  screen.innerHTML = `
    <div class="onboarding-card animate-scale-in">
      <div class="onboarding-logo">
        <div class="onboarding-logo-icon">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <text x="24" y="34" text-anchor="middle" font-size="26" font-weight="800" fill="#F97316" font-family="Inter,sans-serif">D</text>
          </svg>
        </div>
        <div class="onboarding-logo-text">Dutch<em>IT</em></div>
      </div>

      <h1 class="onboarding-headline">Split trips,<br/>not friendships.</h1>
      <p class="onboarding-sub">
        Track shared expenses on international trips in any currency.
        ${cloud ? 'Sign in to sync trips with your group.' : 'No signups, no fuss — just enter your name and go.'}
      </p>

      <div class="feature-pills">
        <span class="feature-pill">🌍 Any currency</span>
        <span class="feature-pill">👥 Group splits</span>
        <span class="feature-pill">📊 Per-currency balances</span>
        <span class="feature-pill">✈️ Trip-ready</span>
      </div>

      ${cloud ? `
        <div class="tabs" style="margin-bottom:var(--sp-4)">
          <button type="button" class="tab-btn active" id="onb-tab-signup">Sign up</button>
          <button type="button" class="tab-btn" id="onb-tab-signin">Sign in</button>
        </div>
        <div class="form-field">
          <label class="form-label" for="onboarding-email">Email <span class="required">*</span></label>
          <input type="email" id="onboarding-email" class="form-input" placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="form-field">
          <label class="form-label" for="onboarding-password">Password <span class="required">*</span></label>
          <input type="password" id="onboarding-password" class="form-input" placeholder="Min. 6 characters" autocomplete="${cloud ? 'new-password' : 'off'}" />
        </div>
      ` : ''}

      <div class="form-field" style="margin-bottom: var(--sp-6)">
        <label class="form-label" for="onboarding-name">
          Your display name <span class="required">*</span>
        </label>
        <div class="input-group">
          <span class="input-icon input-icon-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <input type="text" id="onboarding-name" class="form-input has-icon-left"
            placeholder="e.g. Prerna, Alex, Maya…" maxlength="40" autocomplete="given-name" autofocus />
        </div>
        <span class="form-hint">This is how you'll appear in groups and expenses.</span>
        <span class="form-error hidden" id="onboarding-error"></span>
      </div>

      <button class="btn btn-orange btn-lg" id="onboarding-submit" style="width:100%">
        ${cloud ? 'Create account' : 'Get Started'}
      </button>

      <p style="text-align:center;font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:var(--sp-4)">
        ${cloud ? 'Trips sync via Supabase — share Group ID to collaborate.' : 'Your data is stored locally on your device. 🔒'}
      </p>
    </div>
  `;

  const loading = document.getElementById('loading-screen');
  if (loading) loading.remove();

  app.innerHTML = '';
  app.appendChild(screen);

  let mode = 'signup';
  const nameInput = screen.querySelector('#onboarding-name');
  const submitBtn = screen.querySelector('#onboarding-submit');
  const errorEl = screen.querySelector('#onboarding-error');

  if (cloud) {
    screen.querySelector('#onb-tab-signup')?.addEventListener('click', () => {
      mode = 'signup';
      submitBtn.textContent = 'Create account';
      screen.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      screen.querySelector('#onb-tab-signup')?.classList.add('active');
    });
    screen.querySelector('#onb-tab-signin')?.addEventListener('click', () => {
      mode = 'signin';
      submitBtn.textContent = 'Sign in';
      screen.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      screen.querySelector('#onb-tab-signin')?.classList.add('active');
    });
  }

  const finish = async () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = 'Please enter your name.';
      errorEl.classList.remove('hidden');
      nameInput.classList.add('error');
      nameInput.focus();
      return;
    }

    submitBtn.disabled = true;
    errorEl.classList.add('hidden');
    nameInput.classList.remove('error');

    try {
      if (cloud) {
        const email = screen.querySelector('#onboarding-email')?.value.trim();
        const password = screen.querySelector('#onboarding-password')?.value;
        if (!email || !password) {
          throw new Error('Email and password are required.');
        }
        if (mode === 'signup') {
          await User.createWithAuth(name, email, password);
          showToast(`Welcome to DutchIT, ${name}! 🎉`, 'success');
        } else {
          await User.signIn(email, password);
          User.updateName(name);
          showToast(`Welcome back, ${name}!`, 'success');
        }
      } else {
        User.create(name);
        showToast(`Welcome to DutchIT, ${name}! 🎉`, 'success');
      }

      screen.style.opacity = '0';
      screen.style.transition = 'opacity 0.3s ease';
      setTimeout(async () => {
        screen.remove();
        if (typeof onComplete === 'function') await onComplete();
      }, 300);
    } catch (err) {
      submitBtn.disabled = false;
      errorEl.textContent = err.message || 'Could not sign in.';
      errorEl.classList.remove('hidden');
    }
  };

  submitBtn.addEventListener('click', finish);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
  nameInput.addEventListener('input', () => {
    errorEl.classList.add('hidden');
    nameInput.classList.remove('error');
  });
}
