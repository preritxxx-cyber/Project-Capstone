/**
 * DutchIT – Global FX Calculator access (any screen)
 */
import { openFxCalculator } from './fxCalculator.js';
import { showToast } from './modals.js';

let _context = { groupId: null, groupName: null };
let _delegationBound = false;

function launchFxCalculator() {
  try {
    openFxCalculator({
      groupId: _context.groupId,
      groupName: _context.groupName,
    });
  } catch (err) {
    console.error('FX Calculator error:', err);
    showToast(err?.message || 'Could not open FX Calculator.', 'error');
  }
}

/** Call after route change with optional group metadata */
export function updateFxContext({ groupId = null, groupName = null } = {}) {
  _context = { groupId, groupName };
  refreshFxFabBadge();
}

function refreshFxFabBadge() {
  const fab = document.getElementById('global-fx-fab');
  if (!fab) return;
  fab.title = _context.groupId
    ? `FX Calculator (${_context.groupName || 'this trip'})`
    : 'FX Calculator';
}

export function initGlobalFx() {
  bindFxDelegation();
  if (document.getElementById('global-fx-fab')) return;

  const btn = document.createElement('button');
  btn.id = 'global-fx-fab';
  btn.type = 'button';
  btn.className = 'fab fab-fx';
  btn.setAttribute('aria-label', 'FX Calculator');
  btn.innerHTML = `
    <span class="fab-fx-label">FX</span>
  `;
  btn.title = 'FX Calculator';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    launchFxCalculator();
  });

  document.body.appendChild(btn);
  refreshFxFabBadge();
}

/** Single document listener so header FX works after every re-render */
function bindFxDelegation() {
  if (_delegationBound) return;
  _delegationBound = true;

  document.addEventListener('click', (e) => {
    const headerBtn = e.target.closest('#hdr-fx-btn');
    if (headerBtn) {
      e.preventDefault();
      e.stopPropagation();
      launchFxCalculator();
    }
  });
}

/** Header button HTML snippet */
export function fxHeaderButtonHtml() {
  return `
    <button class="btn btn-secondary btn-sm" id="hdr-fx-btn" type="button" title="FX Calculator">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      FX
    </button>
  `;
}

export function attachFxHeaderButton() {
  bindFxDelegation();
}
