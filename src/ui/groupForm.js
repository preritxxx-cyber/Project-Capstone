/**
 * DutchIT – Group Form Modal (Create & Edit)
 */
import { Groups } from '../js/groups.js';
import { User } from '../js/user.js';
import { getCurrency, searchCurrencies, POPULAR_CURRENCIES, formatAmount } from '../js/currencies.js';
import { getInitials, getAvatarColors, readFileAsBase64, compressImage, escapeHtml } from '../js/utils.js';
import { openModal, closeModal, showToast } from './modals.js';

/* ─── Emoji palette for group pictures ─── */
const GROUP_EMOJIS = [
  '✈️','🌍','🏖️','🗺️','🏔️','🏝️','🎒','🌴','🗼','🏰',
  '🎡','🚢','🛳️','🚁','🚀','🎭','🎪','🎠','🌅','🌄',
  '🏕️','⛷️','🤿','🏄','🎿','🚵','🧳','📸','🍜','🥘',
  '🎆','🎇','🌃','🌆','🌉','🎑','🌌','🌠','⛩️','🕌',
  '🦁','🐘','🦒','🦓','🐧','🦜','🦚','🦋','🐠','🐚',
  '🌺','🌻','🌸','🍁','🌵','🎋','🌿','🍄','🌊','❄️',
  '💎','🏆','🎯','🎪','🎸','🎵','🎨','🖼️','📿','🧿',
  '👑','🎁','🎊','🎉','🥂','🍾','🌹','💐','🕯️','⭐',
];

/* ─── Currency Selector Widget ─── */
function makeCurrencySelector(containerId, initialCode = 'USD') {
  let selectedCode = initialCode;
  let isOpen = false;
  let searchQuery = '';

  const render = (container) => {
    const c = getCurrency(selectedCode);
    const results = searchQuery
      ? searchCurrencies(searchQuery)
      : [
          ...POPULAR_CURRENCIES.map(code => ({ ...getCurrency(code), isPopular: true })),
          { divider: true },
          ...searchCurrencies('').filter(c => !POPULAR_CURRENCIES.includes(c.code)),
        ];

    container.innerHTML = `
      <div class="currency-dropdown-btn ${isOpen ? 'open' : ''}" id="curr-btn-${containerId}">
        <span class="currency-code">${c.code}</span>
        <span class="currency-symbol">${c.symbol}</span>
        <span style="flex:1"></span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>
      ${isOpen ? `
        <div class="currency-dropdown-panel">
          <div class="currency-search">
            <input type="text" id="curr-search-${containerId}" placeholder="Search currency…" value="${searchQuery}" autocomplete="off" />
          </div>
          <div class="currency-list">
            ${results.map(item => {
              if (item.divider) return `<div style="height:1px;background:var(--color-border);margin:4px 0;"></div>`;
              return `<div class="currency-option ${item.code === selectedCode ? 'selected' : ''}" data-code="${item.code}">
                <span class="c-code">${item.code}</span>
                <span class="c-name">${item.name}</span>
                <span class="c-symbol">${item.symbol}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Attach events
    container.querySelector(`#curr-btn-${containerId}`).addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      render(container);
      if (isOpen) {
        setTimeout(() => container.querySelector(`#curr-search-${containerId}`)?.focus(), 50);
      }
    });

    if (isOpen) {
      container.querySelector(`#curr-search-${containerId}`)?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render(container);
      });
      container.querySelectorAll('.currency-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedCode = opt.dataset.code;
          isOpen = false;
          searchQuery = '';
          render(container);
          container.dispatchEvent(new CustomEvent('currency-change', { detail: { code: selectedCode } }));
        });
      });
    }
  };

  const closeDropdown = () => {
    if (isOpen) { isOpen = false; }
  };

  return {
    mount(container) { render(container); },
    getValue()       { return selectedCode; },
    setValue(code)   { selectedCode = code; },
    close: closeDropdown,
  };
}

/* ─── Main Group Form ─── */

