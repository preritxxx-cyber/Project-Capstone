/**
 * DutchIT – Dashboard View
 */
import { Groups } from '../js/groups.js';
import { Expenses } from '../js/expenses.js';
import { User } from '../js/user.js';
import { formatAmount, getCurrency } from '../js/currencies.js';
import { getInitials, getAvatarColors, escapeHtml, timeAgo, copyToClipboard } from '../js/utils.js';
import { openGroupForm } from './groupForm.js';
import { openModal, closeModal, showToast } from './modals.js';
import { fxHeaderButtonHtml, attachFxHeaderButton } from './globalFx.js';
import { ExpenseStore } from '../js/store.js';
import { isCloudMode } from '../js/config.js';
import { getCloudStatus } from '../js/cloudStatus.js';
import { refreshFromCloud } from '../js/dataLayer.js';

/* ─── Avatar HTML ─── */
function groupAvatarHtml(group) {
  if (group.pictureType === 'upload' && group.picture) {
    return `<img src="${group.picture}" alt="${escapeHtml(group.name)}" style="width:100%;height:100%;object-fit:cover" />`;
  }
  return `<span style="font-size:26px">${group.picture || '✈️'}</span>`;
}

function memberAvatarHtml(name, size = '') {
  const initials = getInitials(name);
  const [bg, fg] = getAvatarColors(name);
  return `<div class="member-avatar ${size}" style="background:linear-gradient(135deg,${bg},${fg})">${initials}</div>`;
}

/* ─── Balance snippet for a group card ─── */
function renderBalanceSnippet(group) {
  const currentUser = User.get();
  if (!currentUser) return '';
  const baseCurrency = group.baseCurrency || 'USD';
  const bal = Expenses.getMemberNetBalance(group.groupId, currentUser.userId);
  if (Math.abs(bal.net) < 0.001) {
    return `<span class="balance-neutral">All settled ✓</span>`;
  }
  const isPositive = bal.net > 0;
  const label = isPositive ? 'You are owed' : 'You owe';
  return `<span class="${isPositive ? 'balance-positive' : 'balance-negative'}">${label} ${formatAmount(Math.abs(bal.net), baseCurrency)}</span>`;
}

