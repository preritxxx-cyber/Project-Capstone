/**
 * DutchIT – Add Conversion Rate Modal
 */
import { GroupStore } from '../js/store.js';
import { getCurrency, searchCurrencies, POPULAR_CURRENCIES } from '../js/currencies.js';
import { getInitials, getAvatarColors, escapeHtml, parseNum, round, randomAlphanumeric } from '../js/utils.js';
import { openModal, closeModal, showToast } from './modals.js';
import { User } from '../js/user.js';

function currencySelectorHtml(id, currentCode) {
  const c = getCurrency(currentCode);
  return `
    <div class="currency-dropdown-btn" style="padding:10px 14px;display:flex;align-items:center;background:var(--color-surface);border:1.5px solid var(--color-border);border-radius:var(--radius-md);cursor:pointer;user-select:none" id="cform-btn-${id}">
      <span class="currency-code" id="cform-code-${id}" style="font-weight:700;color:var(--color-primary);font-size:var(--fs-md)">${c.code}</span>
      <span class="currency-name" id="cform-name-${id}" style="color:var(--color-text-secondary);font-size:12px;margin-left:8px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden">${c.name}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto;color:var(--color-text-muted)"><path d="m6 9 6 6 6-6"/></svg>
    </div>
    <div class="currency-dropdown-panel hidden" id="cform-panel-${id}" style="position:absolute;top:100%;left:0;right:0;background:var(--color-surface);border:1.5px solid var(--color-border);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);z-index:var(--z-dropdown);margin-top:4px;max-height:240px;overflow:hidden;display:flex;flex-direction:column">
      <div class="currency-search" style="padding:var(--sp-2);border-bottom:1px solid var(--color-border)"><input type="text" id="cform-search-${id}" placeholder="Search currencies…" autocomplete="off" style="width:100%;padding:6px 10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);outline:none;font-size:var(--fs-sm)" /></div>
      <div class="currency-list" id="cform-list-${id}" style="overflow-y:auto;flex:1;max-height:180px">
        <!-- Populated dynamically -->
      </div>
    </div>
  `;
}

function attachCurrencySelector(modal, id, initialCode, onChange) {
  let selectedCode = initialCode;
  const btn = modal.querySelector(`#cform-btn-${id}`);
  const panel = modal.querySelector(`#cform-panel-${id}`);
  const searchInp = modal.querySelector(`#cform-search-${id}`);
  const list = modal.querySelector(`#cform-list-${id}`);

  const renderList = (q = '') => {
    const results = q
      ? searchCurrencies(q)
      : [
          ...POPULAR_CURRENCIES.map(code => getCurrency(code)),
          ...searchCurrencies('').filter(c => !POPULAR_CURRENCIES.includes(c.code)),
        ];

    list.innerHTML = results.map(item => `
      <div class="currency-option ${item.code === selectedCode ? 'selected' : ''}" data-code="${item.code}" style="display:flex;align-items:center;gap:var(--sp-2);padding:10px var(--sp-4);cursor:pointer;transition:background var(--t-fast);border-bottom:1px solid rgba(0,0,0,0.02)">
        <span class="c-code" style="font-weight:700;color:var(--color-primary);font-size:var(--fs-sm);width:40px">${item.code}</span>
        <span class="c-name" style="color:var(--color-text-secondary);font-size:var(--fs-sm);flex:1;text-overflow:ellipsis;white-space:nowrap;overflow:hidden">${item.name}</span>
        <span class="c-symbol" style="color:var(--color-text-muted);font-weight:600;font-size:var(--fs-sm)">${item.symbol}</span>
      </div>`).join('');

    list.querySelectorAll('.currency-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedCode = opt.dataset.code;
        modal.querySelector(`#cform-code-${id}`).textContent = selectedCode;
        modal.querySelector(`#cform-name-${id}`).textContent = getCurrency(selectedCode).name;
        panel.classList.add('hidden');
        onChange(selectedCode);
      });
    });
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const otherId = id === 'from' ? 'to' : 'from';
    modal.querySelector(`#cform-panel-${otherId}`)?.classList.add('hidden');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      searchInp.value = '';
      renderList('');
      setTimeout(() => searchInp.focus(), 50);
    }
  });

  searchInp.addEventListener('input', (e) => {
    renderList(e.target.value);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest(`#cform-btn-${id}`) && !e.target.closest(`#cform-panel-${id}`)) {
      panel.classList.add('hidden');
    }
  }, { once: false });
}

