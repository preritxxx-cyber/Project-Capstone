/**
 * DutchIT – Group Detail View
 * Tabs: Expenses | Balances | Conversions | Members
 */
import { Groups } from '../js/groups.js';
import { Expenses, getAverageRate, getConversionStats } from '../js/expenses.js';
import { User } from '../js/user.js';
import { GroupStore } from '../js/store.js';
import { formatAmount, formatAmountWithCode, getCurrency } from '../js/currencies.js';
import {
  getInitials, getAvatarColors, escapeHtml, formatDate, timeAgo,
  getCategoryById, copyToClipboard, round,
} from '../js/utils.js';
import { openGroupForm } from './groupForm.js';
import { openExpenseForm } from './expenseForm.js';
import { openConversionForm } from './conversionForm.js';
import { openConfirm, showToast } from './modals.js';
import { fxHeaderButtonHtml, attachFxHeaderButton, updateFxContext } from './globalFx.js';
import { renderAnalysisTab, mountAnalysisTab } from './analysisTab.js';

/* ─── Helpers ─── */

function avatarHtml(name, size = '') {
  const initials = getInitials(name);
  const [bg, fg] = getAvatarColors(name);
  return `<div class="member-avatar ${size}" style="background:linear-gradient(135deg,${bg},${fg})">${initials}</div>`;
}