/* ─── Group Card ─── */
function renderGroupCard(group) {
  const expCount = ExpenseStore.countByGroup(group.groupId);
  const memberCount = group.members.length;
  const currency = getCurrency(group.baseCurrency);

  return `
    <div class="card card-hover group-card hover-lift animate-fade-in-up" data-group-id="${group.groupId}" id="gc-${group.groupId}">
      <div class="group-card-header">
        <div class="group-card-avatar">${groupAvatarHtml(group)}</div>
        <div class="group-card-info">
          <div class="group-card-name">${escapeHtml(group.name)}</div>
          <div class="group-card-meta">
            <span>${memberCount} member${memberCount !== 1 ? 's' : ''}</span>
            <span style="color:var(--color-border)">·</span>
            <span>${expCount} expense${expCount !== 1 ? 's' : ''}</span>
            <span style="color:var(--color-border)">·</span>
            <span class="badge badge-blue" style="font-size:10px">${currency.code}</span>
          </div>
          <!-- Member avatars row -->
          <div style="display:flex;align-items:center;gap:-4px;margin-top:6px">
            ${group.members.slice(0, 5).map(m => `
              <div style="margin-left:-6px;first-child{margin-left:0}">
                ${memberAvatarHtml(m.name, 'size-sm')}
              </div>
            `).join('')}
            ${memberCount > 5 ? `<div class="member-avatar size-sm" style="background:var(--blue-100);color:var(--blue-600);margin-left:-6px;font-size:10px">+${memberCount - 5}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="group-card-footer">
        <div class="group-card-balance" style="font-size:var(--fs-xs)">
          ${renderBalanceSnippet(group)}
        </div>
        <div style="display:flex;gap:var(--sp-1)">
          <button class="btn btn-ghost btn-icon btn-icon-sm gc-share-btn" data-id="${group.groupId}" title="Share group ID">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          <button class="btn btn-ghost btn-icon btn-icon-sm gc-edit-btn" data-id="${group.groupId}" title="Edit group">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ─── Empty State ─── */
function renderEmptyState() {
  return `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <div class="empty-state-title">No groups yet</div>
      <div class="empty-state-desc">Create a group to start tracking shared expenses on your next trip!</div>
      <button class="btn btn-orange btn-lg" id="empty-create-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Create Your First Group
      </button>
    </div>
  `;
}

/* ─── Join Group Dialog ─── */
function openJoinGroupDialog(onJoined) {
  const modal = openModal({
    title: 'Join a Group',
    content: `
      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <p style="color:var(--color-text-secondary);font-size:var(--fs-sm)">
          Enter the Group ID shared with you to join an existing group.
        </p>
        <div class="form-field">
          <label class="form-label" for="join-group-id">Group ID <span class="required">*</span></label>
          <input type="text" id="join-group-id" class="form-input" placeholder="e.g. usr_abc123xyz_A1B2C3D4E5" autocomplete="off" />
          <span class="form-error hidden" id="join-error">Group not found. Please check the ID.</span>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" id="join-cancel">Cancel</button>
      <button class="btn btn-orange" id="join-submit">Join Group</button>
    `,
    size: 'modal-sm',
  });

  modal.querySelector('#join-cancel').addEventListener('click', closeModal);
  modal.querySelector('#join-submit').addEventListener('click', async () => {
    const groupId = modal.querySelector('#join-group-id')?.value.trim();
    const errEl   = modal.querySelector('#join-error');

    if (!groupId) {
      errEl.textContent = 'Please enter a Group ID.';
      errEl.classList.remove('hidden');
      return;
    }

    const btn = modal.querySelector('#join-submit');
    btn.disabled = true;
    try {
      const { group, alreadyMember } = await Groups.joinById(groupId);
      closeModal();
      if (alreadyMember) {
        showToast(`You're already a member of "${group.name}"`, 'info');
      } else {
        showToast(`Joined "${group.name}" successfully! 🎉`, 'success');
      }
      if (typeof onJoined === 'function') onJoined(group);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
    }
  });

  modal.querySelector('#join-group-id')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modal.querySelector('#join-submit').click();
  });

  setTimeout(() => modal.querySelector('#join-group-id')?.focus(), 50);
}

