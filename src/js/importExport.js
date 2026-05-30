/**
 * DutchIT – Bulk expense import / summary export (Excel, CSV, PDF)
 */
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Expenses } from './expenses.js';
import { User } from './user.js';
import { CURRENCIES, getCurrency } from './currencies.js';
import { EXPENSE_CATEGORIES, parseNum, round, getCategoryById } from './utils.js';

const SHEET_EXPENSES = 'Expenses';
const SHEET_LISTS = 'Lists';
const SHEET_RULES = 'Validation Rules';
const DATA_START_ROW = 3;
const MAX_DATA_ROWS = 500;

const SPLIT_TYPES = ['equal', 'percentage', 'absolute'];

/* ─── Column layout ─── */

/** Fixed columns before per-member credit/debit columns */
export const FIXED_COLUMN_COUNT = 11;

export function buildExportHeaders(group) {
  const fixed = [
    'S. No.',
    'Particulars of the expense',
    'Invoice number',
    'Invoice date',
    'Amount',
    'Currency',
    'Transaction charges',
    'Transaction charges currency',
    'Expense category',
    'Person who added the expense',
    'Split type',
  ];
  const memberCols = [];
  for (const m of group.members) {
    memberCols.push(`${m.name} — Credit (paid)`);
    memberCols.push(`${m.name} — Debit (share)`);
  }
  return [...fixed, ...memberCols];
}

function memberColPrefix(name) {
  return name.trim();
}

export function parseMemberColumnHeader(header, members) {
  const h = String(header || '').trim();
  for (const m of members) {
    const prefix = memberColPrefix(m.name);
    if (h === `${prefix} — Credit (paid)` || h === `${prefix} - Credit (paid)` || h === `${prefix} Paid`) {
      return { memberId: m.memberId, field: 'paid' };
    }
    if (h === `${prefix} — Debit (share)` || h === `${prefix} - Debit (share)` || h === `${prefix} Share`) {
      return { memberId: m.memberId, field: 'share' };
    }
  }
  return null;
}

/** Per-expense credit / debit per member (expense currency) */
export function getExpenseMemberAmounts(expense, group) {
  const currency = expense.amount?.currency || group.baseCurrency || 'USD';
  const result = {};
  for (const m of group.members) {
    result[m.memberId] = { credit: 0, debit: 0, currency };
  }
  for (const p of expense.payments || []) {
    const amt = parseNum(p.amount?.value);
    if (p.memberId && amt > 0) {
      result[p.memberId].credit = round(result[p.memberId].credit + amt, 4);
    }
  }
  for (const s of expense.settlements || []) {
    const amt = parseNum(s.calculatedAmount?.value);
    if (s.memberId && amt > 0) {
      result[s.memberId].debit = round(result[s.memberId].debit + amt, 4);
    }
  }
  return result;
}

/** Invoice amount must equal total paid and total settled (same currency). */
export function validateInvoicePaidSettled(amount, totalPaid, totalSettled, decimals) {
  const tol = Math.pow(10, -Math.min(decimals, 2));
  if (Math.abs(totalPaid - amount) > tol) {
    return `Invoice amount (${round(amount, decimals)}) must equal total paid (${round(totalPaid, decimals)}).`;
  }
  if (Math.abs(totalSettled - amount) > tol) {
    return `Invoice amount (${round(amount, decimals)}) must equal total settled (${round(totalSettled, decimals)}).`;
  }
  return null;
}

function getAddedByName(expense, group) {
  const mid = expense.addedByMemberId || expense.createdBy;
  const member = group.members.find(m => m.memberId === mid);
  if (member) return member.name;
  const user = User.get();
  if (expense.createdBy === user?.userId) return user.displayName || 'You';
  return 'Unknown';
}

function resolveMemberByName(name, group) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return group.members.find(m => m.name.trim().toLowerCase() === n) || null;
}

