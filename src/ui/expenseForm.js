/**
 * DutchIT – Multi-Step Expense Form
 * Steps: 1=Details, 2=Amount, 3=Payment, 4=Settlement
 */
import { Expenses } from '../js/expenses.js';
import { User } from '../js/user.js';
import {
  getCurrency, searchCurrencies, POPULAR_CURRENCIES, formatAmount, formatAmountWithCode,
} from '../js/currencies.js';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, getInitials, getAvatarColors,
  escapeHtml, parseNum, round, todayStr,
} from '../js/utils.js';
import { openModal, closeModal, showToast } from './modals.js';

/* ─── Helpers ─── */

function avatarHtml(member, size = '') {
  const initials = getInitials(member.name);
  const [bg, fg] = getAvatarColors(member.name);
  return `<div class="member-avatar ${size}" style="background:linear-gradient(135deg,${bg},${fg})">${initials}</div>`;
}

function miniCurrencySelector(id, initialCode, onSelect) {
  let selectedCode = initialCode || 'USD';
  let isOpen = false;
  let searchQ = '';

  const render = (container) => {
    const c = getCurrency(selectedCode);
    const results = searchQ
      ? searchCurrencies(searchQ)
      : [
          ...POPULAR_CURRENCIES.map(code => getCurrency(code)),
          ...searchCurrencies('').filter(c => !POPULAR_CURRENCIES.includes(c.code)),
        ];

    container.innerHTML = `
      <div class="currency-dropdown-btn ${isOpen ? 'open' : ''}" style="padding:8px 10px;font-size:var(--fs-sm)" id="mini-btn-${id}">
        <span class="currency-code" style="font-size:12px">${c.code}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      ${isOpen ? `
        <div class="currency-dropdown-panel" style="min-width:220px">
          <div class="currency-search"><input type="text" id="mini-search-${id}" placeholder="Search…" value="${searchQ}" autocomplete="off" /></div>
          <div class="currency-list">
            ${results.map(item => `
              <div class="currency-option ${item.code === selectedCode ? 'selected' : ''}" data-code="${item.code}">
                <span class="c-code">${item.code}</span>
                <span class="c-name">${item.name}</span>
                <span class="c-symbol">${item.symbol}</span>
              </div>`).join('')}
          </div>
        </div>
      ` : ''}
    `;

    container.querySelector(`#mini-btn-${id}`)?.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      render(container);
      if (isOpen) setTimeout(() => container.querySelector(`#mini-search-${id}`)?.focus(), 40);
    });

    if (isOpen) {
      container.querySelector(`#mini-search-${id}`)?.addEventListener('input', (e) => {
        searchQ = e.target.value;
        render(container);
      });
      container.querySelectorAll('.currency-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedCode = opt.dataset.code;
          isOpen = false;
          searchQ = '';
          render(container);
          onSelect(selectedCode);
        });
      });
    }
  };

  return {
    mount(container) { render(container); },
    getValue() { return selectedCode; },
  };
}

/* ─── Main Export ─── */

