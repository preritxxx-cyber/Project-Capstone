/**
 * DutchIT – In-memory cache + localStorage / Supabase persistence
 */
import { isCloudMode } from './config.js';
import { assertCloudAuth, reportCloudError } from './cloudStatus.js';
import * as cloud from './repositories/supabaseSync.js';

const KEYS = {
  USER: 'dutchit_user',
  GROUPS: 'dutchit_groups',
  EXPENSES: 'dutchit_expenses',
};

let _groups = null;
let _expenses = null;
let _ready = false;

function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocal(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('DutchIT storage error:', e);
    return false;
  }
}

function ensureLoaded() {
  if (isCloudMode()) {
    if (_groups === null) _groups = [];
    if (_expenses === null) _expenses = [];
    return;
  }
  if (_groups === null) _groups = loadLocal(KEYS.GROUPS) || [];
  if (_expenses === null) _expenses = loadLocal(KEYS.EXPENSES) || [];
}

export function isDataReady() {
  return _ready;
}

export function getGroupsCache() {
  ensureLoaded();
  return _groups;
}

export function getExpensesCache() {
  ensureLoaded();
  return _expenses;
}

export function setGroupsCache(groups) {
  _groups = groups;
  if (!isCloudMode()) saveLocal(KEYS.GROUPS, groups);
}

export function setExpensesCache(expenses) {
  _expenses = expenses;
  if (!isCloudMode()) saveLocal(KEYS.EXPENSES, expenses);
}

export function upsertGroupInCache(group) {
  ensureLoaded();
  const idx = _groups.findIndex(g => g.groupId === group.groupId);
  if (idx === -1) _groups.push(group);
  else _groups[idx] = group;
  setGroupsCache([..._groups]);
}

export function removeGroupFromCache(groupId) {
  ensureLoaded();
  _groups = _groups.filter(g => g.groupId !== groupId);
  setGroupsCache(_groups);
}

export function upsertExpenseInCache(expense) {
  ensureLoaded();
  const idx = _expenses.findIndex(e => e.expenseId === expense.expenseId);
  if (idx === -1) _expenses.push(expense);
  else _expenses[idx] = expense;
  setExpensesCache([..._expenses]);
}

export function removeExpenseFromCache(expenseId) {
  ensureLoaded();
  _expenses = _expenses.filter(e => e.expenseId !== expenseId);
  setExpensesCache(_expenses);
}

export function removeExpensesForGroupFromCache(groupId) {
  ensureLoaded();
  _expenses = _expenses.filter(e => e.groupId !== groupId);
  setExpensesCache(_expenses);
}

/** Hydrate cache from Supabase or localStorage on app start */
export async function initDataLayer() {
  if (isCloudMode()) {
    assertCloudAuth();
    const { groups, expenses } = await cloud.fetchAllForCurrentUser();
    _groups = groups;
    _expenses = expenses;
  } else {
    ensureLoaded();
  }
  _ready = true;
}

/** Reload all cloud data (after join, etc.) */
export async function refreshFromCloud() {
  if (!isCloudMode()) return;
  const { groups, expenses } = await cloud.fetchAllForCurrentUser();
  _groups = groups;
  _expenses = expenses;
}

/** Fetch one trip into cache if missing (cloud join / deep link) */
export async function ensureGroupLoaded(groupId) {
  ensureLoaded();
  if (_groups.some(g => g.groupId === groupId)) return _groups.find(g => g.groupId === groupId);

  if (!isCloudMode()) return null;

  const group = await cloud.fetchGroupByJoinCode(groupId);
  if (!group) return null;

  upsertGroupInCache(group);
  const ex = await cloud.fetchAllForCurrentUser();
  const groupExpenses = ex.expenses.filter(e => e.groupId === groupId);
  for (const e of groupExpenses) upsertExpenseInCache(e);

  return group;
}

export async function cloudCreateGroup(group) {
  assertCloudAuth();
  const saved = await cloud.createGroupInCloud(group);
  upsertGroupInCache(saved);
  return saved;
}

export async function cloudUpdateGroup(groupId, updates, fullGroup) {
  const saved = await cloud.updateGroupInCloud(groupId, updates, fullGroup);
  upsertGroupInCache(saved);
  return saved;
}

export async function cloudDeleteGroup(groupId) {
  await cloud.deleteGroupInCloud(groupId);
  removeGroupFromCache(groupId);
  removeExpensesForGroupFromCache(groupId);
}

export async function cloudAddMember(groupId, member) {
  const saved = await cloud.addMemberInCloud(groupId, member);
  upsertGroupInCache(saved);
  return saved;
}

export async function cloudRemoveMember(groupId, memberId) {
  const saved = await cloud.removeMemberInCloud(groupId, memberId);
  if (saved) upsertGroupInCache(saved);
  return saved;
}

export async function cloudAddConversionRate(groupId, rate) {
  const saved = await cloud.addConversionRateInCloud(groupId, rate);
  upsertGroupInCache(saved);
  return saved;
}

export async function cloudRemoveConversionRate(groupId, rateId) {
  const saved = await cloud.removeConversionRateInCloud(groupId, rateId);
  upsertGroupInCache(saved);
  return saved;
}

export async function cloudCreateExpense(expense) {
  assertCloudAuth();
  const saved = await cloud.createExpenseInCloud(expense);
  if (saved) upsertExpenseInCache(saved);
  return saved ?? expense;
}

export async function cloudUpdateExpense(expenseId, updates, snapshot) {
  const saved = await cloud.updateExpenseInCloud(expenseId, updates, snapshot);
  if (saved) upsertExpenseInCache(saved);
  return saved;
}

export async function cloudDeleteExpense(expenseId) {
  await cloud.deleteExpenseInCloud(expenseId);
  removeExpenseFromCache(expenseId);
}

export async function cloudDeleteExpensesByGroup(groupId) {
  await cloud.deleteExpensesByGroupInCloud(groupId);
  removeExpensesForGroupFromCache(groupId);
}

export async function cloudJoinGroup(groupId, member) {
  const result = await cloud.joinGroupInCloud(groupId, member);
  upsertGroupInCache(result.group);
  await refreshFromCloud();
  return result;
}

export { cloud, KEYS, loadLocal as loadUserLocal, saveLocal as saveUserLocal };
