/**
 * DutchIT – Main App Entry Point & Hash Router
 */
import './css/variables.css';
import './css/base.css';
import './css/components.css';
import './css/layout.css';
import './css/animations.css';

import { User } from './js/user.js';
import { Groups } from './js/groups.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderGroupView } from './ui/groupView.js';
import { showToast, closeAllModals } from './ui/modals.js';
import { initGlobalFx, updateFxContext } from './ui/globalFx.js';

const app = document.getElementById('app');

function initApp() {
  // Remove loading screen if present
  const loading = document.getElementById('loading-screen');
  if (loading) loading.remove();

  // Initialize current user state
  User.init();

  if (!User.isSetup()) {
    renderOnboarding(() => {
      window.addEventListener('hashchange', handleRoute);
      initGlobalFx();
      handleRoute();
    });
  } else {
    window.addEventListener('hashchange', handleRoute);
    initGlobalFx();
    handleRoute();
  }
}

function handleRoute() {
  // Always dismiss active modals on navigation
  closeAllModals();

  if (!User.isSetup()) {
    renderOnboarding(() => {
      window.addEventListener('hashchange', handleRoute);
      handleRoute();
    });
    return;
  }

  const hash = window.location.hash;

  if (hash.startsWith('#group/')) {
    const groupId = hash.substring(7);
    const group = Groups.getById(groupId);
    updateFxContext({ groupId, groupName: group?.name || null });
    renderGroupView(app, groupId, () => {
      window.location.hash = '';
    });
  } else if (hash.startsWith('#join/')) {
    const groupId = hash.substring(6);
    try {
      const { group, alreadyMember } = Groups.joinById(groupId);
      if (alreadyMember) {
        showToast(`You're already a member of "${group.name}"`, 'info');
      } else {
        showToast(`Joined "${group.name}" successfully! 🎉`, 'success');
      }
      // Redirect to the newly joined group
      window.location.hash = `#group/${groupId}`;
    } catch (err) {
      showToast(err.message, 'error');
      // Go back to dashboard
      window.location.hash = '';
    }
  } else {
    updateFxContext({ groupId: null, groupName: null });
    renderDashboard(app, (groupId) => {
      window.location.hash = `#group/${groupId}`;
    });
  }
}

// Start app initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
