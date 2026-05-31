/**
 * DutchIT – Data persistence facade (localStorage + optional Supabase)
 */
import { isCloudMode } from './config.js';
import {
  getGroupsCache,
  getExpensesCache,
  setGroupsCache,
  setExpensesCache,
  upsertGroupInCache,
  removeGroupFromCache,
  removeExpenseFromCache,
  removeExpensesForGroupFromCache,
  cloudCreateGroup,
  cloudUpdateGroup,
  cloudDeleteGroup,
  cloudAddMember,
  cloudRemoveMember,
  cloudAddConversionRate,
  cloudRemoveConversionRate,
  cloudCreateExpense,
  cloudUpdateExpense,
  cloudDeleteExpense,
  KEYS,
  loadUserLocal,
  saveUserLocal,
} from './dataLayer.js';
import { reportCloudError } from './cloudStatus.js';

function runCloud(promise, label) {
  if (!isCloudMode()) return;
  Promise.resolve(promise).catch(err => reportCloudError(label, err));
}

export const UserStore = {
  get() { return loadUserLocal(KEYS.USER); },
  set(user) { return saveUserLocal(KEYS.USER, user); },
  clear() { localStorage.removeItem(KEYS.USER); },
  exists() { return !!loadUserLocal(KEYS.USER); },
};

export const GroupStore = {
  getAll() {
    return getGroupsCache();
  },

  getById(groupId) {
    return getGroupsCache().find(g => g.groupId === groupId) || null;
  },

  create(groupData) {
    const groups = [...getGroupsCache(), groupData];
    setGroupsCache(groups);
    runCloud(cloudCreateGroup(groupData), 'createGroup');
    return groupData;
  },

  update(groupId, updates) {
    const groups = getGroupsCache();
    const idx = groups.findIndex(g => g.groupId === groupId);
    if (idx === -1) return null;
    const updated = { ...groups[idx], ...updates, updatedAt: new Date().toISOString() };
    groups[idx] = updated;
    setGroupsCache([...groups]);
    runCloud(cloudUpdateGroup(groupId, updates, updated), 'updateGroup');
    return updated;
  },

  delete(groupId) {
    removeGroupFromCache(groupId);
    ExpenseStore.deleteByGroup(groupId);
    runCloud(cloudDeleteGroup(groupId), 'deleteGroup');
  },

  userHasGroupNamed(userId, name) {
    return getGroupsCache().some(
      g => g.creatorId === userId &&
           g.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
  },

  addMember(groupId, member) {
    const group = this.getById(groupId);
    if (!group) return null;
    if (group.members.some(m => m.memberId === member.memberId)) return group;
    const updated = {
      ...group,
      members: [...group.members, member],
      updatedAt: new Date().toISOString(),
    };
    upsertGroupInCache(updated);
    runCloud(cloudAddMember(groupId, member), 'addMember');
    return updated;
  },

  removeMember(groupId, memberId) {
    const group = this.getById(groupId);
    if (!group) return null;
    const updated = {
      ...group,
      members: group.members.filter(m => m.memberId !== memberId),
      updatedAt: new Date().toISOString(),
    };
    upsertGroupInCache(updated);
    runCloud(cloudRemoveMember(groupId, memberId), 'removeMember');
    return updated;
  },

  addConversionRate(groupId, rate) {
    const group = this.getById(groupId);
    if (!group) return null;
    const updated = {
      ...group,
      conversionRates: [...(group.conversionRates || []), rate],
      updatedAt: new Date().toISOString(),
    };
    upsertGroupInCache(updated);
    runCloud(cloudAddConversionRate(groupId, rate), 'addConversionRate');
    return updated;
  },

  removeConversionRate(groupId, rateId) {
    const group = this.getById(groupId);
    if (!group) return null;
    const updated = {
      ...group,
      conversionRates: (group.conversionRates || []).filter(r => r.rateId !== rateId),
      updatedAt: new Date().toISOString(),
    };
    upsertGroupInCache(updated);
    runCloud(cloudRemoveConversionRate(groupId, rateId), 'removeConversionRate');
    return updated;
  },

  getForUser(userId) {
    return getGroupsCache().filter(g =>
      g.members.some(m => m.memberId === userId)
    );
  },

  /** Replace group in cache after cloud fetch (join flow) */
  mergeGroup(group) {
    upsertGroupInCache(group);
    return group;
  },
};

export const ExpenseStore = {
  getAll() {
    return getExpensesCache();
  },

  getByGroup(groupId) {
    return getExpensesCache()
      .filter(e => e.groupId === groupId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getById(expenseId) {
    return getExpensesCache().find(e => e.expenseId === expenseId) || null;
  },

  create(expenseData) {
    const expenses = [...getExpensesCache(), expenseData];
    setExpensesCache(expenses);
    runCloud(cloudCreateExpense(expenseData), 'createExpense');
    return expenseData;
  },

  update(expenseId, updates) {
    const expenses = getExpensesCache();
    const idx = expenses.findIndex(e => e.expenseId === expenseId);
    if (idx === -1) return null;
    const snapshot = { ...expenses[idx] };
    expenses[idx] = {
      ...expenses[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
      editHistory: [
        ...(expenses[idx].editHistory || []),
        { at: new Date().toISOString(), snapshot: expenses[idx] },
      ],
    };
    setExpensesCache([...expenses]);
    runCloud(cloudUpdateExpense(expenseId, updates, snapshot), 'updateExpense');
    return expenses[idx];
  },

  delete(expenseId) {
    removeExpenseFromCache(expenseId);
    runCloud(cloudDeleteExpense(expenseId), 'deleteExpense');
  },

  deleteByGroup(groupId) {
    removeExpensesForGroupFromCache(groupId);
    runCloud(
      import('./dataLayer.js').then(m => m.cloudDeleteExpensesByGroup(groupId)),
      'deleteExpensesByGroup'
    );
  },

  countByGroup(groupId) {
    return getExpensesCache().filter(e => e.groupId === groupId).length;
  },
};
