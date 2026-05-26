/**
 * DutchIT – Expense Business Logic & Balance Engine
 */
import { ExpenseStore, GroupStore } from './store.js';
import { generateExpenseId, round, parseNum } from './utils.js';
import { User } from './user.js';

/**
 * Calculate the average rate from custom conversion records in a group,
 * using the volume-weighted average of amounts converted.
 * Fallbacks to standard relative exchange rates if no manual entries exist.
 */
export function getAverageRate(group, fromCurr, toCurr) {
  if (fromCurr === toCurr) return { rate: 1, isDefault: false };

  const rates = group?.conversionRates || [];

  // 1. Build adjacency list of direct weighted volumes
  const adj = {};
  const addEdge = (u, v, srcAmt, tgtAmt) => {
    if (!adj[u]) adj[u] = {};
    if (!adj[u][v]) adj[u][v] = { srcSum: 0, tgtSum: 0 };
    adj[u][v].srcSum += srcAmt;
    adj[u][v].tgtSum += tgtAmt;
  };

  for (const r of rates) {
    const from = r.from;
    const to = r.to;
    const fromAmt = parseFloat(r.fromAmount) || 0;
    const toAmt = parseFloat(r.toAmount) || 0;
    if (fromAmt <= 0 || toAmt <= 0) continue;

    addEdge(from, to, fromAmt, toAmt);
    addEdge(to, from, toAmt, fromAmt); // reverse path
  }

  // Calculate weighted rates for each direct edge
  const graph = {};
  for (const u of Object.keys(adj)) {
    graph[u] = {};
    for (const v of Object.keys(adj[u])) {
      const { srcSum, tgtSum } = adj[u][v];
      if (srcSum > 0) {
        graph[u][v] = tgtSum / srcSum;
      }
    }
  }

  // 2. BFS to find shortest path from fromCurr to toCurr in the custom rates graph
  const queue = [[fromCurr, 1]];
  const visited = new Set([fromCurr]);

  while (queue.length > 0) {
    const [curr, currentRate] = queue.shift();

    if (curr === toCurr) {
      return { rate: currentRate, isDefault: false };
    }

    const neighbors = graph[curr] || {};
    for (const [nextCurr, rate] of Object.entries(neighbors)) {
      if (!visited.has(nextCurr)) {
        visited.add(nextCurr);
        queue.push([nextCurr, currentRate * rate]);
      }
    }
  }

  // 3. Fallback to standard relative-to-USD rates if no path found
  const FALLBACK_TO_USD = {
    USD: 1.0,
    INR: 83.5,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 156.0,
    AUD: 1.50,
    CAD: 1.36,
    CHF: 0.91,
    CNY: 7.24,
    SGD: 1.35,
    HKD: 7.80,
    AED: 3.67,
    SAR: 3.75,
    THB: 36.5,
    MYR: 4.70,
    IDR: 16000.0,
  };

  const usdSrc = FALLBACK_TO_USD[fromCurr] || 1.0;
  const usdTgt = FALLBACK_TO_USD[toCurr] || 1.0;

  const rate = (1 / usdSrc) * usdTgt;
  return { rate, isDefault: true };
}

/**
 * Volume-weighted conversion stats for a currency pair (sums of amounts, not average of rates).
 */
export function getConversionStats(group, fromCurr, toCurr) {
  if (fromCurr === toCurr) {
    return { rate: 1, srcSum: 0, tgtSum: 0, tradeCount: 0, isDefault: false };
  }

  const rates = group?.conversionRates || [];
  let srcSum = 0;
  let tgtSum = 0;
  let tradeCount = 0;

  for (const r of rates) {
    if (r.from === fromCurr && r.to === toCurr) {
      srcSum += parseFloat(r.fromAmount) || 0;
      tgtSum += parseFloat(r.toAmount) || 0;
      tradeCount++;
    } else if (r.from === toCurr && r.to === fromCurr) {
      srcSum += parseFloat(r.toAmount) || 0;
      tgtSum += parseFloat(r.fromAmount) || 0;
      tradeCount++;
    }
  }

  if (srcSum > 0 && tgtSum > 0) {
    return { rate: tgtSum / srcSum, srcSum, tgtSum, tradeCount, isDefault: false };
  }

  const { rate, isDefault } = getAverageRate(group, fromCurr, toCurr);
  return { rate, srcSum: 0, tgtSum: 0, tradeCount: 0, isDefault };
}

