/**
 * DutchIT – Expense Analysis (aggregations & filters)
 */
import { Expenses } from './expenses.js';
import { GroupStore } from './store.js';
import { getCategoryById, EXPENSE_CATEGORIES } from './utils.js';
import { parseNum, round } from './utils.js';

export const DEFAULT_FILTERS = {
  dateFrom: '',
  dateTo: '',
  category: '',
  memberId: '',
};

/** Filter expenses by date range, category, and member involvement */
export function filterExpenses(expenses, filters = {}) {
  const { dateFrom = '', dateTo = '', category = '', memberId = '' } = filters;

  return expenses.filter(exp => {
    const date = exp.invoiceDate || exp.createdAt?.slice(0, 10) || '';
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    if (category && exp.category !== category) return false;

    if (memberId) {
      const inPayment = (exp.payments || []).some(p => p.memberId === memberId);
      const inSettlement = (exp.settlements || []).some(s => s.memberId === memberId);
      const isAdder =
        exp.addedByMemberId === memberId || exp.createdBy === memberId;
      if (!inPayment && !inSettlement && !isAdder) return false;
    }

    return true;
  });
}

/** Convert expense total (+ charges) to base currency */
function expenseTotalInBase(group, expense, baseCurrency) {
  const expCurr = expense.amount?.currency || baseCurrency;
  const amt = parseNum(expense.amount?.value || 0);
  const charges = parseNum(expense.transactionCharges?.value || 0);
  const chargeCurr = expense.transactionCharges?.currency || expCurr;
  const total = Expenses.convertToBase(group, amt, expCurr, baseCurrency)
    + Expenses.convertToBase(group, charges, chargeCurr, baseCurrency);
  return round(total, 4);
}

/** Summary stats for filtered expenses */
export function getAnalysisSummary(group, expenses, filters) {
  const baseCurrency = group?.baseCurrency || 'USD';
  const filtered = filterExpenses(expenses, filters);
  const total = filtered.reduce((sum, exp) => sum + expenseTotalInBase(group, exp, baseCurrency), 0);

  return {
    baseCurrency,
    expenseCount: filtered.length,
    totalAmount: round(total, 2),
    avgAmount: filtered.length > 0 ? round(total / filtered.length, 2) : 0,
    totalUnfiltered: expenses.length,
  };
}

/** Spending by category (base currency) */
export function aggregateByCategory(group, expenses, filters) {
  const baseCurrency = group?.baseCurrency || 'USD';
  const filtered = filterExpenses(expenses, filters);
  const map = {};

  for (const exp of filtered) {
    const catId = exp.category || 'other';
    if (!map[catId]) {
      const cat = getCategoryById(catId);
      map[catId] = {
        categoryId: catId,
        label: cat.label,
        emoji: cat.emoji,
        color: cat.color,
        total: 0,
        count: 0,
      };
    }
    map[catId].total = round(map[catId].total + expenseTotalInBase(group, exp, baseCurrency), 4);
    map[catId].count += 1;
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
}

/** Paid vs share by member (base currency) */
export function aggregateByPerson(group, expenses, filters) {
  const baseCurrency = group?.baseCurrency || 'USD';
  const filtered = filterExpenses(expenses, filters);
  const members = group?.members || [];
  const map = {};

  for (const m of members) {
    map[m.memberId] = {
      memberId: m.memberId,
      name: m.name,
      paid: 0,
      share: 0,
      expenseCount: 0,
    };
  }

  const paidExpenseIds = {};

  for (const exp of filtered) {
    const expCurr = exp.amount?.currency || baseCurrency;
    const expTotalBase = expenseTotalInBase(group, exp, baseCurrency);
    const payments = exp.payments || [];
    const settlements = exp.settlements || [];

    if (payments.length > 0) {
      for (const p of payments) {
        if (!map[p.memberId]) continue;
        const payCurr = p.amount?.currency || expCurr;
        map[p.memberId].paid = round(
          map[p.memberId].paid + Expenses.convertToBase(group, parseNum(p.amount?.value || 0), payCurr, baseCurrency),
          4
        );
        if (!paidExpenseIds[p.memberId]) paidExpenseIds[p.memberId] = new Set();
        paidExpenseIds[p.memberId].add(exp.expenseId);
      }
    } else {
      const adderId =
        exp.addedByMemberId ||
        exp.createdBy ||
        members[0]?.memberId;
      if (adderId && map[adderId]) {
        map[adderId].paid = round(map[adderId].paid + expTotalBase, 4);
        if (!paidExpenseIds[adderId]) paidExpenseIds[adderId] = new Set();
        paidExpenseIds[adderId].add(exp.expenseId);
      }
    }

    if (settlements.length > 0) {
      for (const s of settlements) {
        if (!map[s.memberId]) continue;
        const sCurr = s.calculatedAmount?.currency || expCurr;
        map[s.memberId].share = round(
          map[s.memberId].share + Expenses.convertToBase(group, parseNum(s.calculatedAmount?.value || 0), sCurr, baseCurrency),
          4
        );
      }
    } else if (members.length > 0 && expTotalBase > 0) {
      const perMember = expTotalBase / members.length;
      for (const m of members) {
        map[m.memberId].share = round(map[m.memberId].share + perMember, 4);
      }
    }
  }

  for (const id of Object.keys(map)) {
    map[id].expenseCount = paidExpenseIds[id]?.size || 0;
  }

  return Object.values(map).sort((a, b) => b.share + b.paid - (a.share + a.paid));
}

/** Daily totals by invoice date */
export function aggregateByDate(group, expenses, filters) {
  const baseCurrency = group?.baseCurrency || 'USD';
  const filtered = filterExpenses(expenses, filters);
  const map = {};

  for (const exp of filtered) {
    const date = exp.invoiceDate || exp.createdAt?.slice(0, 10) || 'Unknown';
    if (!map[date]) map[date] = { date, total: 0, count: 0 };
    map[date].total = round(map[date].total + expenseTotalInBase(group, exp, baseCurrency), 4);
    map[date].count += 1;
  }

  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

/** Date bounds from all expenses in group */
export function getDateBounds(expenses) {
  const dates = expenses
    .map(e => e.invoiceDate || e.createdAt?.slice(0, 10))
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return { min: '', max: '' };
  return { min: dates[0], max: dates[dates.length - 1] };
}

export function getCategoryOptions() {
  return EXPENSE_CATEGORIES.map(c => ({ id: c.id, label: c.label, emoji: c.emoji }));
}