export function openConversionForm(groupId, onSaved) {
  const group = GroupStore.getById(groupId);
  const baseCurrency = group?.baseCurrency || 'USD';
  const intermediateCurrency = group?.intermediateCurrency || null;

  let fromCurr = baseCurrency;
  let toCurr = intermediateCurrency
    || (fromCurr === 'USD' ? 'EUR' : 'USD');

  const modal = openModal({
    title: 'Add Currency Conversion',
    content: `
      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <p style="color:var(--color-text-secondary);font-size:var(--fs-sm);margin:0">
          Record an exchange trade (local ↔ intermediate ↔ foreign). Enter the actual amounts sold and bought —
          the <strong>volume-weighted average</strong> is computed as total bought ÷ total sold (not an average of per-trade rates).
        </p>
        ${intermediateCurrency ? `
          <p style="color:var(--color-primary);font-size:var(--fs-xs);margin:0;padding:var(--sp-2) var(--sp-3);background:var(--blue-50);border-radius:var(--radius-sm);border:1px solid var(--blue-200)">
            Intermediate currency for this trip: <strong>${intermediateCurrency}</strong> · Base: <strong>${baseCurrency}</strong>
          </p>
        ` : `
          <p style="color:var(--color-text-muted);font-size:var(--fs-xs);margin:0">
            Tip: set an intermediate currency in group settings (e.g. USD) when you convert local cash through it.
          </p>
        `}

        <!-- From Currency & Amount -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">
          <div class="form-field" style="position:relative">
            <label class="form-label" style="font-weight:600;margin-bottom:6px">Source Currency (Sold)</label>
            <div class="currency-dropdown" id="cform-dropdown-from">
              ${currencySelectorHtml('from', fromCurr)}
            </div>
          </div>
          <div class="form-field">
            <label class="form-label" for="cform-amt-from" style="font-weight:600;margin-bottom:6px">Amount Sold</label>
            <input type="number" id="cform-amt-from" class="form-input" placeholder="e.g. 100" min="0.0001" step="any" required style="width:100%;padding:10px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-md);outline:none;font-weight:600" />
          </div>
        </div>

        <!-- To Currency & Amount -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">
          <div class="form-field" style="position:relative">
            <label class="form-label" style="font-weight:600;margin-bottom:6px">Target Currency (Bought)</label>
            <div class="currency-dropdown" id="cform-dropdown-to">
              ${currencySelectorHtml('to', toCurr)}
            </div>
          </div>
          <div class="form-field">
            <label class="form-label" for="cform-amt-to" style="font-weight:600;margin-bottom:6px">Amount Bought</label>
            <input type="number" id="cform-amt-to" class="form-input" placeholder="e.g. 18000" min="0.0001" step="any" required style="width:100%;padding:10px 14px;border:1.5px solid var(--color-border);border-radius:var(--radius-md);outline:none;font-weight:600" />
          </div>
        </div>

        <!-- Visual Rate Helper -->
        <div id="cform-rate-preview" style="background:var(--blue-50);border:1.5px solid var(--blue-200);border-radius:var(--radius-md);padding:var(--sp-3);text-align:center;font-weight:600;color:var(--color-primary);font-size:var(--fs-base)">
          Please enter amounts to calculate conversion rate.
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" id="cform-cancel">Cancel</button>
      <button class="btn btn-orange" id="cform-submit">Add Rate</button>
    `,
    size: 'modal-md',
  });

  // Attach currency selectors
  attachCurrencySelector(modal, 'from', fromCurr, (code) => {
    fromCurr = code;
    updatePreview();
  });

  attachCurrencySelector(modal, 'to', toCurr, (code) => {
    toCurr = code;
    updatePreview();
  });

  const fromAmtInp = modal.querySelector('#cform-amt-from');
  const toAmtInp = modal.querySelector('#cform-amt-to');
  const preview = modal.querySelector('#cform-rate-preview');

  function updatePreview() {
    const fromAmt = parseNum(fromAmtInp.value);
    const toAmt = parseNum(toAmtInp.value);

    if (fromAmt > 0 && toAmt > 0) {
      if (fromCurr === toCurr) {
        preview.textContent = 'Currencies are identical (Rate = 1.0)';
        return;
      }
      const rate = round(toAmt / fromAmt, 6);
      const invRate = round(fromAmt / toAmt, 6);
      preview.innerHTML = `
        <div style="font-size:var(--fs-md);margin-bottom:4px">
          This trade: <strong>1 ${fromCurr} = ${rate} ${toCurr}</strong>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--color-text-secondary);font-weight:normal">
          Reciprocal: 1 ${toCurr} = ${invRate} ${fromCurr} · Group average uses Σ amounts, not average of rates
        </div>
      `;
    } else {
      preview.textContent = 'Please enter amounts to calculate conversion rate.';
    }
  }

  fromAmtInp.addEventListener('input', updatePreview);
  toAmtInp.addEventListener('input', updatePreview);

  modal.querySelector('#cform-cancel').addEventListener('click', closeModal);
  modal.querySelector('#cform-submit').addEventListener('click', () => {
    const fromAmt = parseNum(fromAmtInp.value);
    const toAmt = parseNum(toAmtInp.value);

    if (fromAmt <= 0 || toAmt <= 0) {
      showToast('Please enter valid positive amounts.', 'error');
      return;
    }

    if (fromCurr === toCurr) {
      showToast('Please select different currencies.', 'error');
      return;
    }

    const rateEntry = {
      rateId: `rate_${randomAlphanumeric(10)}`,
      from: fromCurr,
      fromAmount: fromAmt,
      to: toCurr,
      toAmount: toAmt,
      addedBy: User.get()?.userId || 'unknown',
      createdAt: new Date().toISOString(),
    };

    GroupStore.addConversionRate(groupId, rateEntry);
    showToast('Currency conversion recorded successfully!', 'success');
    closeModal();
    if (typeof onSaved === 'function') onSaved();
  });
}