export const Expenses = {

  /** Create an expense */
  create(expenseData) {
    const currentUser = User.get();
    const expense = {
      expenseId: generateExpenseId(),
      ...expenseData,
      createdBy: currentUser?.userId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editHistory: [],
    };
    return ExpenseStore.create(expense);
  },

  /** Update an expense */
  update(expenseId, updates) {
    return ExpenseStore.update(expenseId, updates);
  },

  /** Delete an expense */
  delete(expenseId) {
    ExpenseStore.delete(expenseId);
  },

  /** Get all expenses for a group */
  getForGroup(groupId) {
    return ExpenseStore.getByGroup(groupId);
  },

  /** Get a single expense */
  getById(expenseId) {
    return ExpenseStore.getById(expenseId);
  },

  /**
   * Calculate split amounts given a split configuration
   * @param {number} totalAmount - Total expense amount
   * @param {string} splitType - 'equal' | 'absolute' | 'percentage'
   * @param {Array} members - [{memberId, name, value?}] where value is % or absolute amount
   * @param {number} decimals - Currency decimal places
   * @returns {Array} [{memberId, name, amount, percentage}]
   */
  calculateSplit(totalAmount, splitType, members, decimals = 2) {
    if (!members || members.length === 0) return [];
    const total = parseNum(totalAmount);

    if (splitType === 'equal') {
      const share = round(total / members.length, decimals);
      // Distribute rounding remainder to first member
      const remainder = round(total - share * members.length, decimals);
      return members.map((m, i) => ({
        memberId: m.memberId,
        name: m.name,
        amount: i === 0 ? round(share + remainder, decimals) : share,
        percentage: round(100 / members.length, 2),
      }));
    }

    if (splitType === 'percentage') {
      return members.map(m => {
        const pct = parseNum(m.value);
        const amount = round((pct / 100) * total, decimals);
        return { memberId: m.memberId, name: m.name, amount, percentage: pct };
      });
    }

    if (splitType === 'absolute') {
      return members.map(m => {
        const amount = parseNum(m.value);
        const pct = total > 0 ? round((amount / total) * 100, 2) : 0;
        return { memberId: m.memberId, name: m.name, amount, percentage: pct };
      });
    }

    return [];
  },

  /**
   * Validate a split configuration
   * @returns {object} { valid: bool, message: string, remainder: number }
   */
  validateSplit(splitType, members, totalAmount, decimals = 2) {
    if (!members || members.length === 0) {
      return { valid: false, message: 'No members selected' };
    }

    if (splitType === 'equal') {
      return { valid: true, message: '', remainder: 0 };
    }

    if (splitType === 'percentage') {
      const sum = members.reduce((acc, m) => acc + parseNum(m.value), 0);
      const remainder = round(100 - sum, 2);
      if (Math.abs(remainder) > 0.01) {
        return { valid: false, message: `Percentages sum to ${round(sum, 2)}% (must be 100%)`, remainder };
      }
      return { valid: true, message: '', remainder: 0 };
    }

    if (splitType === 'absolute') {
      const sum = members.reduce((acc, m) => acc + parseNum(m.value), 0);
      const total = parseNum(totalAmount);
      const remainder = round(total - sum, decimals);
      if (Math.abs(remainder) > Math.pow(10, -decimals)) {
        return {
          valid: false,
          message: `Amounts sum to ${round(sum, decimals)} (must equal ${round(total, decimals)})`,
          remainder,
        };
      }
      return { valid: true, message: '', remainder: 0 };
    }

    return { valid: false, message: 'Unknown split type' };
  },

  /** Convert an amount to the group's base currency using volume-weighted rates */
  convertToBase(group, amount, currency, baseCurrency) {
    const { rate } = getAverageRate(group, currency, baseCurrency);
    return amount * rate;
  },

  /**
   * Pairwise balance engine.
   * For member Y relative to member X (in base currency):
   *   net = (amount Y paid covering X's share) − (amount Y owes on expenses paid by X)
   * Positive net → X owes Y; negative net → Y owes X.
   *
   * Returns { pairwise, baseCurrency, memberIds }
   */
  calculatePairwiseBalances(groupId) {
    const group = GroupStore.getById(groupId);
    const baseCurrency = group?.baseCurrency || 'USD';
    const memberIds = (group?.members || []).map(m => m.memberId);
    const expenses = ExpenseStore.getByGroup(groupId);

    const paidFor = {};
    const owedOn = {};

    for (const id of memberIds) {
      paidFor[id] = {};
      owedOn[id] = {};
      for (const other of memberIds) {
        if (id !== other) {
          paidFor[id][other] = 0;
          owedOn[id][other] = 0;
        }
      }
    }

    for (const expense of expenses) {
      const payments = expense.payments || [];
      const settlements = (expense.settlements || []).filter(
        s => parseNum(s.calculatedAmount?.value) > 0.001
      );

      if (payments.length === 0 || settlements.length === 0) continue;

      const expCurr = expense.amount?.currency || baseCurrency;

      const paymentsBase = payments.map(p => ({
        memberId: p.memberId,
        amount: this.convertToBase(
          group,
          parseNum(p.amount?.value || 0),
          p.amount?.currency || expCurr,
          baseCurrency
        ),
      }));

      const settlementsBase = settlements.map(s => ({
        memberId: s.memberId,
        amount: this.convertToBase(
          group,
          parseNum(s.calculatedAmount?.value || 0),
          s.calculatedAmount?.currency || expCurr,
          baseCurrency
        ),
      }));

      const totalShare = settlementsBase.reduce((sum, s) => sum + s.amount, 0);
      if (totalShare < 0.001) continue;

      for (const pay of paymentsBase) {
        for (const sett of settlementsBase) {
          if (pay.memberId === sett.memberId) continue;
          const portion = pay.amount * (sett.amount / totalShare);
          paidFor[pay.memberId][sett.memberId] = round(
            paidFor[pay.memberId][sett.memberId] + portion,
            4
          );
          owedOn[sett.memberId][pay.memberId] = round(
            owedOn[sett.memberId][pay.memberId] + portion,
            4
          );
        }
      }
    }

    const pairwise = {};
    for (const y of memberIds) {
      pairwise[y] = {};
      for (const x of memberIds) {
        if (y === x) continue;
        const paidForX = paidFor[y][x] || 0;
        const owedToX = owedOn[y][x] || 0;
        pairwise[y][x] = {
          paidFor: paidForX,
          owedTo: owedToX,
          net: round(paidForX - owedToX, 4),
        };
      }
    }

    return { pairwise, baseCurrency, memberIds };
  },

  /**
   * Per-member balances in base currency derived from pairwise ledger.
   * paid  = total advanced for other members' shares
   * owed  = total share owed on others' expenses
   * net   = paid − owed (positive = member is owed money overall)
   */
  calculateBalances(groupId) {
    const group = GroupStore.getById(groupId);
    const { pairwise, baseCurrency, memberIds } = this.calculatePairwiseBalances(groupId);
    const balances = {};

    for (const memberId of memberIds) {
      let paidForOthers = 0;
      let owedToOthers = 0;
      let netSum = 0;

      for (const otherId of memberIds) {
        if (memberId === otherId) continue;
        const rel = pairwise[memberId][otherId];
        paidForOthers = round(paidForOthers + rel.paidFor, 4);
        owedToOthers = round(owedToOthers + rel.owedTo, 4);
        netSum = round(netSum + rel.net, 4);
      }

      balances[memberId] = {
        paid: paidForOthers,
        owed: owedToOthers,
        net: netSum,
      };
    }

    return balances;
  },

  /**
   * Generate simplified debt statements for a group in Base Currency.
   * Returns array of: { from, fromName, to, toName, currency, amount }
   */
  generateSettlements(groupId, group) {
    const balances = this.calculateBalances(groupId);
    const baseCurrency = group?.baseCurrency || 'USD';
    const members = group?.members || [];
    const getMemberName = (id) => members.find(m => m.memberId === id)?.name || id;

    const settlements = [];

    // Build creditors (positive net) and debtors (negative net)
    const ledger = Object.entries(balances)
      .map(([memberId, b]) => ({
        memberId,
        name: getMemberName(memberId),
        balance: round(b.net, 4),
      }))
      .filter(e => Math.abs(e.balance) > 0.001);

    const creditors = ledger.filter(e => e.balance > 0).sort((a, b) => b.balance - a.balance);
    const debtors   = ledger.filter(e => e.balance < 0).sort((a, b) => a.balance - b.balance);

    let ci = 0, di = 0;
    const creds = creditors.map(c => ({ ...c }));
    const debts = debtors.map(d => ({ ...d, balance: -d.balance }));

    while (ci < creds.length && di < debts.length) {
      const credit = creds[ci].balance;
      const debt   = debts[di].balance;
      const amount = round(Math.min(credit, debt), 4);

      if (amount > 0.001) {
        settlements.push({
          from:     debts[di].memberId,
          fromName: debts[di].name,
          to:       creds[ci].memberId,
          toName:   creds[ci].name,
          currency: baseCurrency,
          amount:   round(amount, 4),
        });
      }

      creds[ci].balance = round(credit - amount, 4);
      debts[di].balance = round(debt - amount, 4);

      if (creds[ci].balance < 0.001) ci++;
      if (debts[di].balance < 0.001) di++;
    }

    return settlements;
  },

  /**
   * Get a member's net balance summary for a group (for display in group card)
   * Returns { paid, owed, net } in Base Currency
   */
  getMemberNetBalance(groupId, memberId) {
    const balances = this.calculateBalances(groupId);
    return balances[memberId] || { paid: 0, owed: 0, net: 0 };
  },
};