function resolveCategory(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const byId = EXPENSE_CATEGORIES.find(c => c.id === v.toLowerCase());
  if (byId) return byId.id;
  const byLabel = EXPENSE_CATEGORIES.find(
    c => c.label.toLowerCase() === v.toLowerCase()
  );
  return byLabel?.id || null;
}

function parseDateCell(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value)) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    const m = String(parseInt(dmy[2], 10)).padStart(2, '0');
    const day = String(parseInt(dmy[1], 10)).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const iso = new Date(s);
  if (!isNaN(iso)) return iso.toISOString().slice(0, 10);
  return null;
}

function cellToString(cell) {
  if (cell == null) return '';
  if (typeof cell === 'object' && cell.text != null) return String(cell.text);
  if (typeof cell === 'object' && cell.result != null) return String(cell.result);
  return String(cell);
}

function cellToNumber(cell) {
  if (cell == null || cell === '') return 0;
  if (typeof cell === 'number') return cell;
  const n = parseNum(String(cell).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function downloadBlob(buffer, filename, mime) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(name) {
  return String(name || 'group').replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);
}

/* ─── Template ─── */

export async function downloadImportTemplate(group) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DutchIT';
  wb.created = new Date();

  const lists = wb.addWorksheet(SHEET_LISTS);
  lists.state = 'veryHidden';

  const currencyCodes = Object.keys(CURRENCIES).sort();
  lists.getCell('A1').value = 'Currencies';
  currencyCodes.forEach((code, i) => { lists.getCell(`A${i + 2}`).value = code; });

  lists.getCell('B1').value = 'Categories';
  EXPENSE_CATEGORIES.forEach((c, i) => { lists.getCell(`B${i + 2}`).value = c.label; });

  lists.getCell('C1').value = 'Members';
  group.members.forEach((m, i) => { lists.getCell(`C${i + 2}`).value = m.name; });

  lists.getCell('D1').value = 'SplitTypes';
  SPLIT_TYPES.forEach((t, i) => { lists.getCell(`D${i + 2}`).value = t; });

  const rules = wb.addWorksheet(SHEET_RULES);
  rules.getColumn(1).width = 28;
  rules.getColumn(2).width = 72;
  const ruleRows = [
    ['Field', 'Rule'],
    ['Particulars', 'Required text (max 200 characters).'],
    ['Invoice date', 'Required. Use YYYY-MM-DD or DD/MM/YYYY.'],
    ['Amount', 'Required positive number.'],
    ['Currency', `Must be one of ${currencyCodes.length} ISO codes on Lists sheet (dropdown).`],
    ['Expense category', 'Must match a category label on Lists sheet.'],
    ['Person who added', 'Must match a group member name exactly.'],
    ['Split type', 'equal | percentage | absolute'],
    ['Transaction charges', 'Optional fees (bank/FX). Leave 0 if none.'],
    ['Transaction charges currency', 'ISO currency for charges; defaults to expense currency if blank.'],
    ['Member — Credit (paid)', 'Amount this member paid toward the expense (0 if none). Multiple members may pay.'],
    ['Member — Debit (share)', 'For equal split: leave blank. For percentage: enter share % (must sum to 100). For absolute: enter share amount (must sum to Amount).'],
    ['Balance check', 'Invoice Amount must equal sum of all Credit (paid) AND sum of all Debit (share) columns.'],
    ['Tips', 'Delete the sample row before importing. Keep header row.'],
  ];
  ruleRows.forEach((row, i) => {
    const r = rules.getRow(i + 1);
    r.values = row;
    if (i === 0) r.font = { bold: true };
  });

  const ws = wb.addWorksheet(SHEET_EXPENSES);
  const headers = buildExportHeaders(group);
  ws.getRow(1).values = [`Import template for: ${group.name}`, ...Array(headers.length - 1).fill('')];
  ws.mergeCells(1, 1, 1, headers.length);
  ws.getRow(1).font = { bold: true, size: 12 };
  ws.getRow(1).alignment = { vertical: 'middle' };

  const headerRow = ws.getRow(2);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  headerRow.alignment = { wrapText: true, vertical: 'middle' };

  const sample = {
    particulars: 'Sample dinner (delete this row)',
    invoiceNumber: 'INV-001',
    invoiceDate: new Date().toISOString().slice(0, 10),
    amount: 100,
    currency: group.baseCurrency || 'USD',
    category: 'Food & Dining',
    addedBy: group.members[0]?.name || '',
    splitType: 'equal',
  };
  const sampleRow = ws.getRow(3);
  const memberAmounts = {};
  group.members.forEach((m, i) => {
    memberAmounts[m.memberId] = {
      credit: i === 0 ? sample.amount : 0,
      debit: '',
    };
  });
  sample.txCharges = 0;
  sample.txChargesCurrency = sample.currency;
  sampleRow.values = buildDataRowValues(1, sample, group, memberAmounts, sample);

  headers.forEach((_, i) => { ws.getColumn(i + 1).width = i < FIXED_COLUMN_COUNT ? 18 : 14; });

  const currEnd = currencyCodes.length + 1;
  const catEnd = EXPENSE_CATEGORIES.length + 1;
  const memEnd = group.members.length + 1;

  for (let r = DATA_START_ROW; r <= MAX_DATA_ROWS; r++) {
    ws.getCell(r, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'${SHEET_LISTS}'!$A$2:$A$${currEnd}`],
    };
    ws.getCell(r, 8).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'${SHEET_LISTS}'!$A$2:$A$${currEnd}`],
    };
    ws.getCell(r, 9).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'${SHEET_LISTS}'!$B$2:$B$${catEnd}`],
    };
    ws.getCell(r, 10).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'${SHEET_LISTS}'!$C$2:$C$${memEnd}`],
    };
    ws.getCell(r, 11).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'${SHEET_LISTS}'!$D$2:$D$4`],
    };
  }

  ws.views = [{ state: 'frozen', ySplit: 2 }];

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(buf, `${safeFilename(group.name)}_expense_import_template.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function buildDataRowValues(sno, row, group, memberAmounts, expenseLike) {
  const headers = buildExportHeaders(group);
  const values = new Array(headers.length).fill('');
  const exp = expenseLike || {};
  const txVal = parseNum(exp.transactionCharges?.value);
  values[0] = sno;
  values[1] = row.particulars ?? exp.particulars ?? '';
  values[2] = row.invoiceNumber ?? exp.invoiceNumber ?? '';
  values[3] = row.invoiceDate ?? exp.invoiceDate ?? '';
  values[4] = row.amount ?? exp.amount?.value ?? '';
  values[5] = row.currency ?? exp.amount?.currency ?? '';
  values[6] = row.txCharges ?? (txVal > 0 ? txVal : '');
  values[7] = row.txChargesCurrency ?? exp.transactionCharges?.currency ?? exp.amount?.currency ?? '';
  values[8] = row.category ?? getCategoryById(exp.category)?.label ?? '';
  values[9] = row.addedBy ?? getAddedByName(exp, group);
  values[10] = row.splitType ?? exp.settlements?.[0]?.splitType ?? 'equal';

  let col = FIXED_COLUMN_COUNT;
  for (const m of group.members) {
    const ma = memberAmounts[m.memberId] || { credit: 0, debit: 0 };
    values[col++] = ma.credit || '';
    values[col++] = ma.debit || '';
  }
  return values;
}