/* ─── Tab: Expenses ─── */
function renderExpensesTab(group, expenses, onRefresh) {
  if (expenses.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="empty-state-title">No expenses yet</div>
        <div class="empty-state-desc">Add the first expense for this trip!</div>
        <button class="btn btn-orange" id="exp-add-first">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Expense
        </button>
      </div>
    `;
  }

  return `
    <div id="expenses-list">
      ${expenses.map(exp => renderExpenseItem(exp, group)).join('')}
    </div>
  `;
}

function renderExpenseItem(exp, group) {
  const cat = getCategoryById(exp.category);
  const payers = (exp.payments || []).map(p => {
    const member = group.members.find(m => m.memberId === p.memberId);
    return member?.name || 'Unknown';
  });
  const payerText = payers.length > 0 ? `Paid by ${payers.join(', ')}` : '';

  return `
    <div class="expense-item" data-exp-id="${exp.expenseId}">
      <div class="expense-category-icon" style="background:${cat.bg};color:${cat.color}">
        ${cat.emoji}
      </div>
      <div class="expense-info">
        <div class="expense-title">${escapeHtml(exp.particulars)}</div>
        <div class="expense-meta">
          <span>${formatDate(exp.invoiceDate)}</span>
          <span style="color:var(--color-border)">·</span>
          <span class="badge badge-gray" style="font-size:10px">${cat.label}</span>
          ${payerText ? `<span style="color:var(--color-border)">·</span><span>${escapeHtml(payerText)}</span>` : ''}
          ${exp.invoiceNumber ? `<span style="color:var(--color-border)">·</span><span style="font-family:monospace;font-size:11px">${escapeHtml(exp.invoiceNumber)}</span>` : ''}
        </div>
      </div>
      <div class="expense-amounts">
        <div class="expense-amount-total">${formatAmount(exp.amount?.value, exp.amount?.currency)}</div>
        ${exp.transactionCharges?.value > 0
          ? `<div class="expense-amount-share" style="color:var(--color-text-muted)">+${formatAmount(exp.transactionCharges.value, exp.transactionCharges.currency)} fees</div>`
          : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--sp-1);flex-shrink:0;margin-left:var(--sp-2)">
        <button class="btn btn-ghost btn-icon btn-icon-sm exp-edit-btn" data-id="${exp.expenseId}" title="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-ghost btn-icon btn-icon-sm exp-del-btn" data-id="${exp.expenseId}" title="Delete" style="color:var(--color-error)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/* ─── Tab: Balances (pairwise net in base currency) ─── */
function renderBalancesTab(group) {
  const currentUser = User.get();
  const settlements = Expenses.generateSettlements(group.groupId, group);
  const memberBalances = Expenses.calculateBalances(group.groupId);
  const { pairwise } = Expenses.calculatePairwiseBalances(group.groupId);
  const baseCurrency = group.baseCurrency || 'USD';

  const hasActivity = Object.values(memberBalances).some(
    b => Math.abs(b.paid) > 0.001 || Math.abs(b.owed) > 0.001
  );

  if (!hasActivity && settlements.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <div class="empty-state-title">No balances yet</div>
        <div class="empty-state-desc">Add expenses to see who owes what in the trip base currency (${baseCurrency}).</div>
      </div>
    `;
  }

  const myBal = memberBalances[currentUser?.userId] || { paid: 0, owed: 0, net: 0 };
  const isPositive = myBal.net > 0.001;
  const isNegative = myBal.net < -0.001;
  const isNeutral  = !isPositive && !isNegative;

  // Pairwise rows for current user vs each other member
  const myPairwiseRows = group.members
    .filter(m => m.memberId !== currentUser?.userId)
    .map(other => {
      const rel = pairwise[currentUser?.userId]?.[other.memberId] || { paidFor: 0, owedTo: 0, net: 0 };
      const isPos = rel.net > 0.001;
      const isNeg = rel.net < -0.001;
      const isNeut = !isPos && !isNeg;
      return { other, rel, isPos, isNeg, isNeut };
    })
    .filter(row => Math.abs(row.rel.net) > 0.001 || row.rel.paidFor > 0.001 || row.rel.owedTo > 0.001);

  return `
    <!-- Personal Summary Card -->
    <div class="balance-summary-card" style="margin-bottom:var(--sp-5);background:linear-gradient(135deg,var(--blue-900),var(--blue-700));color:white;border-radius:var(--radius-xl);padding:var(--sp-5);box-shadow:var(--shadow-lg)">
      <div style="font-size:var(--fs-xs);font-weight:600;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.75);margin-bottom:var(--sp-3)">Your Trip Summary (${baseCurrency})</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-bottom:var(--sp-4)">
        <div style="border-right:1px solid rgba(255,255,255,0.15)">
          <div style="font-size:11px;color:rgba(255,255,255,0.7)">Paid for others' shares</div>
          <div style="font-size:var(--fs-lg);font-weight:700;margin-top:2px">${formatAmount(myBal.paid, baseCurrency)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.7)">Owes on others' expenses</div>
          <div style="font-size:var(--fs-lg);font-weight:700;margin-top:2px">${formatAmount(myBal.owed, baseCurrency)}</div>
        </div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,0.15);margin-bottom:var(--sp-3)"></div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:var(--fs-sm);font-weight:500;color:rgba(255,255,255,0.85)">Net Balance</span>
        <span style="font-size:var(--fs-xl);font-weight:800;color:${isPositive ? '#34D399' : isNegative ? '#F87171' : 'rgba(255,255,255,0.9)'}">
          ${isNeutral ? 'Settled Up ✓' : (isPositive ? 'You are owed +' : 'You owe -') + formatAmount(Math.abs(myBal.net), baseCurrency)}
        </span>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,0.55);margin-top:var(--sp-2)">
        Net = paid for others' shares − owed on others' expenses (all in ${baseCurrency})
      </div>
    </div>

    ${myPairwiseRows.length > 0 ? `
      <div class="card" style="margin-bottom:var(--sp-5)">
        <div class="card-header">
          <span style="font-weight:700;font-size:var(--fs-md)">Your balance with each member</span>
        </div>
        <div>
          ${myPairwiseRows.map(({ other, rel, isPos, isNeg, isNeut }) => `
            <div class="balance-entry" style="align-items:flex-start;padding:var(--sp-4) var(--sp-5)">
              ${avatarHtml(other.name, 'size-sm')}
              <div style="flex:1;font-size:var(--fs-sm)">
                <div style="font-weight:600">${escapeHtml(other.name)}</div>
                <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">
                  You paid for their share: ${formatAmount(rel.paidFor, baseCurrency)} ·
                  You owe on their expenses: ${formatAmount(rel.owedTo, baseCurrency)}
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700;font-size:var(--fs-md);color:${isNeut ? 'var(--color-text-muted)' : isPos ? 'var(--color-success)' : 'var(--color-error)'}">
                  ${isNeut ? '—' : (isPos ? '+' : '') + formatAmount(Math.abs(rel.net), baseCurrency)}
                </div>
                <div style="font-size:10px;color:var(--color-text-muted);margin-top:2px">
                  ${isNeut ? 'settled' : isPos ? `${escapeHtml(other.name)} owes you` : `you owe ${escapeHtml(other.name)}`}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Settlements list -->
    ${settlements.length > 0 ? `
      <div class="card" style="margin-bottom:var(--sp-5)">
        <div class="card-header">
          <span style="font-weight:700;font-size:var(--fs-md)">Suggested Settlements</span>
          <span class="badge badge-blue">${settlements.length}</span>
        </div>
        <div>
          ${settlements.map(s => {
            const fromIsMe = s.from === currentUser?.userId;
            const toIsMe   = s.to   === currentUser?.userId;
            return `
              <div class="balance-entry">
                ${avatarHtml(s.fromName, 'size-sm')}
                <div class="balance-direction" style="flex:1">
                  <span style="font-weight:600;color:var(--color-text)">${escapeHtml(s.fromName)}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  <span style="font-weight:600;color:var(--color-text)">${escapeHtml(s.toName)}</span>
                  ${fromIsMe ? '<span class="badge badge-orange" style="font-size:10px">You pay</span>' : ''}
                  ${toIsMe   ? '<span class="badge badge-green" style="font-size:10px">You receive</span>' : ''}
                </div>
                ${avatarHtml(s.toName, 'size-sm')}
                <div class="balance-amount" style="${fromIsMe ? 'color:var(--color-error)' : toIsMe ? 'color:var(--color-success)' : 'color:var(--color-text)'}">
                  ${formatAmount(s.amount, s.currency)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Overall net per member -->
    <div class="card" style="margin-bottom:var(--sp-5)">
      <div class="card-header">
        <span style="font-weight:700;font-size:var(--fs-base)">Overall Net Balances (${baseCurrency})</span>
        <span class="badge badge-blue">Settle in base currency</span>
      </div>
      <div>
        ${group.members.map(member => {
          const b = memberBalances[member.memberId] || { paid: 0, owed: 0, net: 0 };
          const isPos = b.net > 0.001;
          const isNeg = b.net < -0.001;
          const isNeut = !isPos && !isNeg;
          return `
            <div class="balance-entry" style="align-items:flex-start;padding:var(--sp-4) var(--sp-5)">
              ${avatarHtml(member.name, 'size-sm')}
              <div style="flex:1;font-size:var(--fs-sm);font-weight:500;margin-top:2px">
                <div>${escapeHtml(member.name)}</div>
                <div style="font-size:11px;color:var(--color-text-muted);font-weight:normal;margin-top:2px">
                  Paid for others: ${formatAmount(b.paid, baseCurrency)} · Owes on others: ${formatAmount(b.owed, baseCurrency)}
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700;font-size:var(--fs-md);color:${isNeut ? 'var(--color-text-muted)' : isPos ? 'var(--color-success)' : 'var(--color-error)'}">
                  ${isNeut ? '—' : (isPos ? '+' : '') + formatAmount(Math.abs(b.net), baseCurrency)}
                </div>
                ${!isNeut ? `<div style="font-size:10px;color:var(--color-text-muted);margin-top:2px">${isPos ? 'net owed to them' : 'net they owe'}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Full pairwise matrix -->
    ${group.members.length > 1 ? `
      <div class="card" style="margin-bottom:var(--sp-4)">
        <div class="card-header">
          <span style="font-weight:700;font-size:var(--fs-base)">Pairwise Net Balances</span>
          <span class="badge badge-gray" style="font-size:10px">Row owes column when negative</span>
        </div>
        <div style="padding:var(--sp-4);overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:var(--fs-xs);min-width:320px">
            <thead>
              <tr>
                <th style="padding:8px;text-align:left;color:var(--color-text-muted)"></th>
                ${group.members.map(m => `
                  <th style="padding:8px;text-align:center;color:var(--color-text-secondary);font-weight:600">${escapeHtml(m.name.split(' ')[0])}</th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${group.members.map(rowM => `
                <tr>
                  <td style="padding:8px;font-weight:600;color:var(--color-text);white-space:nowrap">${escapeHtml(rowM.name.split(' ')[0])}</td>
                  ${group.members.map(colM => {
                    if (rowM.memberId === colM.memberId) {
                      return `<td style="padding:8px;text-align:center;color:var(--color-text-muted)">—</td>`;
                    }
                    const rel = pairwise[rowM.memberId]?.[colM.memberId] || { net: 0 };
                    const n = rel.net;
                    if (Math.abs(n) < 0.001) {
                      return `<td style="padding:8px;text-align:center;color:var(--color-text-muted)">0</td>`;
                    }
                    const color = n > 0 ? 'var(--color-success)' : 'var(--color-error)';
                    const label = n > 0
                      ? `${escapeHtml(colM.name.split(' ')[0])} owes`
                      : `owes ${escapeHtml(colM.name.split(' ')[0])}`;
                    return `
                      <td style="padding:8px;text-align:center">
                        <div style="font-weight:700;color:${color}">${n > 0 ? '+' : ''}${formatAmount(Math.abs(n), baseCurrency)}</div>
                        <div style="font-size:9px;color:var(--color-text-muted)">${label}</div>
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p style="font-size:11px;color:var(--color-text-muted);margin:var(--sp-3) 0 0">
            Each cell: net for row member vs column member = (row paid for column's share) − (row owes on column's expenses). Positive → column member owes row member.
          </p>
        </div>
      </div>
    ` : ''}
  `;
}

/* ─── Tab: Conversions (volume-weighted rates & trade log) ─── */
function renderConversionsTab(group, onRefresh) {
  const baseCurrency = group.baseCurrency || 'USD';
  const intermediateCurrency = group.intermediateCurrency || null;
  const rates = group.conversionRates || [];

  const currencies = new Set();
  rates.forEach(r => { currencies.add(r.from); currencies.add(r.to); });
  currencies.delete(baseCurrency);

  const averageRatesList = [...currencies].map(curr => {
    const stats = getConversionStats(group, curr, baseCurrency);
    return {
      currency: curr,
      rate: stats.rate,
      isDefault: stats.isDefault,
      count: stats.tradeCount,
      srcSum: stats.srcSum,
      tgtSum: stats.tgtSum,
    };
  });

  const intermediateRates = intermediateCurrency && intermediateCurrency !== baseCurrency
    ? [
        {
          label: `${baseCurrency} ↔ ${intermediateCurrency}`,
          stats: getConversionStats(group, baseCurrency, intermediateCurrency),
        },
        ...[...currencies].filter(c => c !== intermediateCurrency).map(curr => ({
          label: `${curr} ↔ ${intermediateCurrency}`,
          stats: getConversionStats(group, curr, intermediateCurrency),
        })),
      ].filter(item => item.stats.tradeCount > 0 || !item.stats.isDefault)
    : [];

  return `
    <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
      <!-- Add Rate Card -->
      <div class="card" style="background:var(--color-surface-2);border-style:dashed;border-width:2px;border-color:var(--color-border-strong);display:flex;align-items:center;justify-content:space-between;padding:var(--sp-4) var(--sp-5)">
        <div>
          <div style="font-weight:700;font-size:var(--fs-base);color:var(--color-primary)">Exchange Conversions</div>
          <div style="font-size:var(--fs-xs);color:var(--color-text-secondary);margin-top:2px">
            Log trades (local ↔ ${intermediateCurrency || 'intermediate'} ↔ foreign). Average rate = Σ bought ÷ Σ sold.
            Base: <strong>${baseCurrency}</strong>${intermediateCurrency ? ` · Intermediate: <strong>${intermediateCurrency}</strong>` : ''}
          </div>
        </div>
        <button class="btn btn-orange" id="gv-add-conv-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Record Conversion
        </button>
      </div>

      <!-- Active Average Rates Summary -->
      <div class="card">
        <div class="card-header">
          <span style="font-weight:700;font-size:var(--fs-base)">Volume-Weighted Average Rates</span>
          <span class="badge badge-blue">Settle in ${baseCurrency}</span>
        </div>
        <div style="padding:var(--sp-4) var(--sp-5)">
          ${averageRatesList.length > 0 ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:var(--sp-3)">
              ${averageRatesList.map(item => `
                <div style="background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--sp-3)">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-weight:700;color:var(--color-primary);font-size:var(--fs-md)">${item.currency} → ${baseCurrency}</span>
                    <span class="badge ${item.isDefault ? 'badge-gray' : 'badge-green'}" style="font-size:10px">${item.isDefault ? 'Default' : `${item.count} trade${item.count !== 1 ? 's' : ''}`}</span>
                  </div>
                  <div style="font-size:var(--fs-lg);font-weight:800;color:var(--color-text);margin-top:var(--sp-2)">
                    1 ${item.currency} = ${round(item.rate, 4)} ${baseCurrency}
                  </div>
                  ${!item.isDefault && item.srcSum > 0 ? `
                    <div style="font-size:10px;color:var(--color-text-muted);margin-top:4px">
                      Σ sold: ${formatAmount(item.srcSum, item.currency)} · Σ bought: ${formatAmount(item.tgtSum, baseCurrency)}
                    </div>
                  ` : `
                    <div style="font-size:10px;color:var(--color-text-muted);margin-top:2px">
                      Reciprocal: 1 ${baseCurrency} = ${round(1 / item.rate, 4)} ${item.currency}
                    </div>
                  `}
                </div>
              `).join('')}
            </div>
          ` : `
            <p style="color:var(--color-text-secondary);font-size:var(--fs-sm);margin:0;text-align:center">
              No conversion trades logged yet. Default global rates apply until you record exchanges.
            </p>
          `}
        </div>
      </div>

      ${intermediateRates.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <span style="font-weight:700;font-size:var(--fs-base)">Intermediate (${intermediateCurrency}) Rates</span>
          </div>
          <div style="padding:var(--sp-4) var(--sp-5);display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:var(--sp-3)">
            ${intermediateRates.map(item => `
              <div style="background:var(--blue-50);border:1px solid var(--blue-200);border-radius:var(--radius-md);padding:var(--sp-3)">
                <div style="font-weight:600;font-size:var(--fs-sm);color:var(--color-primary)">${item.label}</div>
                <div style="font-size:var(--fs-md);font-weight:800;margin-top:var(--sp-2)">
                  Avg: ${round(item.stats.rate, 4)}
                </div>
                ${item.stats.tradeCount > 0 ? `
                  <div style="font-size:10px;color:var(--color-text-muted);margin-top:2px">${item.stats.tradeCount} trade(s) · volume-weighted</div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Conversion Log History -->
      <div class="card">
        <div class="card-header">
          <span style="font-weight:700;font-size:var(--fs-base)">Conversions History Log</span>
          <span class="badge badge-blue">${rates.length}</span>
        </div>
        <div>
          ${rates.length > 0 ? `
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;text-align:left;font-size:var(--fs-sm)">
                <thead>
                  <tr style="border-bottom:1.5px solid var(--color-border);background:var(--color-surface-2)">
                    <th style="padding:12px var(--sp-4);color:var(--color-text-secondary);font-weight:600">Gave (Sold)</th>
                    <th style="padding:12px var(--sp-4);color:var(--color-text-secondary);font-weight:600">Received (Bought)</th>
                    <th style="padding:12px var(--sp-4);color:var(--color-text-secondary);font-weight:600">Implied Rate</th>
                    <th style="padding:12px var(--sp-4);color:var(--color-text-secondary);font-weight:600">Added By</th>
                    <th style="padding:12px var(--sp-4);color:var(--color-text-secondary);font-weight:600;text-align:right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rates.map(r => {
                    const member = group.members.find(m => m.memberId === r.addedBy);
                    const impliedRate = round(r.toAmount / r.fromAmount, 4);
                    return `
                      <tr style="border-bottom:1px solid var(--color-border);transition:background var(--t-fast)" class="conv-row-hover">
                        <td style="padding:12px var(--sp-4);font-weight:600;color:var(--color-primary)">${formatAmount(r.fromAmount, r.from)}</td>
                        <td style="padding:12px var(--sp-4);font-weight:600;color:var(--color-success)">${formatAmount(r.toAmount, r.to)}</td>
                        <td style="padding:12px var(--sp-4)">
                          1 ${r.from} = ${impliedRate} ${r.to}
                        </td>
                        <td style="padding:12px var(--sp-4);color:var(--color-text-secondary)">
                          ${escapeHtml(member?.name || 'Unknown')}
                        </td>
                        <td style="padding:12px var(--sp-4);text-align:right">
                          <button class="btn btn-ghost btn-sm gv-remove-rate" data-id="${r.rateId}" style="color:var(--color-error);padding:4px 8px">Delete</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="padding:var(--sp-6) var(--sp-5);text-align:center;color:var(--color-text-muted)">
              <div style="font-size:28px;margin-bottom:var(--sp-2)">📥</div>
              <div style="font-size:var(--fs-sm);font-weight:600">No conversions logged yet</div>
              <div style="font-size:12px;margin-top:2px">All foreign currency transaction split amounts are currently converted using fallback default rates.</div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

/* ─── Tab: Members ─── */
function renderMembersTab(group, onRefresh) {
  const currentUser = User.get();
  const isCreator = group.creatorId === currentUser?.userId;

  return `
    <!-- Group ID share -->
    <div class="card" style="margin-bottom:var(--sp-5)">
      <div class="card-body">
        <div style="font-size:var(--fs-sm);font-weight:700;color:var(--color-text-secondary);margin-bottom:var(--sp-2)">Invite with Group ID</div>
        <div class="copy-field" id="gv-copy-field">
          <span class="copy-field-value">${group.groupId}</span>
          <button class="copy-field-btn" id="gv-copy-id">Copy</button>
        </div>
        <p style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:var(--sp-2)">
          Share this ID so friends can join via "Join Group" on their dashboard.
        </p>
      </div>
    </div>

    <!-- Members list -->
    <div class="card">
      <div class="card-header">
        <span style="font-weight:700">Members</span>
        <span class="badge badge-blue">${group.members.length}</span>
      </div>
      <div>
        ${group.members.map(member => {
          const isMe = member.memberId === currentUser?.userId;
          const [bg, fg] = getAvatarColors(member.name);
          return `
            <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-4) var(--sp-5);border-bottom:1px solid var(--color-border)">
              <div class="member-avatar" style="background:linear-gradient(135deg,${bg},${fg})">${getInitials(member.name)}</div>
              <div style="flex:1">
                <div style="font-weight:600;font-size:var(--fs-base)">${escapeHtml(member.name)}${isMe ? ' <span class="badge badge-blue" style="font-size:10px">You</span>' : ''}</div>
                <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px">
                  ${member.isCreator ? '👑 Creator' : member.isDummy ? '👤 Guest member' : '🔗 Joined member'}
                  · ${formatDate(member.joinedAt)}
                </div>
              </div>
              ${!member.isCreator && (isCreator || isMe) ? `
                <button class="btn btn-ghost btn-sm gv-remove-member" data-mid="${member.memberId}" style="color:var(--color-error)">Remove</button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/* ─── Main Group View ─── */
export function renderGroupView(app, groupId, onBack) {
  const group    = Groups.getById(groupId);
  const expenses = Expenses.getForGroup(groupId);
  const currentUser = User.get();

  if (!group) {
    showToast('Group not found.', 'error');
    if (typeof onBack === 'function') onBack();
    return;
  }

  let activeTab = 'expenses';

  const render = () => {
    const group    = Groups.getById(groupId);
    const expenses = Expenses.getForGroup(groupId);
    updateFxContext({ groupId, groupName: group?.name || null });

    app.innerHTML = `
      <!-- Header -->
      <header class="app-header">
        <button class="btn btn-ghost btn-icon" id="gv-back" title="Back to dashboard">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div class="header-breadcrumb">
          <span class="header-breadcrumb-item" id="gv-dash-link">My Trips</span>
          <span class="header-breadcrumb-sep">/</span>
          <span class="header-breadcrumb-item current">${escapeHtml(group.name)}</span>
        </div>

        <div class="header-actions">
          ${fxHeaderButtonHtml()}
          <button class="btn btn-secondary btn-sm" id="gv-edit-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
        </div>
      </header>

      <!-- Group Hero Header -->
      <div class="group-detail-header">
        <div class="group-detail-header-inner">
          <div class="group-hero">
            <div class="group-hero-avatar">
              ${group.pictureType === 'upload' && group.picture
                ? `<img src="${group.picture}" alt="${escapeHtml(group.name)}" />`
                : `<span style="font-size:36px">${group.picture || '✈️'}</span>`}
            </div>
            <div class="group-hero-info">
              <h1 class="group-hero-name">${escapeHtml(group.name)}</h1>
              <div class="group-hero-meta">
                <span class="group-hero-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  ${group.members.length} members
                </span>
                <span class="group-hero-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  ${expenses.length} expenses
                </span>
                <span class="group-hero-badge">
                  💱 Base: ${group.baseCurrency}${group.intermediateCurrency ? ` · Via ${group.intermediateCurrency}` : ''}
                </span>
              </div>
              <!-- Member pills -->
              <div class="group-members-row" style="margin-top:var(--sp-3)">
                ${group.members.slice(0, 8).map(m => `
                  <div class="group-member-pill">
                    <div style="width:18px;height:18px;border-radius:50%;background:${getAvatarColors(m.name)[0]};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:white">${getInitials(m.name)}</div>
                    ${escapeHtml(m.name)}
                  </div>
                `).join('')}
                ${group.members.length > 8 ? `<span class="group-hero-badge">+${group.members.length - 8} more</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="group-detail-tabs">
        <div class="tabs" style="max-width:var(--content-max);margin:0 auto">
          ${[
            { id:'expenses',    label:'Expenses',    count: expenses.length },
            { id:'analysis',    label:'Analysis',    count: null },
            { id:'balances',    label:'Balances',    count: null },
            { id:'conversions', label:'Conversions', count: (group.conversionRates || []).length },
            { id:'members',     label:'Members',     count: group.members.length },
          ].map(tab => `
            <button class="tab-btn ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
              ${tab.label}
              ${tab.count !== null ? `<span class="tab-count">${tab.count}</span>` : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Tab Content -->
      <main class="app-view" style="padding-top:0">
        <div class="group-detail-body">
          <div class="group-content-panel" id="gv-tab-content">
            ${renderTabContent(group, expenses)}
          </div>
        </div>
      </main>

      <!-- FAB -->
      <button class="fab" id="gv-add-expense" title="Add Expense">+</button>
    `;

    if (window.lucide) window.lucide.createIcons();
    attachEvents();
  };

  function refreshAnalysisTab() {
    const g = Groups.getById(groupId);
    const ex = Expenses.getForGroup(groupId);
    const panel = document.getElementById('gv-tab-content');
    if (!panel || activeTab !== 'analysis') return;
    panel.innerHTML = renderAnalysisTab(g, ex);
    mountAnalysisTab(g, ex, refreshAnalysisTab);
  }

  function renderTabContent(group, expenses) {
    if (activeTab === 'expenses')    return renderExpensesTab(group, expenses, render);
    if (activeTab === 'analysis')    return renderAnalysisTab(group, expenses);
    if (activeTab === 'balances')    return renderBalancesTab(group);
    if (activeTab === 'conversions') return renderConversionsTab(group, render);
    if (activeTab === 'members')     return renderMembersTab(group, render);
    return '';
  }

  function attachEvents() {
    // Back
    document.getElementById('gv-back')?.addEventListener('click', () => onBack?.());
    document.getElementById('gv-dash-link')?.addEventListener('click', () => onBack?.());

    attachFxHeaderButton();

    // Edit group
    document.getElementById('gv-edit-btn')?.addEventListener('click', () => {
      const g = Groups.getById(groupId);
      openGroupForm(g, () => render());
    });

    // Tabs
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    if (activeTab === 'analysis') {
      const g = Groups.getById(groupId);
      const ex = Expenses.getForGroup(groupId);
      mountAnalysisTab(g, ex, refreshAnalysisTab);
    }

    // FAB: Add expense
    document.getElementById('gv-add-expense')?.addEventListener('click', () => {
      const g = Groups.getById(groupId);
      openExpenseForm(g, null, () => render());
    });

    // Add first expense
    document.getElementById('exp-add-first')?.addEventListener('click', () => {
      document.getElementById('gv-add-expense')?.click();
    });

    // Edit expense
    document.querySelectorAll('.exp-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const exp = Expenses.getById(btn.dataset.id);
        const g = Groups.getById(groupId);
        if (exp && g) openExpenseForm(g, exp, () => render());
      });
    });

    // Delete expense
    document.querySelectorAll('.exp-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expId = btn.dataset.id;
        const exp = Expenses.getById(expId);
        openConfirm({
          title: 'Delete Expense',
          message: `Are you sure you want to delete "${exp?.particulars || 'this expense'}"? This cannot be undone.`,
          confirmText: 'Delete',
          danger: true,
          onConfirm: () => {
            Expenses.delete(expId);
            showToast('Expense deleted.', 'info');
            render();
          },
        });
      });
    });

    // Copy group ID
    document.getElementById('gv-copy-id')?.addEventListener('click', async (e) => {
      await copyToClipboard(groupId);
      e.target.textContent = 'Copied!';
      e.target.classList.add('copied');
      setTimeout(() => { e.target.textContent = 'Copy'; e.target.classList.remove('copied'); }, 2000);
    });

    // Remove member
    document.querySelectorAll('.gv-remove-member').forEach(btn => {
      btn.addEventListener('click', () => {
        const mid = btn.dataset.mid;
        const group = Groups.getById(groupId);
        const member = group?.members.find(m => m.memberId === mid);
        openConfirm({
          title: 'Remove Member',
          message: `Remove "${member?.name}" from this group?`,
          confirmText: 'Remove',
          danger: true,
          onConfirm: () => {
            try {
              Groups.removeMember(groupId, mid);
              showToast(`${member?.name} removed.`, 'info');
              render();
            } catch (err) {
              showToast(err.message, 'error');
            }
          },
        });
      });
    });

    // Add Conversion Rate
    document.getElementById('gv-add-conv-btn')?.addEventListener('click', () => {
      openConversionForm(groupId, () => render());
    });

    // Remove Conversion Rate
    document.querySelectorAll('.gv-remove-rate').forEach(btn => {
      btn.addEventListener('click', () => {
        const rateId = btn.dataset.id;
        openConfirm({
          title: 'Delete Conversion Rate',
          message: 'Are you sure you want to delete this recorded conversion trade? Active exchange rates and member balances will recompute instantly.',
          confirmText: 'Delete',
          danger: true,
          onConfirm: () => {
            GroupStore.removeConversionRate(groupId, rateId);
            showToast('Conversion rate deleted.', 'info');
            render();
          },
        });
      });
    });
  }

  render();
}
