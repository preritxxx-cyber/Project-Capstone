/**
 * DutchIT – FX Calculator Modal
 */
import { FxStore, resolveFxRate, foreignToLocal, localToForeign, RATE_MODE_FOREIGN_PER_LOCAL, RATE_MODE_LOCAL_PER_FOREIGN } from '../js/fxCalculator.js';
import { GroupStore } from '../js/store.js';
import { getCurrency, POPULAR_CURRENCIES, searchCurrencies, formatAmount } from '../js/currencies.js';
import { parseNum, round, escapeHtml } from '../js/utils.js';
import { openModal, closeModal, showToast } from './modals.js';

function currencyOptionsHtml(selected) {
  const popular = POPULAR_CURRENCIES.map(code => getCurrency(code));
  const rest = searchCurrencies('').filter(c => !POPULAR_CURRENCIES.includes(c.code));
  const opts = (list) => list.map(c =>
    `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.code} — ${c.name}</option>`
  ).join('');
  return `
    <optgroup label="Popular">${opts(popular)}</optgroup>
    <optgroup label="All currencies">${opts(rest)}</optgroup>
  `;
}

export function openFxCalculator({ groupId = null, groupName = null } = {}) {
  let settings = FxStore.get();
  const activeGroupId = groupId || settings.linkedGroupId || null;
  const group = activeGroupId ? GroupStore.getById(activeGroupId) : null;
  const tripName = groupName || group?.name || null;
  const baseCurrency = group?.baseCurrency;

  if (group && baseCurrency) {
    const sameTrip = settings.linkedGroupId === activeGroupId;
    settings = FxStore.update({
      localCurrency: sameTrip ? settings.localCurrency : baseCurrency,
      linkedGroupId: activeGroupId,
    });
  }

  let resolved = resolveFxRate(settings, activeGroupId);
  let convertDirection = settings.convertDirection || 'foreign_to_local';

  const modal = openModal({
    title: 'FX Calculator',
    content: buildContent(),
    footer: `
      <button class="btn btn-ghost" id="fx-close">Close</button>
      <button class="btn btn-secondary btn-sm" id="fx-save-preset">Save rate to device</button>
    `,
    size: 'modal-md',
    id: 'fx-calculator-modal',
  });

  function persist(partial) {
    settings = FxStore.update(partial);
    if (partial.rateSource === 'average' && activeGroupId) {
      settings = FxStore.update({ linkedGroupId: activeGroupId });
    }
    resolved = resolveFxRate(settings, activeGroupId);
    refreshRateDisplay();
    updateConversion();
  }

  function buildContent() {
    const canUseAverage = !!activeGroupId && !!group;
    const rateSource = settings.rateSource || 'preset';

    return `
      <div class="fx-calc" style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <p style="margin:0;font-size:var(--fs-sm);color:var(--color-text-secondary)">
          Quick convert with a <strong>preset rate</strong> (saved on this device) or your trip's <strong>volume-weighted average</strong>.
        </p>

        ${tripName ? `
          <div style="padding:var(--sp-2) var(--sp-3);background:var(--blue-50);border:1px solid var(--blue-200);border-radius:var(--radius-md);font-size:var(--fs-xs);color:var(--color-primary)">
            Active trip: <strong>${escapeHtml(tripName)}</strong>${baseCurrency ? ` · Base ${baseCurrency}` : ''}
          </div>
        ` : ''}

        <!-- Currencies -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:var(--sp-2);align-items:end">
          <div class="form-field">
            <label class="form-label" for="fx-local-curr">Local currency</label>
            <select id="fx-local-curr" class="form-input" style="padding:10px 12px">${currencyOptionsHtml(settings.localCurrency)}</select>
          </div>
          <button type="button" class="btn btn-ghost btn-icon" id="fx-swap-curr" title="Swap currencies" style="margin-bottom:2px">⇄</button>
          <div class="form-field">
            <label class="form-label" for="fx-foreign-curr">Foreign currency</label>
            <select id="fx-foreign-curr" class="form-input" style="padding:10px 12px">${currencyOptionsHtml(settings.foreignCurrency)}</select>
          </div>
        </div>

        <!-- Rate source -->
        <div class="form-field">
          <label class="form-label">Rate source</label>
          <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
            <label class="fx-radio-pill ${rateSource === 'preset' ? 'active' : ''}">
              <input type="radio" name="fx-source" value="preset" ${rateSource === 'preset' ? 'checked' : ''} />
              Preset rate
            </label>
            <label class="fx-radio-pill ${rateSource === 'average' ? 'active' : ''} ${!canUseAverage ? 'disabled' : ''}">
              <input type="radio" name="fx-source" value="average" ${rateSource === 'average' ? 'checked' : ''} ${!canUseAverage ? 'disabled' : ''} />
              Trip average
            </label>
          </div>
          ${!canUseAverage ? `<span class="form-hint">Open a trip to use conversion-module averages.</span>` : ''}
        </div>

        <!-- Preset rate settings -->
        <div id="fx-preset-panel" style="${rateSource !== 'preset' ? 'display:none' : ''}">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
            <div class="form-field">
              <label class="form-label" for="fx-preset-rate">Your preset rate</label>
              <input type="number" id="fx-preset-rate" class="form-input" min="0.000001" step="any"
                value="${settings.presetRate}" placeholder="e.g. 180" style="font-weight:700;font-size:var(--fs-lg)" />
            </div>
            <div class="form-field">
              <label class="form-label" for="fx-rate-mode">Rate means</label>
              <select id="fx-rate-mode" class="form-input" style="padding:10px 12px">
                <option value="${RATE_MODE_FOREIGN_PER_LOCAL}" ${settings.rateMode === RATE_MODE_FOREIGN_PER_LOCAL ? 'selected' : ''}>
                  1 local = X foreign
                </option>
                <option value="${RATE_MODE_LOCAL_PER_FOREIGN}" ${settings.rateMode === RATE_MODE_LOCAL_PER_FOREIGN ? 'selected' : ''}>
                  1 foreign = X local
                </option>
              </select>
            </div>
          </div>
        </div>

        <div id="fx-rate-display" style="background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--sp-3);font-size:var(--fs-sm);text-align:center"></div>

        <!-- Converter -->
        <div style="display:flex;justify-content:center;margin:var(--sp-1) 0">
          <button type="button" class="btn btn-ghost btn-sm" id="fx-swap-direction">⇅ Swap direction</button>
        </div>

        <div id="fx-input-block">
          <!-- filled by renderInputBlock -->
        </div>

        <div id="fx-result-block" style="background:linear-gradient(135deg,var(--blue-900),var(--blue-700));color:white;border-radius:var(--radius-xl);padding:var(--sp-5);text-align:center">
          <div style="font-size:11px;opacity:0.75;text-transform:uppercase;letter-spacing:0.5px">Converted amount</div>
          <div id="fx-result-value" style="font-size:var(--fs-2xl);font-weight:800;margin-top:var(--sp-2)">—</div>
          <div id="fx-result-formula" style="font-size:var(--fs-xs);opacity:0.7;margin-top:var(--sp-2)"></div>
        </div>
      </div>
    `;
  }

  function refreshRateDisplay() {
    const el = modal.querySelector('#fx-rate-display');
    if (!el) return;
    if (resolved.source === 'average') {
      el.innerHTML = `
        <span class="badge badge-green" style="font-size:10px;margin-bottom:6px">Trip average</span>
        <div style="font-weight:700;color:var(--color-primary)">
          1 ${settings.foreignCurrency} = ${round(resolved.rate, 6)} ${settings.localCurrency}
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">${resolved.label}</div>
      `;
    } else {
      el.innerHTML = `
        <span class="badge badge-blue" style="font-size:10px;margin-bottom:6px">Preset</span>
        <div style="font-weight:700;color:var(--color-primary)">${resolved.label}</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">
          Foreign → local: ${settings.rateMode === RATE_MODE_FOREIGN_PER_LOCAL ? 'divide by rate' : 'multiply by rate'}
        </div>
      `;
    }
  }

  function renderInputBlock() {
    const block = modal.querySelector('#fx-input-block');
    if (!block) return;
    const isForeignInput = convertDirection === 'foreign_to_local';
    const curr = isForeignInput ? settings.foreignCurrency : settings.localCurrency;
    const val = isForeignInput ? settings.lastForeignInput : settings.lastLocalInput;
    const label = isForeignInput ? 'Enter foreign amount' : 'Enter local amount';

    block.innerHTML = `
      <div class="form-field">
        <label class="form-label" for="fx-amount-in">${label} (${curr})</label>
        <input type="number" id="fx-amount-in" class="form-input" inputmode="decimal"
          placeholder="0" min="0" step="any" value="${val}"
          style="font-size:var(--fs-xl);font-weight:700;padding:var(--sp-4);text-align:center" />
      </div>
    `;

    block.querySelector('#fx-amount-in')?.addEventListener('input', (e) => {
      const v = e.target.value;
      if (isForeignInput) {
        settings = FxStore.update({ lastForeignInput: v });
      } else {
        settings = FxStore.update({ lastLocalInput: v });
      }
      updateConversion();
    });

    setTimeout(() => block.querySelector('#fx-amount-in')?.focus(), 80);
  }

  function updateConversion() {
    const inp = modal.querySelector('#fx-amount-in');
    const resultEl = modal.querySelector('#fx-result-value');
    const formulaEl = modal.querySelector('#fx-result-formula');
    if (!inp || !resultEl) return;

    const raw = inp.value;
    const amount = parseNum(raw);

    if (amount <= 0) {
      resultEl.textContent = '—';
      if (formulaEl) formulaEl.textContent = 'Enter an amount above';
      return;
    }

    let result;
    let formula;

    if (convertDirection === 'foreign_to_local') {
      result = foreignToLocal(amount, resolved);
      if (resolved.source === 'average' || resolved.rateMode === RATE_MODE_LOCAL_PER_FOREIGN) {
        formula = `${formatAmount(amount, settings.foreignCurrency)} × ${round(resolved.rate, 4)} = ${formatAmount(result, settings.localCurrency)}`;
      } else {
        formula = `${formatAmount(amount, settings.foreignCurrency)} ÷ ${round(resolved.rate, 4)} = ${formatAmount(result, settings.localCurrency)}`;
      }
      resultEl.textContent = formatAmount(result, settings.localCurrency);
    } else {
      result = localToForeign(amount, resolved);
      if (resolved.source === 'average' || resolved.rateMode === RATE_MODE_LOCAL_PER_FOREIGN) {
        formula = `${formatAmount(amount, settings.localCurrency)} ÷ ${round(resolved.rate, 4)} = ${formatAmount(result, settings.foreignCurrency)}`;
      } else {
        formula = `${formatAmount(amount, settings.localCurrency)} × ${round(resolved.rate, 4)} = ${formatAmount(result, settings.foreignCurrency)}`;
      }
      resultEl.textContent = formatAmount(result, settings.foreignCurrency);
    }

    if (formulaEl) formulaEl.textContent = formula;
  }

  function bindEvents() {
    modal.querySelector('#fx-local-curr')?.addEventListener('change', (e) => {
      persist({ localCurrency: e.target.value });
      renderInputBlock();
    });

    modal.querySelector('#fx-foreign-curr')?.addEventListener('change', (e) => {
      persist({ foreignCurrency: e.target.value });
      renderInputBlock();
    });

    modal.querySelector('#fx-swap-curr')?.addEventListener('click', () => {
      persist({
        localCurrency: settings.foreignCurrency,
        foreignCurrency: settings.localCurrency,
      });
      modal.querySelector('#fx-local-curr').value = settings.localCurrency;
      modal.querySelector('#fx-foreign-curr').value = settings.foreignCurrency;
      renderInputBlock();
      updateConversion();
    });

    modal.querySelectorAll('input[name="fx-source"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const src = radio.value;
        persist({ rateSource: src });
        modal.querySelector('#fx-preset-panel').style.display = src === 'preset' ? '' : 'none';
        modal.querySelectorAll('.fx-radio-pill').forEach(p => p.classList.remove('active'));
        radio.closest('.fx-radio-pill')?.classList.add('active');
      });
    });

    modal.querySelector('#fx-preset-rate')?.addEventListener('input', (e) => {
      persist({ presetRate: parseNum(e.target.value) });
    });

    modal.querySelector('#fx-rate-mode')?.addEventListener('change', (e) => {
      persist({ rateMode: e.target.value });
    });

    modal.querySelector('#fx-swap-direction')?.addEventListener('click', () => {
      convertDirection = convertDirection === 'foreign_to_local' ? 'local_to_foreign' : 'foreign_to_local';
      persist({ convertDirection });
      renderInputBlock();
      updateConversion();
    });

    modal.querySelector('#fx-close')?.addEventListener('click', closeModal);

    modal.querySelector('#fx-save-preset')?.addEventListener('click', () => {
      if (settings.rateSource === 'average') {
        const r = resolved.rate;
        persist({
          rateSource: 'preset',
          presetRate: round(r, 4),
          rateMode: RATE_MODE_LOCAL_PER_FOREIGN,
        });
        modal.querySelector('input[name="fx-source"][value="preset"]').checked = true;
        modal.querySelector('#fx-preset-panel').style.display = '';
        modal.querySelector('#fx-preset-rate').value = round(r, 4);
        modal.querySelector('#fx-rate-mode').value = RATE_MODE_LOCAL_PER_FOREIGN;
      }
      showToast('FX settings saved on this device.', 'success', 2500);
      refreshRateDisplay();
      updateConversion();
    });
  }

  bindEvents();
  refreshRateDisplay();
  renderInputBlock();
  updateConversion();
}
