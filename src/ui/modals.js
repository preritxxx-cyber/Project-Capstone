/**
 * DutchIT – Modal Manager & Toast Notifications
 */

/* ─── Toast Notifications ─── */

export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>`,
    error:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('exit');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/* ─── Modal Stack ─── */

let _modalStack = [];

function getOverlay() {
  return document.getElementById('modal-overlay');
}

/**
 * Open a modal
 * @param {object} options - { title, content, footer, size, onClose, id }
 * @returns {HTMLElement} modal element
 */
export function openModal({ title, content, footer, size = '', onClose, id, noPadding = false }) {
  const overlay = getOverlay();
  overlay.classList.remove('hidden');

  const modal = document.createElement('div');
  modal.className = `modal ${size}`;
  if (id) modal.id = id;

  modal.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">${title}</h2>
      <button class="modal-close" id="modal-close-btn" aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="modal-body ${noPadding ? 'no-padding' : ''}">
      ${typeof content === 'string' ? content : ''}
    </div>
    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
  `;

  // If content is a DOM element, append it
  if (content instanceof HTMLElement) {
    modal.querySelector('.modal-body').appendChild(content);
  }

  overlay.appendChild(modal);
  _modalStack.push({ modal, onClose });

  // Close button
  modal.querySelector('#modal-close-btn').addEventListener('click', () => closeModal());

  // Close on overlay click (outside modal)
  overlay.addEventListener('click', handleOverlayClick);

  // Lucide icons
  if (window.lucide) window.lucide.createIcons();

  return modal;
}

function handleOverlayClick(e) {
  if (e.target === getOverlay()) {
    closeModal();
  }
}

/**
 * Close the top modal
 */
export function closeModal() {
  const overlay = getOverlay();
  const top = _modalStack.pop();
  if (!top) return;

  top.modal.style.animation = 'scaleIn 200ms ease reverse';
  setTimeout(() => {
    top.modal.remove();
    if (_modalStack.length === 0) {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', handleOverlayClick);
    }
    if (typeof top.onClose === 'function') top.onClose();
  }, 180);
}

/**
 * Close all modals
 */
export function closeAllModals() {
  while (_modalStack.length > 0) {
    const top = _modalStack.pop();
    top.modal.remove();
  }
  const overlay = getOverlay();
  overlay.classList.add('hidden');
  overlay.removeEventListener('click', handleOverlayClick);
}

/**
 * Update modal content
 */
export function updateModalContent(modalEl, htmlContent) {
  const body = modalEl.querySelector('.modal-body');
  if (body) {
    body.innerHTML = htmlContent;
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Confirm dialog
 */
export function openConfirm({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) {
  const footer = `
    <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${confirmText}</button>
  `;

  const modal = openModal({
    title,
    content: `
      <div class="confirm-card">
        <div class="confirm-icon ${danger ? 'danger' : ''}">
          ${danger
            ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`
            : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
          }
        </div>
        <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-bold);margin-bottom:var(--sp-2)">${title}</h3>
        <p style="color:var(--color-text-secondary);font-size:var(--fs-base)">${message}</p>
      </div>
    `,
    footer,
    size: 'modal-sm',
  });

  modal.querySelector('#confirm-cancel').addEventListener('click', closeModal);
  modal.querySelector('#confirm-ok').addEventListener('click', () => {
    closeModal();
    if (typeof onConfirm === 'function') onConfirm();
  });

  return modal;
}