/* ─── Import ─── */

export async function parseAndImportExpenses(file, group) {
  const ext = (file.name || '').split('.').pop().toLowerCase();
  let rows;
  let headerRowIndex = 1;

  if (ext === 'csv') {
    const text = await file.text();
    rows = parseCsv(text);
    headerRowIndex = detectHeaderRow(rows);
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.getWorksheet(SHEET_EXPENSES) || wb.worksheets[0];
    if (!ws) throw new Error('No worksheet found in file.');
    rows = [];
    ws.eachRow((row, rowNumber) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        vals[colNumber - 1] = cell.value;
      });
      rows.push(vals);
    });
    headerRowIndex = detectHeaderRow(rows);
  }

  if (!rows.length) throw new Error('File is empty.');

  const headerRow = rows[headerRowIndex];
  const headers = headerRow.map(h => cellToString(h).trim());
  const colMap = mapColumns(headers, group);

  const results = { imported: 0, skipped: 0, errors: [] };
  const currentUser = User.get();

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue;

    const rowNum = i + 1;
    const parsed = parseDataRow(row, colMap, group, rowNum);
    if (parsed.skip) {
      results.skipped++;
      continue;
    }
    if (parsed.error) {
      results.errors.push({ row: rowNum, message: parsed.error });
      continue;
    }

    try {
      const addedByMember = resolveMemberByName(parsed.data.addedByName, group);
      Expenses.create({
        groupId: group.groupId,
        particulars: parsed.data.particulars,
        category: parsed.data.category,
        invoiceNumber: parsed.data.invoiceNumber,
        invoiceDate: parsed.data.invoiceDate,
        amount: { value: parsed.data.amount, currency: parsed.data.currency },
        transactionCharges: {
          value: parsed.data.txCharges,
          currency: parsed.data.txChargesCurrency,
        },
        payments: parsed.data.payments,
        settlements: parsed.data.settlements,
        addedByMemberId: addedByMember?.memberId || currentUser?.userId,
        createdBy: currentUser?.userId || addedByMember?.memberId || null,
      });
      results.imported++;
    } catch (e) {
      results.errors.push({ row: rowNum, message: e.message || 'Failed to save expense' });
    }
  }

  return results;
}