export function openExpenseForm(group, existingExpense = null, onSaved) {
  const isEdit = !!existingExpense;
  const members = group?.members || [];
  const currentUser = User.get();
  const baseCurrency = group?.baseCurrency || 'USD';

  /* === State === */
  const state = {
    step: 1,
    // Step 1 – Details
    particulars:   existingExpense?.particulars   || '',
    category:      existingExpense?.category      || 'other',
    invoiceNumber: existingExpense?.invoiceNumber || '',
    invoiceDate:   existingExpense?.invoiceDate   || todayStr(),
    // Step 2 – Amount
    amount:      { value: existingExpense?.amount?.value || '', currency: existingExpense?.amount?.currency || baseCurrency },
    txCharges:   { value: existingExpense?.transactionCharges?.value || '', currency: existingExpense?.transactionCharges?.currency || baseCurrency },
    // Step 3 – Payments
    payments: existingExpense?.payments || [
      {
        _id: 'pay0',
        memberId: currentUser?.userId || (members[0]?.memberId),
        amount: { value: '', currency: baseCurrency },
        method: 'Credit Card',
        proportion: 100,
      }
    ],
    // Step 4 – Settlement
    splitType: existingExpense ? (existingExpense.settlements?.[0]?.splitType || 'equal') : 'equal',
    settledMembers: existingExpense
      ? members.map(m => {
          const s = existingExpense.settlements?.find(s => s.memberId === m.memberId);
          return { memberId: m.memberId, name: m.name, included: !!s, value: s?.percentage || s?.calculatedAmount?.value || '' };
        })
      : members.map(m => ({ memberId: m.memberId, name: m.name, included: true, value: '' })),
  };

  // Currency selector instances
  const currSelectors = {};

  /* === Step Indicator === */
  const STEPS = ['Details', 'Amount', 'Payment', 'Settlement'];

  function renderStepIndicator() {
    return `
      <div class="step-indicator" style="margin-bottom:var(--sp-5)">
        ${STEPS.map((label, i) => {
          const num = i + 1;
          const cls = num < state.step ? 'completed' : num === state.step ? 'active' : '';
          const lineClass = num < state.step ? 'done' : '';
          return `
            <div class="step-node ${cls}">
              <div class="step-circle">${num < state.step ? '✓' : num}</div>
              <span class="step-label">${label}</span>
            </div>
            ${num < STEPS.length ? `<div class="step-line ${lineClass}"></div>` : ''}
          `;
        }).join('')}
      </div>
    `;
  }

  /* === Step 1: Details === */
  function renderStep1() {
    return `
      ${renderStepIndicator()}
      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <div class="form-field">
          <label class="form-label" for="ef-particulars">Particulars <span class="required">*</span></label>
          <input type="text" id="ef-particulars" class="form-input" placeholder="e.g. Dinner at La Piazza" maxlength="200" value="${escapeHtml(state.particulars)}" />
          <span class="form-error hidden" id="ef-particulars-error">Description is required.</span>
        </div>

        <div class="form-field">
          <label class="form-label">Category <span class="required">*</span></label>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--sp-1)" id="ef-categories">
            ${EXPENSE_CATEGORIES.map(cat => `
              <div class="category-tile ${state.category === cat.id ? 'selected' : ''}"
                data-cat="${cat.id}"
                style="
                  padding:var(--sp-2);
                  border-radius:var(--radius-md);
                  border:2px solid ${state.category === cat.id ? cat.color : 'var(--color-border)'};
                  background:${state.category === cat.id ? cat.bg : 'var(--color-surface-2)'};
                  cursor:pointer;
                  text-align:center;
                  transition:all var(--t-fast);
                ">
                <div style="font-size:20px">${cat.emoji}</div>
                <div style="font-size:9px;font-weight:600;color:${state.category === cat.id ? cat.color : 'var(--color-text-muted)'};margin-top:2px;line-height:1.2">${cat.label}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">
          <div class="form-field">
            <label class="form-label" for="ef-invoice-num">Invoice Number</label>
            <input type="text" id="ef-invoice-num" class="form-input" placeholder="e.g. INV-001" value="${escapeHtml(state.invoiceNumber)}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="ef-invoice-date">Invoice Date <span class="required">*</span></label>
            <input type="date" id="ef-invoice-date" class="form-input" value="${state.invoiceDate}" />
          </div>
        </div>
      </div>
    `;
  }

  /* === Step 2: Amount === */
  function renderStep2() {
    return `
      ${renderStepIndicator()}
      <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
        <!-- Expense Amount -->
        <div class="form-field">
          <label class="form-label">Expense Amount <span class="required">*</span></label>
          <div class="amount-row">
            <div class="currency-dropdown" id="ef-amount-curr" style="width:130px;flex-shrink:0"></div>
            <input type="number" id="ef-amount-val" class="form-input" placeholder="0.00" min="0" step="0.01" value="${state.amount.value}" style="flex:1;text-align:right;font-weight:600;font-size:var(--fs-lg)" />
          </div>
          <span class="form-error hidden" id="ef-amount-error">Please enter a valid amount greater than 0.</span>
        </div>

        <!-- Transaction Charges -->
        <div class="form-field">
          <label class="form-label">Transaction Charges (optional)</label>
          <div class="amount-row">
            <div class="currency-dropdown" id="ef-tc-curr" style="width:130px;flex-shrink:0"></div>
            <input type="number" id="ef-tc-val" class="form-input" placeholder="0.00" min="0" step="0.01" value="${state.txCharges.value}" style="flex:1;text-align:right;font-weight:600" />
          </div>
          <span class="form-hint">Bank fees, card surcharges, etc.</span>
        </div>

        <!-- Summary box -->
        <div id="ef-amount-summary" style="background:var(--blue-50);border:1.5px solid var(--blue-200);border-radius:var(--radius-md);padding:var(--sp-4)">
          ${renderAmountSummary()}
        </div>
      </div>
    `;
  }

  function renderAmountSummary() {
    const amt   = parseNum(state.amount.value);
    const tc    = parseNum(state.txCharges.value);
    const total = round(amt + tc, 6);
    const amtCurr = state.amount.currency;
    const tcCurr  = state.txCharges.currency;

    return `
      <div style="display:flex;flex-direction:column;gap:var(--sp-2)">
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);color:var(--color-text-secondary)">
          <span>Expense</span><span>${formatAmount(amt, amtCurr)}</span>
        </div>
        ${tc > 0 ? `<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);color:var(--color-text-secondary)">
          <span>Transaction charges</span><span>+ ${formatAmount(tc, tcCurr)}</span>
        </div>` : ''}
        <div style="height:1px;background:var(--blue-200);margin:var(--sp-1) 0"></div>
        <div style="display:flex;justify-content:space-between;font-size:var(--fs-md);font-weight:700;color:var(--color-primary)">
          <span>Total to split</span>
          <span>${formatAmount(amt, amtCurr)}${tc > 0 && tcCurr !== amtCurr ? ` + ${formatAmount(tc, tcCurr)}` : tc > 0 ? ` + ${formatAmount(tc, amtCurr)}` : ''}</span>
        </div>
      </div>
    `;
  }

  /* === Step 3: Payment === */
  function renderStep3() {
    return `
      ${renderStepIndicator()}
      <div>
        <p style="font-size:var(--fs-sm);color:var(--color-text-secondary);margin-bottom:var(--sp-4)">
          Who paid for this expense? You can split the payment across multiple people.
        </p>

        <div id="ef-payments-list">
          ${state.payments.map((pay, idx) => renderPaymentRow(pay, idx)).join('')}
        </div>

        <button class="add-payer-btn" id="ef-add-payer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Another Payer
        </button>

        <div id="ef-payment-error" class="form-error hidden" style="margin-top:var(--sp-3)">
          Total payment amounts must be filled in.
        </div>
      </div>
    `;
  }

  function renderPaymentRow(pay, idx) {
    return `
      <div class="payment-row" data-pay-idx="${idx}">
        <div class="payment-row-header">
          <span class="payment-row-title">Payer ${idx + 1}</span>
          ${state.payments.length > 1 ? `<button class="btn btn-ghost btn-sm ef-remove-pay" data-idx="${idx}" style="color:var(--color-error)">Remove</button>` : ''}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3)">
          <div class="form-field">
            <label class="form-label">Paid by</label>
            <select class="form-select ef-pay-member" data-idx="${idx}">
              ${members.map(m => `<option value="${m.memberId}" ${m.memberId === pay.memberId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Payment method</label>
            <select class="form-select ef-pay-method" data-idx="${idx}">
              ${PAYMENT_METHODS.map(pm => `<option value="${pm}" ${pm === pay.method ? 'selected' : ''}>${pm}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Amount Paid <span class="required">*</span></label>
          <div class="amount-row">
            <div class="currency-dropdown" id="ef-pay-curr-${idx}" style="width:130px;flex-shrink:0"></div>
            <input type="number" class="form-input ef-pay-amount" data-idx="${idx}" placeholder="0.00" min="0" step="0.01" value="${pay.amount.value}" style="flex:1;text-align:right;font-weight:600" />
          </div>
        </div>
      </div>
    `;
  }

  /* === Step 4: Settlement === */
  function renderStep4() {
    const totalAmount = parseNum(state.amount.value);
    const currency    = state.amount.currency;
    const splits      = Expenses.calculateSplit(
      totalAmount,
      state.splitType,
      state.settledMembers.filter(m => m.included).map(m => ({ memberId: m.memberId, name: m.name, value: m.value })),
      getCurrency(currency).decimals
    );
    const validation = Expenses.validateSplit(
      state.splitType,
      state.settledMembers.filter(m => m.included).map(m => ({ memberId: m.memberId, name: m.name, value: m.value })),
      totalAmount,
      getCurrency(currency).decimals
    );

    const splitMap = {};
    splits.forEach(s => { splitMap[s.memberId] = s; });

    return `
      ${renderStepIndicator()}
      <div>
        <p style="font-size:var(--fs-sm);color:var(--color-text-secondary);margin-bottom:var(--sp-4)">
          How should this expense be split? Total: <strong>${formatAmount(totalAmount, currency)}</strong>
        </p>

        <!-- Split type toggle -->
        <div class="form-field" style="margin-bottom:var(--sp-5)">
          <label class="form-label">Split Mode</label>
          <div class="toggle-group" id="ef-split-toggle">
            ${['equal','percentage','absolute'].map(type => `
              <button class="toggle-option ${state.splitType === type ? 'active' : ''}" data-type="${type}">
                ${type === 'equal' ? '⚖️ Equal' : type === 'percentage' ? '% Percentage' : '# Absolute'}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Member splits -->
        <div id="ef-splits-list">
          ${members.map(member => {
            const isIn = state.settledMembers.find(m => m.memberId === member.memberId)?.included ?? true;
            const val  = state.settledMembers.find(m => m.memberId === member.memberId)?.value ?? '';
            const calc = splitMap[member.memberId];

            return `
              <div class="split-row">
                <div class="split-row-member">
                  <input type="checkbox" class="ef-member-check" data-mid="${member.memberId}" ${isIn ? 'checked' : ''}
                    style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer" />
                  ${avatarHtml(member, 'size-sm')}
                  <span style="font-size:var(--fs-sm);font-weight:500">${escapeHtml(member.name)}</span>
                </div>

                ${state.splitType === 'equal' ? `
                  <span class="split-row-calculated" style="color:var(--color-primary);font-weight:700">
                    ${isIn && calc ? formatAmount(calc.amount, currency) : '—'}
                  </span>
                ` : `
                  <input type="number" class="split-row-input ef-split-input" data-mid="${member.memberId}"
                    placeholder="${state.splitType === 'percentage' ? '0' : '0.00'}"
                    min="0" step="${state.splitType === 'percentage' ? '1' : '0.01'}"
                    value="${isIn ? val : ''}" ${!isIn ? 'disabled' : ''}
                    style="${!isIn ? 'opacity:0.4' : ''}"
                  />
                  <span class="split-row-calculated" style="${calc ? 'color:var(--color-primary)' : ''}">
                    ${isIn && calc ? formatAmount(calc.amount, currency) : '—'}
                  </span>
                `}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Validation bar -->
        <div class="split-total-bar" style="margin-top:var(--sp-3)">
          ${state.splitType === 'equal' ? `
            <span style="color:var(--color-text-secondary);font-size:var(--fs-sm)">Splitting equally among ${state.settledMembers.filter(m => m.included).length} member(s)</span>
            <span class="total-valid">✓ Balanced</span>
          ` : `
            <span style="color:var(--color-text-secondary);font-size:var(--fs-sm)">${state.splitType === 'percentage' ? 'Total %:' : 'Total:'}</span>
            <span class="${validation.valid ? 'total-valid' : 'total-invalid'}">
              ${validation.valid ? '✓ ' : '⚠ '}${validation.message || (validation.valid ? 'Balanced' : '')}
            </span>
          `}
        </div>

        <div id="ef-settlement-error" class="form-error hidden" style="margin-top:var(--sp-3)">
          ${validation.message}
        </div>
      </div>
    `;
  }

  /* === Render body by step === */
  function renderBody() {
    const body = modal.querySelector('.modal-body');
    if (!body) return;

    const content = {
      1: renderStep1,
      2: renderStep2,
      3: renderStep3,
      4: renderStep4,
    }[state.step]?.() || '';

    body.innerHTML = content;
    attachStepEvents();
    updateFooter();
  }

  /* === Attach events per step === */
  function attachStepEvents() {
    const { step } = state;

    if (step === 1) {
      // Particulars
      modal.querySelector('#ef-particulars')?.addEventListener('input', (e) => {
        state.particulars = e.target.value;
      });
      // Category tiles
      modal.querySelectorAll('.category-tile').forEach(tile => {
        tile.addEventListener('click', () => {
          state.category = tile.dataset.cat;
          modal.querySelectorAll('.category-tile').forEach(t => {
            const cat = EXPENSE_CATEGORIES.find(c => c.id === t.dataset.cat);
            const sel = t.dataset.cat === state.category;
            t.style.borderColor  = sel ? cat.color : 'var(--color-border)';
            t.style.background   = sel ? cat.bg : 'var(--color-surface-2)';
            t.querySelector('div:last-child').style.color = sel ? cat.color : 'var(--color-text-muted)';
          });
        });
      });
      // Invoice fields
      modal.querySelector('#ef-invoice-num')?.addEventListener('input', (e) => { state.invoiceNumber = e.target.value; });
      modal.querySelector('#ef-invoice-date')?.addEventListener('change', (e) => { state.invoiceDate = e.target.value; });
    }

    if (step === 2) {
      // Amount currency selector
      const amtCurrEl = modal.querySelector('#ef-amount-curr');
      if (amtCurrEl) {
        const sel = miniCurrencySelector('ef-amt', state.amount.currency, (code) => {
          state.amount.currency = code;
          updateAmountSummary();
        });
        sel.mount(amtCurrEl);
        currSelectors['amt'] = sel;
      }
      // Transaction charge currency
      const tcCurrEl = modal.querySelector('#ef-tc-curr');
      if (tcCurrEl) {
        const sel = miniCurrencySelector('ef-tc', state.txCharges.currency, (code) => {
          state.txCharges.currency = code;
          updateAmountSummary();
        });
        sel.mount(tcCurrEl);
        currSelectors['tc'] = sel;
      }
      // Amount input
      modal.querySelector('#ef-amount-val')?.addEventListener('input', (e) => {
        state.amount.value = e.target.value;
        updateAmountSummary();
      });
      modal.querySelector('#ef-tc-val')?.addEventListener('input', (e) => {
        state.txCharges.value = e.target.value;
        updateAmountSummary();
      });
    }

    if (step === 3) {
      // Mount currency selectors for each payment row
      state.payments.forEach((pay, idx) => {
        const el = modal.querySelector(`#ef-pay-curr-${idx}`);
        if (el) {
          const sel = miniCurrencySelector(`pay${idx}`, pay.amount.currency, (code) => {
            state.payments[idx].amount.currency = code;
          });
          sel.mount(el);
        }
      });

      // Pay member select
      modal.querySelectorAll('.ef-pay-member').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          state.payments[idx].memberId = e.target.value;
        });
      });
      // Pay method select
      modal.querySelectorAll('.ef-pay-method').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          state.payments[idx].method = e.target.value;
        });
      });
      // Pay amount input
      modal.querySelectorAll('.ef-pay-amount').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          state.payments[idx].amount.value = e.target.value;
        });
      });
      // Remove payer
      modal.querySelectorAll('.ef-remove-pay').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          state.payments.splice(idx, 1);
          renderBody();
        });
      });
      // Add payer
      modal.querySelector('#ef-add-payer')?.addEventListener('click', () => {
        state.payments.push({
          _id: `pay${Date.now()}`,
          memberId: members[0]?.memberId || '',
          amount: { value: '', currency: state.amount.currency },
          method: 'Credit Card',
          proportion: 0,
        });
        renderBody();
      });
    }

    if (step === 4) {
      // Split type toggle
      modal.querySelectorAll('[data-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.splitType = btn.dataset.type;
          // Reset values when switching mode
          if (state.splitType === 'equal') {
            state.settledMembers.forEach(m => { m.value = ''; });
          }
          renderBody();
        });
      });

      // Member checkboxes
      modal.querySelectorAll('.ef-member-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const mid = e.target.dataset.mid;
          const sm  = state.settledMembers.find(m => m.memberId === mid);
          if (sm) {
            sm.included = e.target.checked;
            if (!sm.included) sm.value = '';
          }
          rerenderSplits();
        });
      });

      // Split inputs
      modal.querySelectorAll('.ef-split-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const mid = e.target.dataset.mid;
          const sm  = state.settledMembers.find(m => m.memberId === mid);
          if (sm) sm.value = e.target.value;
          rerenderSplits();
        });
      });
    }
  }

  function rerenderSplits() {
    // Re-render just the splits list and total bar
    const body = modal.querySelector('.modal-body');
    if (!body) return;
    const totalAmount = parseNum(state.amount.value);
    const currency    = state.amount.currency;
    const included    = state.settledMembers.filter(m => m.included).map(m => ({ memberId: m.memberId, name: m.name, value: m.value }));
    const splits      = Expenses.calculateSplit(totalAmount, state.splitType, included, getCurrency(currency).decimals);
    const validation  = Expenses.validateSplit(state.splitType, included, totalAmount, getCurrency(currency).decimals);
    const splitMap    = {};
    splits.forEach(s => { splitMap[s.memberId] = s; });

    // Update calculated amounts
    members.forEach(member => {
      const calc = splitMap[member.memberId];
      const row  = body.querySelector(`.split-row-calculated[data-mid="${member.memberId}"]`);
      // Fallback: find by member position
    });

    // Just re-render the whole split list section
    const splitsList = body.querySelector('#ef-splits-list');
    const totalBar   = body.querySelector('.split-total-bar');
    if (splitsList) {
      splitsList.innerHTML = members.map(member => {
        const isIn = state.settledMembers.find(m => m.memberId === member.memberId)?.included ?? true;
        const val  = state.settledMembers.find(m => m.memberId === member.memberId)?.value ?? '';
        const calc = splitMap[member.memberId];
        return `
          <div class="split-row">
            <div class="split-row-member">
              <input type="checkbox" class="ef-member-check" data-mid="${member.memberId}" ${isIn ? 'checked' : ''}
                style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer" />
              ${avatarHtml(member, 'size-sm')}
              <span style="font-size:var(--fs-sm);font-weight:500">${escapeHtml(member.name)}</span>
            </div>
            ${state.splitType === 'equal' ? `
              <span class="split-row-calculated" style="color:var(--color-primary);font-weight:700">
                ${isIn && calc ? formatAmount(calc.amount, currency) : '—'}
              </span>
            ` : `
              <input type="number" class="split-row-input ef-split-input" data-mid="${member.memberId}"
                placeholder="${state.splitType === 'percentage' ? '0' : '0.00'}"
                min="0" step="${state.splitType === 'percentage' ? '1' : '0.01'}"
                value="${isIn ? val : ''}" ${!isIn ? 'disabled' : ''}
                style="${!isIn ? 'opacity:0.4' : ''}"
              />
              <span class="split-row-calculated" style="${calc ? 'color:var(--color-primary)' : ''}">
                ${isIn && calc ? formatAmount(calc.amount, currency) : '—'}
              </span>
            `}
          </div>
        `;
      }).join('');

      // Re-attach split events
      splitsList.querySelectorAll('.ef-member-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const mid = e.target.dataset.mid;
          const sm = state.settledMembers.find(m => m.memberId === mid);
          if (sm) { sm.included = e.target.checked; if (!sm.included) sm.value = ''; }
          rerenderSplits();
        });
      });
      splitsList.querySelectorAll('.ef-split-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const mid = e.target.dataset.mid;
          const sm = state.settledMembers.find(m => m.memberId === mid);
          if (sm) sm.value = e.target.value;
          rerenderSplits();
        });
      });
    }

    if (totalBar) {
      if (state.splitType === 'equal') {
        totalBar.innerHTML = `
          <span style="color:var(--color-text-secondary);font-size:var(--fs-sm)">Splitting equally among ${state.settledMembers.filter(m => m.included).length} member(s)</span>
          <span class="total-valid">✓ Balanced</span>
        `;
      } else {
        totalBar.innerHTML = `
          <span style="color:var(--color-text-secondary);font-size:var(--fs-sm)">${state.splitType === 'percentage' ? 'Total %:' : 'Total:'}</span>
          <span class="${validation.valid ? 'total-valid' : 'total-invalid'}">
            ${validation.valid ? '✓ ' : '⚠ '}${validation.message || 'Balanced'}
          </span>
        `;
      }
    }
  }

  function updateAmountSummary() {
    const summaryEl = modal.querySelector('#ef-amount-summary');
    if (summaryEl) summaryEl.innerHTML = renderAmountSummary();
  }

  /* === Footer navigation === */
  function updateFooter() {
    const footer = modal.querySelector('.modal-footer');
    if (!footer) return;
    footer.innerHTML = `
      ${state.step > 1
        ? `<button class="btn btn-secondary" id="ef-back">← Back</button>`
        : `<button class="btn btn-ghost" id="ef-cancel">Cancel</button>`}
      <span style="flex:1;text-align:center;font-size:var(--fs-xs);color:var(--color-text-muted)">Step ${state.step} of 4</span>
      ${state.step < 4
        ? `<button class="btn btn-primary" id="ef-next">Next →</button>`
        : `<button class="btn btn-orange" id="ef-save">${isEdit ? 'Save Changes' : 'Add Expense'}</button>`}
    `;

    modal.querySelector('#ef-cancel')?.addEventListener('click', closeModal);
    modal.querySelector('#ef-back')?.addEventListener('click', () => { state.step--; renderBody(); });
    modal.querySelector('#ef-next')?.addEventListener('click', handleNext);
    modal.querySelector('#ef-save')?.addEventListener('click', handleSave);
  }

  /* === Validation per step === */
  function handleNext() {
    if (state.step === 1) {
      state.particulars = modal.querySelector('#ef-particulars')?.value.trim() || '';
      if (!state.particulars) {
        modal.querySelector('#ef-particulars-error')?.classList.remove('hidden');
        modal.querySelector('#ef-particulars')?.classList.add('error');
        modal.querySelector('#ef-particulars')?.focus();
        return;
      }
      state.invoiceDate = modal.querySelector('#ef-invoice-date')?.value || todayStr();
      state.invoiceNumber = modal.querySelector('#ef-invoice-num')?.value || '';
    }

    if (state.step === 2) {
      state.amount.value = modal.querySelector('#ef-amount-val')?.value || '';
      state.txCharges.value = modal.querySelector('#ef-tc-val')?.value || '';
      if (parseNum(state.amount.value) <= 0) {
        modal.querySelector('#ef-amount-error')?.classList.remove('hidden');
        modal.querySelector('#ef-amount-val')?.classList.add('error');
        modal.querySelector('#ef-amount-val')?.focus();
        return;
      }
    }

    if (state.step === 3) {
      // Collect payment data
      modal.querySelectorAll('.ef-pay-amount').forEach(inp => {
        const idx = parseInt(inp.dataset.idx);
        state.payments[idx].amount.value = inp.value;
      });
      // Validate
      const allFilled = state.payments.every(p => parseNum(p.amount.value) > 0);
      if (!allFilled) {
        modal.querySelector('#ef-payment-error')?.classList.remove('hidden');
        return;
      }
    }

    state.step++;
    renderBody();
  }

  function handleSave() {
    // Collect final settlement values from DOM
    modal.querySelectorAll('.ef-split-input').forEach(inp => {
      const mid = inp.dataset.mid;
      const sm = state.settledMembers.find(m => m.memberId === mid);
      if (sm) sm.value = inp.value;
    });

    const included = state.settledMembers.filter(m => m.included);
    const validation = Expenses.validateSplit(
      state.splitType,
      included.map(m => ({ memberId: m.memberId, name: m.name, value: m.value })),
      parseNum(state.amount.value),
      getCurrency(state.amount.currency).decimals
    );

    if (!validation.valid) {
      modal.querySelector('#ef-settlement-error')?.classList.remove('hidden');
      showToast(validation.message, 'error');
      return;
    }

    if (included.length === 0) {
      showToast('Please select at least one member for settlement.', 'error');
      return;
    }

    // Build settlements
    const splits = Expenses.calculateSplit(
      parseNum(state.amount.value),
      state.splitType,
      included.map(m => ({ memberId: m.memberId, name: m.name, value: m.value })),
      getCurrency(state.amount.currency).decimals
    );

    const settlements = splits.map(s => {
      const sm = included.find(m => m.memberId === s.memberId);
      return {
        memberId: s.memberId,
        name: s.name,
        splitType: state.splitType,
        percentage: s.percentage,
        calculatedAmount: { value: s.amount, currency: state.amount.currency },
      };
    });

    // Build payments
    const payments = state.payments.map(p => ({
      memberId: p.memberId,
      amount: { value: parseNum(p.amount.value), currency: p.amount.currency },
      method: p.method,
      proportion: p.proportion,
    }));

    const expenseData = {
      groupId:            group.groupId,
      particulars:        state.particulars,
      category:           state.category,
      invoiceNumber:      state.invoiceNumber,
      invoiceDate:        state.invoiceDate,
      amount:             { value: parseNum(state.amount.value), currency: state.amount.currency },
      transactionCharges: { value: parseNum(state.txCharges.value), currency: state.txCharges.currency },
      payments,
      settlements,
    };

    try {
      let saved;
      if (isEdit) {
        saved = Expenses.update(existingExpense.expenseId, expenseData);
        showToast('Expense updated!', 'success');
      } else {
        saved = Expenses.create(expenseData);
        showToast('Expense added!', 'success');
      }
      closeModal();
      if (typeof onSaved === 'function') onSaved(saved);
    } catch (err) {
      showToast(err.message || 'Failed to save expense.', 'error');
    }
  }

  /* === Open modal and render === */
  const modal = openModal({
    title: isEdit ? 'Edit Expense' : 'Add Expense',
    content: '',
    footer: '',
    size: 'modal-wide',
  });

  // Add footer manually
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  modal.appendChild(footer);

  renderBody();

  return modal;
}
