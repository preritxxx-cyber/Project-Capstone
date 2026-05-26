/**
 * DutchIT – Onboarding Screen (First Visit)
 */
import { User } from '../js/user.js';
import { showToast } from './modals.js';

export function renderOnboarding(onComplete) {
  const app = document.getElementById('app');

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
        No signups, no fuss — just enter your name and go.
      </p>

      <div class="feature-pills">
        <span class="feature-pill">🌍 Any currency</span>
        <span class="feature-pill">👥 Group splits</span>
        <span class="feature-pill">📊 Per-currency balances</span>
        <span class="feature-pill">✈️ Trip-ready</span>
      </div>

      <div class="form-field" style="margin-bottom: var(--sp-6)">
        <label class="form-label" for="onboarding-name">
          Your display name <span class="required">*</span>
        </label>
        <div class="input-group">
          <span class="input-icon input-icon-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          <input
            type="text"
            id="onboarding-name"
            class="form-input has-icon-left"
            placeholder="e.g. Prerna, Alex, Maya…"
            maxlength="40"
            autocomplete="given-name"
            autofocus
          />
        </div>
        <span class="form-hint">This is how you'll appear in groups and expenses.</span>
        <span class="form-error hidden" id="onboarding-error">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Please enter your name.
        </span>
      </div>

      <button class="btn btn-orange btn-lg" id="onboarding-submit" style="width:100%">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        Get Started
      </button>

      <p style="text-align:center;font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:var(--sp-4)">
        Your data is stored locally on your device. 🔒
      </p>
    </div>
  `;

  // Remove loading screen if present
  const loading = document.getElementById('loading-screen');
  if (loading) loading.remove();

  app.innerHTML = '';
  app.appendChild(screen);

  // Event handlers
  const nameInput = screen.querySelector('#onboarding-name');
  const submitBtn = screen.querySelector('#onboarding-submit');
  const errorEl  = screen.querySelector('#onboarding-error');

  const handleSubmit = () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.classList.remove('hidden');
      nameInput.classList.add('error');
      nameInput.focus();
      return;
    }
    errorEl.classList.add('hidden');
    nameInput.classList.remove('error');

    User.create(name);
    showToast(`Welcome to DutchIT, ${name}! 🎉`, 'success');

    // Animate out
    screen.style.opacity = '0';
    screen.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      screen.remove();
      if (typeof onComplete === 'function') onComplete();
    }, 300);
  };

  submitBtn.addEventListener('click', handleSubmit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });
  nameInput.addEventListener('input', () => {
    errorEl.classList.add('hidden');
    nameInput.classList.remove('error');
  });
}