function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const line = rows[i].map(c => cellToString(c).toLowerCase()).join(' ');
    if (line.includes('particulars') && (line.includes('amount') || line.includes('currency'))) {
      return i;
    }
  }
  return 0;
}

function mapColumns(headers, group) {
  const map = { members: {} };
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');

  headers.forEach((h, idx) => {
    const n = norm(h);
    if (n.includes('s. no') || n === 's no' || n === 'sno') map.sno = idx;
    else if (n.includes('particular')) map.particulars = idx;
    else if (n.includes('invoice') && n.includes('number')) map.invoiceNumber = idx;
    else if (n.includes('invoice') && n.includes('date')) map.invoiceDate = idx;
    else if (n.includes('transaction') && n.includes('charge') && n.includes('currency')) {
      map.txChargesCurrency = idx;
    } else if (n.includes('transaction') && n.includes('charge')) {
      map.txCharges = idx;
    } else if (n === 'amount' || (n.includes('amount') && !n.includes('charge'))) {
      map.amount = idx;
    } else if (n === 'currency' || (n.includes('currency') && !n.includes('transaction'))) {
      map.currency = idx;
    } else if (n.includes('category')) map.category = idx;
    else if (n.includes('added') || n.includes('who added')) map.addedBy = idx;
    else if (n.includes('split')) map.splitType = idx;
    else {
      const mc = parseMemberColumnHeader(h, group.members);
      if (mc) {
        if (!map.members[mc.memberId]) map.members[mc.memberId] = {};
        map.members[mc.memberId][mc.field] = idx;
      }
    }
  });
  return map;
}