/* ─── Dashboard Renderer ─── */
export function renderDashboard(app, onGroupOpen) {
  const currentUser = User.get();
  const groups = Groups.getMyGroups();
  const cloud = isCloudMode();
  const cloudStatus = getCloudStatus();
  const syncLabel = cloud
    ? (cloudStatus.signedIn ? '☁️ Cloud sync on' : '⚠️ Sign in for cloud')
    : '💾 Local only';

  app.innerHTML = `
    <!-- Header -->
    <header class="app-header">
      <div class="header-logo" id="header-logo">
        <div class="header-logo-icon">
          <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
            <text x="24" y="34" text-anchor="middle" font-size="26" font-weight="800" fill="#F97316" font-family="Inter,sans-serif">D</text>
          </svg>
        </div>
        <span class="header-logo-text">Dutch<span>IT</span></span>
      </div>

      <div style="flex:1"></div>

      <div class="header-actions">
        ${fxHeaderButtonHtml()}
        <button class="btn btn-secondary btn-sm" id="hdr-join-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          Join Group
        </button>

        <div style="position:relative">
          <div class="user-avatar-btn" id="user-avatar-btn" style="background:linear-gradient(135deg,${getAvatarColors(currentUser?.displayName || '')[0]},${getAvatarColors(currentUser?.displayName || '')[1]})" title="${escapeHtml(currentUser?.displayName || '')}">
            ${getInitials(currentUser?.displayName || '?')}
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="app-view">
      <div class="page-container">
        <div class="page-header">
          <h1 class="page-title">My Trips</h1>
          <p class="page-subtitle">
            ${groups.length > 0
              ? `${groups.length} group${groups.length !== 1 ? 's' : ''} · Track expenses across all your trips`
              : 'Create a group to start splitting expenses'}
          </p>
          ${cloud ? `
            <div style="display:flex;align-items:center;gap:var(--sp-2);margin-top:var(--sp-2);flex-wrap:wrap">
              <span class="badge ${cloudStatus.signedIn ? 'badge-green' : 'badge-orange'}" style="font-size:11px">${syncLabel}</span>
              ${cloudStatus.signedIn ? `<button type="button" class="btn btn-ghost btn-sm" id="dash-refresh-cloud">Refresh from cloud</button>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Groups grid -->
        <div class="groups-grid stagger-children" id="groups-grid">
          ${groups.length > 0
            ? groups.map(renderGroupCard).join('')
            : renderEmptyState()}
        </div>
      </div>
    </main>

    <!-- FAB: Create Group -->
    <button class="fab" id="fab-create" title="Create Group">+</button>
  `;

  if (window.lucide) window.lucide.createIcons();

  /* ─── Events ─── */

  const refresh = () => renderDashboard(app, onGroupOpen);

  // FAB Create
  document.getElementById('fab-create')?.addEventListener('click', () => {
    openGroupForm(null, (saved) => {
      refresh();
      if (typeof onGroupOpen === 'function') onGroupOpen(saved.groupId);
    });
  });

  // Empty state create
  document.getElementById('empty-create-btn')?.addEventListener('click', () => {
    document.getElementById('fab-create')?.click();
  });

  attachFxHeaderButton();

  document.getElementById('dash-refresh-cloud')?.addEventListener('click', async () => {
    try {
      await refreshFromCloud();
      showToast('Reloaded trips from Supabase.', 'success');
      refresh();
    } catch (err) {
      showToast(err.message || 'Cloud refresh failed.', 'error');
    }
  });

  // Join Group
  document.getElementById('hdr-join-btn')?.addEventListener('click', () => {
    openJoinGroupDialog(() => refresh());
  });

  // Group cards: click to open
  document.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking action buttons
      if (e.target.closest('.gc-edit-btn') || e.target.closest('.gc-share-btn')) return;
      const groupId = card.dataset.groupId;
      if (typeof onGroupOpen === 'function') onGroupOpen(groupId);
    });
  });

  // Edit buttons
  document.querySelectorAll('.gc-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = Groups.getById(btn.dataset.id);
      if (group) {
        openGroupForm(group, () => refresh());
      }
    });
  });

  // Share buttons
  document.querySelectorAll('.gc-share-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = btn.dataset.id;
      const group = Groups.getById(groupId);
      await copyToClipboard(groupId);
      showToast(`Group ID copied! Share "${group?.name}" with friends.`, 'success');
    });
  });

  // User avatar menu
  document.getElementById('user-avatar-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = document.querySelector('.user-menu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.innerHTML = `
      <div class="user-menu-header">
        <div class="user-menu-name">${escapeHtml(currentUser?.displayName || '')}</div>
        <div class="user-menu-id">${currentUser?.userId || ''}</div>
      </div>
      <button class="user-menu-item" id="um-edit-name">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit Name
      </button>
    `;

    document.getElementById('user-avatar-btn').appendChild(menu);

    menu.querySelector('#um-edit-name')?.addEventListener('click', () => {
      menu.remove();
      openEditNameModal(() => refresh());
    });

    document.addEventListener('click', () => menu.remove(), { once: true });
  });
}

/* ─── Edit Name Modal ─── */
function openEditNameModal(onSaved) {
  const currentUser = User.get();
  const modal = openModal({
    title: 'Edit Your Name',
    content: `
      <div class="form-field">
        <label class="form-label" for="edit-name-input">Display Name <span class="required">*</span></label>
        <input type="text" id="edit-name-input" class="form-input" value="${escapeHtml(currentUser?.displayName || '')}" maxlength="40" />
        <span class="form-error hidden" id="edit-name-error">Please enter your name.</span>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" id="en-cancel">Cancel</button>
      <button class="btn btn-orange" id="en-save">Save</button>
    `,
    size: 'modal-sm',
  });

  setTimeout(() => modal.querySelector('#edit-name-input')?.focus(), 50);
  modal.querySelector('#en-cancel').addEventListener('click', closeModal);
  modal.querySelector('#en-save').addEventListener('click', () => {
    const name = modal.querySelector('#edit-name-input')?.value.trim();
    if (!name) {
      modal.querySelector('#edit-name-error')?.classList.remove('hidden');
      return;
    }
    User.updateName(name);
    showToast('Name updated!', 'success');
    closeModal();
    if (typeof onSaved === 'function') onSaved();
  });
}
