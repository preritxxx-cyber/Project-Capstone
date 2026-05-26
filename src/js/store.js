/**
 * DutchIT – localStorage Store (Data Persistence Layer)
 */

const KEYS = {
  USER:     'dutchit_user',
  GROUPS:   'dutchit_groups',
  EXPENSES: 'dutchit_expenses',
};

/* ─── Helpers ─── */

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('DutchIT storage error:', e);
    return false;
  }
}

/* ─── User ─── */

export const UserStore = {
  get() { return load(KEYS.USER); },
  set(user) { return save(KEYS.USER, user); },
  clear() { localStorage.removeItem(KEYS.USER); },
  exists() { return !!load(KEYS.USER); },
};

/* ─── Groups ─── */

export const GroupStore = {
  /** Get all groups array */
  getAll() {
    return load(KEYS.GROUPS) || [];
  },

  /** Get single group by ID */
  getById(groupId) {
    const groups = this.getAll();
    return groups.find(g => g.groupId === groupId) || null;
  },

  /** Create a new group */
  create(groupData) {
    const groups = this.getAll();
    groups.push(groupData);
    save(KEYS.GROUPS, groups);
    return groupData;
  },

  /** Update a group */
  update(groupId, updates) {
    const groups = this.getAll();
    const idx = groups.findIndex(g => g.groupId === groupId);
    if (idx === -1) return null;
    groups[idx] = { ...groups[idx], ...updates, updatedAt: new Date().toISOString() };
    save(KEYS.GROUPS, groups);
    return groups[idx];
  },

  /** Delete a group and all its expenses */
  delete(groupId) {
    const groups = this.getAll().filter(g => g.groupId !== groupId);
    save(KEYS.GROUPS, groups);
    // Also delete expenses
    ExpenseStore.deleteByGroup(groupId);
  },

  /** Check if a user already has a group with this name */
  userHasGroupNamed(userId, name) {
    const groups = this.getAll();
    return groups.some(
      g => g.creatorId === userId &&
           g.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
  },

  /** Add a member to a group */
  addMember(groupId, member) {
    const group = this.getById(groupId);
    if (!group) return null;
    if (group.members.some(m => m.memberId === member.memberId)) return group;
    const members = [...group.members, member];
    return this.update(groupId, { members });
  },

  /** Remove a member from a group */
  removeMember(groupId, memberId) {
    const group = this.getById(groupId);
    if (!group) return null;
    const members = group.members.filter(m => m.memberId !== memberId);
    return this.update(groupId, { members });
  },

  /** Add a conversion rate to a group */
  addConversionRate(groupId, rate) {
    const group = this.getById(groupId);
    if (!group) return null;
    const conversionRates = group.conversionRates || [];
    conversionRates.push(rate);
    return this.update(groupId, { conversionRates });
  },

  /** Remove a conversion rate from a group */
  removeConversionRate(groupId, rateId) {
    const group = this.getById(groupId);
    if (!group) return null;
    const conversionRates = (group.conversionRates || []).filter(r => r.rateId !== rateId);
    return this.update(groupId, { conversionRates });
  },

  /** Get groups where userId is a member */
  getForUser(userId) {
    return this.getAll().filter(g =>
      g.members.some(m => m.memberId === userId)
    );
  },
};

/* ─── Expenses ─── */

export const ExpenseStore = {
  /** Get all expenses */
  getAll() {
    return load(KEYS.EXPENSES) || [];
  },

  /** Get expenses for a group */
  getByGroup(groupId) {
    return this.getAll()
      .filter(e => e.groupId === groupId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /** Get a single expense */
  getById(expenseId) {
    return this.getAll().find(e => e.expenseId === expenseId) || null;
  },

  /** Create expense */
  create(expenseData) {
    const expenses = this.getAll();
    expenses.push(expenseData);
    save(KEYS.EXPENSES, expenses);
    return expenseData;
  },

  /** Update expense */
  update(expenseId, updates) {
    const expenses = this.getAll();
    const idx = expenses.findIndex(e => e.expenseId === expenseId);
    if (idx === -1) return null;
    expenses[idx] = {
      ...expenses[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
      editHistory: [
        ...(expenses[idx].editHistory || []),
        { at: new Date().toISOString(), snapshot: expenses[idx] }
      ]
    };
    save(KEYS.EXPENSES, expenses);
    return expenses[idx];
  },

  /** Delete expense */
  delete(expenseId) {
    const expenses = this.getAll().filter(e => e.expenseId !== expenseId);
    save(KEYS.EXPENSES, expenses);
  },

  /** Delete all expenses for a group */
  deleteByGroup(groupId) {
    const expenses = this.getAll().filter(e => e.groupId !== groupId);
    save(KEYS.EXPENSES, expenses);
  },

  /** Get total expense count for a group */
  countByGroup(groupId) {
    return this.getAll().filter(e => e.groupId === groupId).length;
  },
};