function parseDataRow(row, colMap, group, rowNum) {
  const get = (key) => {
    const idx = colMap[key];
    if (idx == null) return '';
    return row[idx];
  };

  const particulars = cellToString(get('particulars')).trim();
  if (!particulars || particulars.toLowerCase().includes('delete this row')) {
    return { skip: true };
  }

  const amount = cellToNumber(get('amount'));
  if (amount <= 0) return { error: 'Amount must be a positive number.' };

  const currency = cellToString(get('currency')).trim().toUpperCase();
  if (!CURRENCIES[currency]) return { error: `Invalid currency code: ${currency || '(empty)'}` };

  const category = resolveCategory(get('category')) || 'other';

  const invoiceDate = parseDateCell(get('invoiceDate'));
  if (!invoiceDate) return { error: 'Invalid or missing invoice date.' };

  const splitType = cellToString(get('splitType')).trim().toLowerCase() || 'equal';
  if (!SPLIT_TYPES.includes(splitType)) {
    return { error: `Split type must be: ${SPLIT_TYPES.join(', ')}` };
  }

  const addedByName = cellToString(get('addedBy')).trim();
  if (addedByName && !resolveMemberByName(addedByName, group)) {
    return { error: `Unknown member for "Person who added": ${addedByName}` };
  }

  const decimals = getCurrency(currency).decimals;
  const payments = [];
  let totalPaid = 0;

  for (const m of group.members) {
    const cols = colMap.members[m.memberId] || {};
    const paid = cols.paid != null ? cellToNumber(row[cols.paid]) : 0;
    if (paid > 0) {
      payments.push({
        memberId: m.memberId,
        amount: { value: round(paid, decimals), currency },
        method: 'Other',
        proportion: 0,
      });
      totalPaid += paid;
    }
  }

  if (payments.length === 0) {
    return { error: 'At least one member must have a Credit (paid) amount.' };
  }

  const txCharges = cellToNumber(get('txCharges'));
  if (txCharges < 0) return { error: 'Transaction charges cannot be negative.' };
  let txChargesCurrency = cellToString(get('txChargesCurrency')).trim().toUpperCase();
  if (txCharges > 0 && !txChargesCurrency) txChargesCurrency = currency;
  if (txChargesCurrency && !CURRENCIES[txChargesCurrency]) {
    return { error: `Invalid transaction charges currency: ${txChargesCurrency}` };
  }
  if (!txChargesCurrency) txChargesCurrency = currency;

  const shareMembers = [];
  for (const m of group.members) {
    const cols = colMap.members[m.memberId] || {};
    const shareVal = cols.share != null ? row[cols.share] : '';
    const hasShare = shareVal !== '' && shareVal != null && cellToNumber(shareVal) > 0;
    const hasPaid = payments.some(p => p.memberId === m.memberId);
    if (splitType === 'equal') {
      if (hasPaid || hasShare) shareMembers.push({ memberId: m.memberId, name: m.name, value: '' });
    } else if (hasShare || cols.share != null) {
      shareMembers.push({
        memberId: m.memberId,
        name: m.name,
        value: cellToString(shareVal),
        included: hasShare || cellToString(shareVal) !== '',
      });
    }
  }

  let included = shareMembers;
  if (splitType === 'equal') {
    included = group.members.map(m => ({ memberId: m.memberId, name: m.name, value: '' }));
  } else if (included.length === 0) {
    included = group.members
      .filter(m => {
        const cols = colMap.members[m.memberId] || {};
        return cols.share != null;
      })
      .map(m => {
        const cols = colMap.members[m.memberId] || {};
        return { memberId: m.memberId, name: m.name, value: cellToString(row[cols.share]) };
      })
      .filter(m => m.value !== '');
  }

  if (included.length === 0) {
    return { error: 'No members included in settlement (check Debit/share columns).' };
  }

  const validation = Expenses.validateSplit(
    splitType,
    included.map(m => ({ memberId: m.memberId, name: m.name, value: m.value })),
    amount,
    decimals
  );
  if (!validation.valid) return { error: validation.message };

  const splits = Expenses.calculateSplit(
    amount,
    splitType,
    included.map(m => ({ memberId: m.memberId, name: m.name, value: m.value })),
    decimals
  );

  const settlements = splits.map(s => ({
    memberId: s.memberId,
    name: s.name,
    splitType,
    percentage: s.percentage,
    calculatedAmount: { value: s.amount, currency },
  }));

  const totalSettled = settlements.reduce((sum, s) => sum + parseNum(s.calculatedAmount?.value), 0);
  const balanceErr = validateInvoicePaidSettled(amount, totalPaid, totalSettled, decimals);
  if (balanceErr) return { error: balanceErr };

  let totalDebitEntered = 0;
  for (const m of group.members) {
    const cols = colMap.members[m.memberId] || {};
    if (cols.share != null && splitType !== 'equal') {
      totalDebitEntered += cellToNumber(row[cols.share]);
    }
  }
  if (splitType !== 'equal' && totalDebitEntered > 0) {
    const debitErr = validateInvoicePaidSettled(amount, totalDebitEntered, totalSettled, decimals);
    if (debitErr && Math.abs(totalDebitEntered - amount) > Math.pow(10, -decimals + 1)) {
      return { error: `Debit (share) columns sum (${round(totalDebitEntered, decimals)}) must equal invoice amount (${amount}).` };
    }
  }

  let proportionSum = 0;
  payments.forEach((p, i) => {
    p.proportion = round((p.amount.value / amount) * 100, 2);
    proportionSum += p.proportion;
  });
  if (payments.length && Math.abs(proportionSum - 100) > 0.1) {
    payments[0].proportion = round(payments[0].proportion + (100 - proportionSum), 2);
  }

  return {
    data: {
      particulars,
      invoiceNumber: cellToString(get('invoiceNumber')).trim(),
      invoiceDate,
      amount,
      currency,
      category,
      addedByName,
      txCharges: round(txCharges, decimals),
      txChargesCurrency,
      payments,
      settlements,
    },
  };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  });
}

