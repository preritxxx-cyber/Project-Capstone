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
import { isCloudMode } from './js/config.js';
import { Auth } from './js/auth.js';
import { initDataLayer, ensureGroupLoaded } from './js/dataLayer.js';
import { logCloudStatus, setCloudErrorHandler } from './js/cloudStatus.js';

const app = document.getElementById('app');

async function bootstrapUser() {
  if (isCloudMode()) {
    await Auth.init();
    if (Auth.isSignedIn()) {
      await User.initFromAuth();
    } else {
      User.clear();
    }
  } else {
    User.init();
  }
}

async function initApp() {
  setCloudErrorHandler((msg) => showToast(msg, 'error', 8000));

  const loading = document.getElementById('loading-screen');
  if (loading) loading.remove();

  logCloudStatus();

  try {
    await bootstrapUser();
    if (User.isSetup()) {
      await initDataLayer();
    }
  } catch (err) {
    console.error('App init failed:', err);
    showToast(err.message || 'Failed to connect. Check Supabase settings.', 'error');
    if (!isCloudMode()) User.init();
  }

  if (!User.isSetup()) {
    renderOnboarding(async () => {
      await initDataLayer();
      window.addEventListener('hashchange', () => { handleRoute(); });
      initGlobalFx();
      await handleRoute();
    });
  } else {
    window.addEventListener('hashchange', () => { handleRoute(); });
    initGlobalFx();
    await handleRoute();
  }
}

async function handleRoute() {
  closeAllModals();

  if (!User.isSetup()) {
    renderOnboarding(async () => {
      await initDataLayer();
      await handleRoute();
    });
    return;
  }

  const hash = window.location.hash;

  if (hash.startsWith('#group/')) {
    const groupId = hash.substring(7);
    try {
      await ensureGroupLoaded(groupId);
    } catch (err) {
      showToast(err.message || 'Could not load trip.', 'error');
      window.location.hash = '';
      return;
    }
    const group = Groups.getById(groupId);
    if (!group) {
      showToast('Trip not found or you do not have access.', 'error');
      window.location.hash = '';
      return;
    }
    updateFxContext({ groupId, groupName: group?.name || null });
    renderGroupView(app, groupId, () => {
      window.location.hash = '';
    });
  } else if (hash.startsWith('#join/')) {
    const groupId = hash.substring(6);
    try {
      const { group, alreadyMember } = await Groups.joinById(groupId);
      if (alreadyMember) {
        showToast(`You're already a member of "${group.name}"`, 'info');
      } else {
        showToast(`Joined "${group.name}" successfully! 🎉`, 'success');
      }
      window.location.hash = `#group/${groupId}`;
    } catch (err) {
      showToast(err.message, 'error');
      window.location.hash = '';
    }
  } else {
    updateFxContext({ groupId: null, groupName: null });
    renderDashboard(app, (groupId) => {
      window.location.hash = `#group/${groupId}`;
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initApp(); });
} else {
  initApp();
}