export function openGroupForm(existingGroup = null, onSaved) {
  const isEdit = !!existingGroup;
  const currentUser = User.get();

  // State
  let groupName     = existingGroup?.name || '';
  let groupPicture  = existingGroup?.picture || GROUP_EMOJIS[0];
  let pictureType   = existingGroup?.pictureType || 'emoji';
  let baseCurrency  = existingGroup?.baseCurrency || 'USD';
  let intermediateCurrency = existingGroup?.intermediateCurrency || '';
  let members       = existingGroup
    ? [...existingGroup.members]
    : currentUser
      ? [{ memberId: currentUser.userId, name: currentUser.displayName, isCreator: true, isDummy: false, joinedAt: new Date().toISOString() }]
      : [];
  let pictureTab    = 'emoji';
  let emojiPage     = 0;
  let saving        = false;

  const EMOJIS_PER_PAGE = 64;

  const modal = openModal({
    title: isEdit ? 'Edit Group' : 'Create Group',
    content: '',
    footer: buildFooter(),
    size: 'modal-wide',
    onClose: () => {},
  });

  function buildFooter() {
    return `
      <button class="btn btn-secondary" id="gf-cancel">Cancel</button>
      <button class="btn btn-orange" id="gf-save">
        ${isEdit ? 'Save Changes' : 'Create Group'}
      </button>
    `;
  }

  function renderBody() {
    const body = modal.querySelector('.modal-body');
    body.innerHTML = `
      <!-- Picture & Name -->
      <div style="display:flex;gap:var(--sp-5);align-items:flex-start;margin-bottom:var(--sp-6)">
        <!-- Picture picker -->
        <div class="picture-picker" style="flex-shrink:0;width:120px">
          <div class="picture-preview" id="gf-pic-preview" title="Click to change">
            ${pictureType === 'upload' && groupPicture
              ? `<img src="${groupPicture}" alt="group" />`
              : `<span style="font-size:40px">${groupPicture || '✈️'}</span>`}
          </div>
          <div class="picture-tabs">
            <button class="picture-tab-btn ${pictureTab==='emoji'?'active':''}" data-tab="emoji">Emoji</button>
            <button class="picture-tab-btn ${pictureTab==='upload'?'active':''}" data-tab="upload">Upload</button>
          </div>
        </div>

        <!-- Name field -->
        <div style="flex:1;min-width:0">
          <div class="form-field">
            <label class="form-label" for="gf-name">Group Name <span class="required">*</span></label>
            <input type="text" id="gf-name" class="form-input" placeholder="e.g. Euro Summer 2026" maxlength="100" value="${escapeHtml(groupName)}" />
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
              <span class="form-error hidden" id="gf-name-error">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span id="gf-name-error-msg">Name is required</span>
              </span>
              <span class="char-counter" id="gf-name-counter" style="margin-left:auto">${groupName.length}/100</span>
            </div>
          </div>

          <!-- Base currency -->
          <div class="form-field" style="margin-top:var(--sp-4)">
            <label class="form-label">Base / Local Currency <span class="required">*</span></label>
            <div class="currency-dropdown" id="gf-base-currency"></div>
            <span class="form-hint">Domestic currency used to finally settle balances.</span>
          </div>

          <!-- Intermediate currency (optional) -->
          <div class="form-field" style="margin-top:var(--sp-4)">
            <label class="form-label">Intermediate Currency <span style="font-weight:400;color:var(--color-text-muted)">(optional)</span></label>
            <div class="currency-dropdown" id="gf-intermediate-currency"></div>
            <span class="form-hint">Bridge currency (e.g. USD, EUR) when converting local ↔ foreign. Leave unset if not used.</span>
          </div>
        </div>
      </div>

      <!-- Picture Panel -->
      <div id="gf-picture-panel" style="margin-bottom:var(--sp-6)">
        ${pictureTab === 'emoji' ? renderEmojiPanel() : renderUploadPanel()}
      </div>

      <!-- Members -->
      <div style="margin-bottom:var(--sp-5)">
        <div class="section-header" style="margin-bottom:var(--sp-3)">
          <span class="section-title" style="font-size:var(--fs-md)">Members</span>
          <span class="badge badge-blue">${members.length}</span>
        </div>

        <!-- Current members list -->
        <div id="gf-members-list">
          ${renderMembersList()}
        </div>

        <!-- Add dummy member -->
        <div class="form-field" style="margin-top:var(--sp-3)">
          <label class="form-label">Add Member</label>
          <div style="display:flex;gap:var(--sp-2)">
            <input type="text" id="gf-new-member" class="form-input" placeholder="Friend's name" maxlength="50" style="flex:1" />
            <button class="btn btn-primary" id="gf-add-member">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add
            </button>
          </div>
          <span class="form-hint">Add friends who don't have an account yet.</span>
        </div>
      </div>

      <!-- Group ID (edit only) -->
      ${isEdit ? `
        <div class="form-field" style="margin-bottom:var(--sp-4)">
          <label class="form-label">Group ID (share to invite)</label>
          <div class="copy-field">
            <span class="copy-field-value">${existingGroup.groupId}</span>
            <button class="copy-field-btn" id="gf-copy-id">Copy</button>
          </div>
        </div>
      ` : ''}
    `;

    // Bind currency selectors
    const currContainer = modal.querySelector('#gf-base-currency');
    const currSelector = makeCurrencySelector('base', baseCurrency);
    currSelector.mount(currContainer);
    currContainer.addEventListener('currency-change', (e) => {
      baseCurrency = e.detail.code;
      if (intermediateCurrency === baseCurrency) intermediateCurrency = '';
    });

    const intContainer = modal.querySelector('#gf-intermediate-currency');
    const intSelector = makeCurrencySelector('intermediate', intermediateCurrency || baseCurrency);
    intSelector.mount(intContainer);
    intContainer.addEventListener('currency-change', (e) => {
      const code = e.detail.code;
      intermediateCurrency = code === baseCurrency ? '' : code;
    });

    document.addEventListener('click', () => {
      currSelector.close();
      intSelector.close();
    }, { once: true });

    attachBodyEvents();
  }

  function renderEmojiPanel() {
    const emojis = GROUP_EMOJIS.slice(emojiPage * EMOJIS_PER_PAGE, (emojiPage + 1) * EMOJIS_PER_PAGE);
    return `
      <div style="border:1.5px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden">
        <div class="emoji-grid">
          ${emojis.map(e => `<div class="emoji-option ${groupPicture === e && pictureType === 'emoji' ? 'selected' : ''}" data-emoji="${e}">${e}</div>`).join('')}
        </div>
      </div>
    `;
  }

  function renderUploadPanel() {
    return `
      <div style="border:1.5px dashed var(--color-border);border-radius:var(--radius-md);padding:var(--sp-5);text-align:center">
        <input type="file" id="gf-file-input" accept="image/*" style="display:none" />
        <label for="gf-file-input" style="cursor:pointer">
          <div style="width:52px;height:52px;background:var(--blue-50);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;margin:0 auto var(--sp-3);color:var(--blue-400)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <p style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);color:var(--color-primary)">Click to upload image</p>
          <p style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:4px">JPG, PNG, WebP · Max 5MB</p>
        </label>
      </div>
    `;
  }

  function renderMembersList() {
    if (members.length === 0) return '<p style="color:var(--color-text-muted);font-size:var(--fs-sm)">No members yet.</p>';
    return members.map(m => {
      const initials = getInitials(m.name);
      const [bg, fg] = getAvatarColors(m.name);
      const style = `background:linear-gradient(135deg,${bg},${fg})`;
      return `
        <div class="chip" style="margin-bottom:var(--sp-2);display:flex;align-items:center;gap:var(--sp-2)">
          <div class="chip-avatar" style="${style}">${initials}</div>
          <span style="flex:1;font-size:var(--fs-sm)">${escapeHtml(m.name)}</span>
          ${m.isCreator ? '<span class="badge badge-orange" style="font-size:10px">Creator</span>' : ''}
          ${m.isDummy ? '<span class="badge badge-gray" style="font-size:10px">Guest</span>' : ''}
          ${!m.isCreator ? `<button class="chip-remove" data-remove="${m.memberId}" title="Remove">×</button>` : ''}
        </div>
      `;
    }).join('');
  }

  function attachBodyEvents() {
    // Name input
    const nameInput = modal.querySelector('#gf-name');
    const nameCounter = modal.querySelector('#gf-name-counter');
    const nameError = modal.querySelector('#gf-name-error');

    nameInput?.addEventListener('input', () => {
      groupName = nameInput.value;
      nameCounter.textContent = `${groupName.length}/100`;
      if (groupName.length > 90) nameCounter.classList.add('warn');
      else nameCounter.classList.remove('warn');
      nameError.classList.add('hidden');
      nameInput.classList.remove('error');
    });

    // Picture tabs
    modal.querySelectorAll('.picture-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pictureTab = btn.dataset.tab;
        modal.querySelectorAll('.picture-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        modal.querySelector('#gf-picture-panel').innerHTML =
          pictureTab === 'emoji' ? renderEmojiPanel() : renderUploadPanel();
        attachPictureEvents();
      });
    });

    attachPictureEvents();

    // Add member
    const newMemberInput = modal.querySelector('#gf-new-member');
    modal.querySelector('#gf-add-member')?.addEventListener('click', () => {
      const name = newMemberInput?.value.trim();
      if (!name) { newMemberInput?.focus(); return; }
      if (members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
        showToast('A member with this name already exists.', 'warning');
        return;
      }
      members.push(Groups.createDummyMemberObj(name));
      newMemberInput.value = '';
      modal.querySelector('#gf-members-list').innerHTML = renderMembersList();
      attachRemoveEvents();
      newMemberInput.focus();
    });

    newMemberInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector('#gf-add-member')?.click();
    });

    // Copy group ID
    modal.querySelector('#gf-copy-id')?.addEventListener('click', async (e) => {
      const { copyToClipboard } = await import('../js/utils.js');
      await copyToClipboard(existingGroup.groupId);
      e.target.textContent = 'Copied!';
      e.target.classList.add('copied');
      setTimeout(() => {
        e.target.textContent = 'Copy';
        e.target.classList.remove('copied');
      }, 2000);
    });

    attachRemoveEvents();
  }

  function attachPictureEvents() {
    // Emoji selection
    modal.querySelectorAll('.emoji-option').forEach(opt => {
      opt.addEventListener('click', () => {
        groupPicture = opt.dataset.emoji;
        pictureType = 'emoji';
        modal.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        // Update preview
        const preview = modal.querySelector('#gf-pic-preview');
        if (preview) preview.innerHTML = `<span style="font-size:40px">${groupPicture}</span>`;
      });
    });

    // File upload
    modal.querySelector('#gf-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image too large. Max 5MB.', 'error');
        return;
      }
      try {
        const b64 = await readFileAsBase64(file);
        const compressed = await compressImage(b64, 150);
        groupPicture = compressed;
        pictureType = 'upload';
        const preview = modal.querySelector('#gf-pic-preview');
        if (preview) preview.innerHTML = `<img src="${compressed}" alt="group" style="width:100%;height:100%;object-fit:cover" />`;
        showToast('Picture uploaded!', 'success', 2000);
      } catch {
        showToast('Failed to process image.', 'error');
      }
    });
  }

  function attachRemoveEvents() {
    modal.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const memberId = btn.dataset.remove;
        members = members.filter(m => m.memberId !== memberId);
        modal.querySelector('#gf-members-list').innerHTML = renderMembersList();
        attachRemoveEvents();
      });
    });
  }

  // Footer events
  modal.querySelector('#gf-cancel')?.addEventListener('click', closeModal);

  modal.querySelector('#gf-save')?.addEventListener('click', async () => {
    if (saving) return;
    const nameInput = modal.querySelector('#gf-name');
    const nameError = modal.querySelector('#gf-name-error');
    const errorMsg  = modal.querySelector('#gf-name-error-msg');

    groupName = (nameInput?.value || '').trim();

    if (!groupName) {
      nameError.classList.remove('hidden');
      errorMsg.textContent = 'Group name is required.';
      nameInput?.classList.add('error');
      nameInput?.focus();
      return;
    }

    saving = true;
    const saveBtn = modal.querySelector('#gf-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isEdit ? 'Saving…' : 'Creating…';

    try {
      let saved;
      if (isEdit) {
        saved = Groups.update(existingGroup.groupId, {
          name: groupName,
          picture: groupPicture,
          pictureType,
          baseCurrency,
          intermediateCurrency: intermediateCurrency || null,
          members,
        });
        showToast('Group updated!', 'success');
      } else {
        saved = Groups.create({
          name: groupName,
          picture: groupPicture,
          pictureType,
          baseCurrency,
          intermediateCurrency: intermediateCurrency || null,
          members,
        });
        showToast(`Group "${groupName}" created! 🎉`, 'success');
      }
      closeModal();
      if (typeof onSaved === 'function') onSaved(saved);
    } catch (err) {
      showToast(err.message, 'error');
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Group';

      if (err.message.includes('already have a group')) {
        const nameError = modal.querySelector('#gf-name-error');
        const errorMsg  = modal.querySelector('#gf-name-error-msg');
        const nameInput = modal.querySelector('#gf-name');
        nameError?.classList.remove('hidden');
        if (errorMsg) errorMsg.textContent = err.message;
        nameInput?.classList.add('error');
      }
    }
  });

  // Initial render
  renderBody();

  return modal;
}