/* ─── Export Excel ─── */

export async function exportExpensesExcel(group, expenses) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DutchIT';
  const ws = wb.addWorksheet('Expense Summary');
  const headers = buildExportHeaders(group);

  ws.mergeCells(1, 1, 1, headers.length);
  ws.getCell(1, 1).value = `${group.name} — Expense Summary — ${new Date().toLocaleDateString('en-GB')}`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  const headerRow = ws.getRow(2);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  const columnTotals = {};
  group.members.forEach(m => {
    columnTotals[m.memberId] = { credit: 0, debit: 0 };
  });

  const sorted = [...expenses].sort(
    (a, b) => new Date(a.invoiceDate || a.createdAt) - new Date(b.invoiceDate || b.createdAt)
  );

  sorted.forEach((exp, idx) => {
    const memberAmounts = getExpenseMemberAmounts(exp, group);
    for (const m of group.members) {
      columnTotals[m.memberId].credit += memberAmounts[m.memberId].credit;
      columnTotals[m.memberId].debit += memberAmounts[m.memberId].debit;
    }
    const row = ws.getRow(idx + 3);
    row.values = buildDataRowValues(idx + 1, {}, group, memberAmounts, exp);
  });

  const totalRowNum = sorted.length + 3;
  const totalRow = ws.getRow(totalRowNum);
  const totalValues = new Array(headers.length).fill('');
  totalValues[1] = 'TOTAL (sum of rows — mixed currencies if applicable)';
  let col = FIXED_COLUMN_COUNT;
  for (const m of group.members) {
    const t = columnTotals[m.memberId];
    totalValues[col++] = round(t.credit, 2);
    totalValues[col++] = round(t.debit, 2);
  }
  totalRow.values = totalValues;
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const balances = Expenses.calculateBalances(group.groupId);
  const baseCurrency = group.baseCurrency || 'USD';
  const balStart = totalRowNum + 2;
  ws.getCell(balStart, 1).value = `Overall net balances (${baseCurrency})`;
  ws.getCell(balStart, 1).font = { bold: true, size: 12 };

  group.members.forEach((m, i) => {
    const b = balances[m.memberId] || { net: 0, paid: 0, owed: 0 };
    const r = ws.getRow(balStart + 1 + i);
    r.getCell(1).value = m.name;
    r.getCell(2).value = `Paid for others: ${round(b.paid, 2)} | Owed: ${round(b.owed, 2)} | Net: ${round(b.net, 2)}`;
  });

  const settlements = Expenses.generateSettlements(group.groupId, group);
  if (settlements.length) {
    const sStart = balStart + group.members.length + 3;
    ws.getCell(sStart, 1).value = 'Suggested payments';
    ws.getCell(sStart, 1).font = { bold: true, size: 12 };
    settlements.forEach((s, i) => {
      const r = ws.getRow(sStart + 1 + i);
      r.getCell(1).value = s.fromName;
      r.getCell(2).value = 'owes';
      r.getCell(3).value = s.toName;
      r.getCell(4).value = s.amount;
      r.getCell(5).value = s.currency;
    });
  }

  headers.forEach((_, i) => { ws.getColumn(i + 1).width = i < FIXED_COLUMN_COUNT ? 20 : 12; });
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    buf,
    `${safeFilename(group.name)}_expense_summary.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

/* ─── Export PDF ─── */

export async function exportExpensesPdf(group, expenses) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const headers = buildExportHeaders(group);
  const body = [];
  const columnTotals = {};
  group.members.forEach(m => {
    columnTotals[m.memberId] = { credit: 0, debit: 0 };
  });

  const sorted = [...expenses].sort(
    (a, b) => new Date(a.invoiceDate || a.createdAt) - new Date(b.invoiceDate || b.createdAt)
  );

  sorted.forEach((exp, idx) => {
    const memberAmounts = getExpenseMemberAmounts(exp, group);
    for (const m of group.members) {
      columnTotals[m.memberId].credit += memberAmounts[m.memberId].credit;
      columnTotals[m.memberId].debit += memberAmounts[m.memberId].debit;
    }
    const vals = buildDataRowValues(idx + 1, {}, group, memberAmounts, exp);
    body.push(vals.map(v => (v === '' ? '—' : String(v))));
  });

  const totalVals = new Array(headers.length).fill('');
  totalVals[1] = 'TOTAL';
  let col = FIXED_COLUMN_COUNT;
  for (const m of group.members) {
    const t = columnTotals[m.memberId];
    totalVals[col++] = round(t.credit, 2);
    totalVals[col++] = round(t.debit, 2);
  }
  body.push(totalVals.map(String));

  doc.setFontSize(14);
  doc.text(`${group.name} — Expense Summary`, 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')} · ${sorted.length} expense(s)`, 14, 20);

  autoTable(doc, {
    head: [headers],
    body,
    startY: 24,
    styles: { fontSize: 6, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    margin: { left: 8, right: 8 },
    tableWidth: 'auto',
  });

  let finalY = doc.lastAutoTable.finalY + 10;
  const baseCurrency = group.baseCurrency || 'USD';
  doc.setFontSize(11);
  doc.text(`Overall net balances (${baseCurrency})`, 14, finalY);
  finalY += 6;
  doc.setFontSize(9);

  const balances = Expenses.calculateBalances(group.groupId);
  group.members.forEach(m => {
    const b = balances[m.memberId] || { net: 0 };
    doc.text(`${m.name}: net ${round(b.net, 2)} ${baseCurrency}`, 14, finalY);
    finalY += 5;
  });

  const settlements = Expenses.generateSettlements(group.groupId, group);
  if (settlements.length) {
    finalY += 4;
    doc.setFontSize(11);
    doc.text('Suggested payments', 14, finalY);
    finalY += 6;
    doc.setFontSize(9);
    settlements.forEach(s => {
      doc.text(`${s.fromName} owes ${s.toName} — ${s.amount} ${s.currency}`, 14, finalY);
      finalY += 5;
      if (finalY > 190) {
        doc.addPage();
        finalY = 14;
      }
    });
  }

  doc.save(`${safeFilename(group.name)}_expense_summary.pdf`);
}
