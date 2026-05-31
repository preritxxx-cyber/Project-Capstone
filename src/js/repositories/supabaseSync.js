/**
 * DutchIT – Supabase read/write (normalized tables → app models)
 */
import { getSupabase } from '../supabaseClient.js';
import { Auth } from '../auth.js';
import {
  toAppGroup,
  toAppMember,
  toAppConversionRate,
  toAppExpense,
  toAppPayment,
  toAppSettlement,
  memberIdMap,
} from './mappers.js';

function sb() {
  return getSupabase();
}

function uid() {
  const id = Auth.getSession()?.user?.id;
  if (!id) throw new Error('You must be signed in.');
  return id;
}

async function fetchMembersForGroup(groupDbId) {
  const { data, error } = await sb()
    .from('group_members')
    .select('*')
    .eq('group_id', groupDbId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toAppMember);
}

async function fetchRatesForGroup(groupDbId, members) {
  const legacyByDbId = new Map(members.map(m => [m._dbId, m.memberId]));
  const { data, error } = await sb()
    .from('conversion_rates')
    .select('*')
    .eq('group_id', groupDbId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => toAppConversionRate(r, legacyByDbId.get(r.added_by_id) ?? ''));
}

async function fetchGroupRowByJoinCode(joinCode) {
  const { data, error } = await sb()
    .from('groups')
    .select('*')
    .eq('join_code', joinCode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function buildAppGroup(groupRow) {
  if (!groupRow) return null;
  const members = await fetchMembersForGroup(groupRow.id);
  const rates = await fetchRatesForGroup(groupRow.id, members);
  const creatorMember = members.find(m => m.isCreator);
  const creatorLegacy = creatorMember?.memberId ?? groupRow.creator_id;
  return toAppGroup(groupRow, members, rates, creatorLegacy);
}

async function fetchExpensesForGroupDbId(groupDbId, joinCode, members) {
  const legacyByDbId = new Map(members.map(m => [m._dbId, m.memberId]));
  const nameByLegacy = new Map(members.map(m => [m.memberId, m.name]));

  const { data: expenseRows, error } = await sb()
    .from('expenses')
    .select('*')
    .eq('group_id', groupDbId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!expenseRows?.length) return [];

  const expenseDbIds = expenseRows.map(e => e.id);
  const [{ data: payRows }, { data: settRows }, { data: histRows }] = await Promise.all([
    sb().from('expense_payments').select('*').in('expense_id', expenseDbIds),
    sb().from('expense_settlements').select('*').in('expense_id', expenseDbIds),
    sb().from('expense_edit_history').select('*').in('expense_id', expenseDbIds).order('edited_at', { ascending: true }),
  ]);

  const paysByExp = groupBy(payRows ?? [], 'expense_id');
  const settsByExp = groupBy(settRows ?? [], 'expense_id');
  const histByExp = groupBy(histRows ?? [], 'expense_id');

  return expenseRows.map(row => {
    const payments = (paysByExp[row.id] ?? []).map(p =>
      toAppPayment(p, legacyByDbId.get(p.member_id))
    );
    const settlements = (settsByExp[row.id] ?? []).map(s =>
      toAppSettlement(
        { ...s, display_name: nameByLegacy.get(legacyByDbId.get(s.member_id)) },
        legacyByDbId.get(s.member_id),
        row.split_type
      )
    );
    const editHistory = (histByExp[row.id] ?? []).map(h => ({
      at: h.edited_at,
      snapshot: h.snapshot,
    }));
    const addedByLegacy = row.added_by_member_id
      ? legacyByDbId.get(row.added_by_member_id)
      : null;
    return toAppExpense(
      { ...row, added_by_legacy_id: addedByLegacy, created_by_legacy_id: row.created_by_id },
      payments,
      settlements,
      editHistory,
      joinCode
    );
  });
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

export async function lookupGroupByJoinCode(joinCode) {
  const { data, error } = await sb().rpc('lookup_group_by_join_code', { p_join_code: joinCode });
  if (error) throw error;
  return data;
}

export async function fetchAllForCurrentUser() {
  const userId = uid();
  const { data: memberships, error: memErr } = await sb()
    .from('group_members')
    .select('group_id')
    .eq('profile_id', userId);
  if (memErr) throw memErr;

  const groupDbIds = [...new Set((memberships ?? []).map(m => m.group_id))];
  if (groupDbIds.length === 0) return { groups: [], expenses: [] };

  const { data: groupRows, error: gErr } = await sb()
    .from('groups')
    .select('*')
    .in('id', groupDbIds);
  if (gErr) throw gErr;

  const groups = [];
  const expenses = [];
  for (const row of groupRows ?? []) {
    const g = await buildAppGroup(row);
    if (g) {
      groups.push(g);
      const ex = await fetchExpensesForGroupDbId(row.id, row.join_code, g.members);
      expenses.push(...ex);
    }
  }
  return { groups, expenses };
}

export async function fetchGroupByJoinCode(joinCode) {
  const row = await fetchGroupRowByJoinCode(joinCode);
  return buildAppGroup(row);
}

export async function createGroupInCloud(group) {
  const userId = uid();
  // Do NOT use .select() here — SELECT RLS requires membership, which is added next
  const { error: gErr } = await sb()
    .from('groups')
    .insert({
      join_code: group.groupId,
      legacy_group_id: group.groupId,
      name: group.name,
      picture: group.picture,
      picture_type: group.pictureType || 'emoji',
      base_currency: group.baseCurrency,
      intermediate_currency: group.intermediateCurrency,
      creator_id: userId,
    });
  if (gErr) throw gErr;

  const { data: groupRow, error: fetchErr } = await sb()
    .from('groups')
    .select('id')
    .eq('join_code', group.groupId)
    .eq('creator_id', userId)
    .single();
  if (fetchErr || !groupRow) throw fetchErr || new Error('Group created but could not be loaded');

  const allMembers = (group.members ?? []).map(m => ({
    group_id: groupRow.id,
    profile_id: m.isDummy ? null : (m.memberId === userId ? userId : null),
    display_name: m.name,
    is_creator: Boolean(m.isCreator),
    is_guest: Boolean(m.isDummy),
    legacy_member_id: m.memberId,
    joined_at: m.joinedAt ?? new Date().toISOString(),
  }));

  const creatorRow = allMembers.find(m => m.is_creator) || allMembers[0];
  const otherRows = allMembers.filter(m => m !== creatorRow);

  if (creatorRow) {
    const { error: cErr } = await sb().from('group_members').insert(creatorRow);
    if (cErr) throw cErr;
  }
  if (otherRows.length) {
    const { error: oErr } = await sb().from('group_members').insert(otherRows);
    if (oErr) throw oErr;
  }

  return fetchGroupByJoinCode(group.groupId);
}

export async function updateGroupInCloud(groupId, updates, fullGroup) {
  const row = await fetchGroupRowByJoinCode(groupId);
  if (!row) throw new Error('Group not found in cloud');

  const patch = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.picture !== undefined) patch.picture = updates.picture;
  if (updates.pictureType !== undefined) patch.picture_type = updates.pictureType;
  if (updates.baseCurrency !== undefined) patch.base_currency = updates.baseCurrency;
  if (updates.intermediateCurrency !== undefined) patch.intermediate_currency = updates.intermediateCurrency;

  if (Object.keys(patch).length) {
    const { error } = await sb().from('groups').update(patch).eq('id', row.id);
    if (error) throw error;
  }

  if (updates.members !== undefined && fullGroup) {
    await syncMembersInCloud(row.id, fullGroup.members);
  }

  return fetchGroupByJoinCode(groupId);
}

async function syncMembersInCloud(groupDbId, members) {
  const { data: existing, error } = await sb()
    .from('group_members')
    .select('*')
    .eq('group_id', groupDbId);
  if (error) throw error;

  const existingByLegacy = new Map((existing ?? []).map(m => [m.legacy_member_id, m]));
  const incomingLegacy = new Set(members.map(m => m.memberId));

  for (const m of members) {
    const ex = existingByLegacy.get(m.memberId);
    if (ex) {
      if (ex.display_name !== m.name) {
        await sb().from('group_members').update({ display_name: m.name }).eq('id', ex.id);
      }
      continue;
    }
    await sb().from('group_members').insert({
      group_id: groupDbId,
      profile_id: m.isDummy ? null : (m.isCreator ? uid() : null),
      display_name: m.name,
      is_creator: Boolean(m.isCreator),
      is_guest: Boolean(m.isDummy),
      legacy_member_id: m.memberId,
      joined_at: m.joinedAt ?? new Date().toISOString(),
    });
  }

  for (const ex of existing ?? []) {
    if (ex.is_creator) continue;
    if (!incomingLegacy.has(ex.legacy_member_id)) {
      await sb().from('group_members').delete().eq('id', ex.id);
    }
  }
}

export async function deleteGroupInCloud(groupId) {
  const row = await fetchGroupRowByJoinCode(groupId);
  if (!row) return;
  const { error } = await sb().from('groups').delete().eq('id', row.id);
  if (error) throw error;
}

export async function addMemberInCloud(groupId, member) {
  const row = await fetchGroupRowByJoinCode(groupId);
  if (!row) throw new Error('Group not found');

  const userId = uid();
  const { error } = await sb().from('group_members').insert({
    group_id: row.id,
    profile_id: member.isDummy ? null : (member.memberId === userId ? userId : null),
    display_name: member.name,
    is_creator: false,
    is_guest: Boolean(member.isDummy),
    legacy_member_id: member.memberId,
    joined_at: member.joinedAt ?? new Date().toISOString(),
  });
  if (error) throw error;
  return fetchGroupByJoinCode(groupId);
}

export async function removeMemberInCloud(groupId, memberId) {
  const row = await fetchGroupRowByJoinCode(groupId);
  if (!row) return null;
  const { error } = await sb()
    .from('group_members')
    .delete()
    .eq('group_id', row.id)
    .eq('legacy_member_id', memberId);
  if (error) throw error;
  return fetchGroupByJoinCode(groupId);
}

export async function addConversionRateInCloud(groupId, rate) {
  const group = await fetchGroupByJoinCode(groupId);
  if (!group) throw new Error('Group not found');
  const map = memberIdMap(group.members);
  const addedByDb = map.get(rate.addedBy);
  if (!addedByDb) throw new Error('Member not found for conversion rate');

  const { error } = await sb().from('conversion_rates').insert({
    group_id: group._dbId,
    legacy_rate_id: rate.rateId,
    from_currency: rate.from,
    from_amount: rate.fromAmount,
    to_currency: rate.to,
    to_amount: rate.toAmount,
    added_by_id: addedByDb,
    created_at: rate.createdAt,
  });
  if (error) throw error;
  return fetchGroupByJoinCode(groupId);
}

export async function removeConversionRateInCloud(groupId, rateId) {
  const { error } = await sb().from('conversion_rates').delete().eq('legacy_rate_id', rateId);
  if (error) throw error;
  return fetchGroupByJoinCode(groupId);
}

export async function createExpenseInCloud(expense) {
  const group = await fetchGroupByJoinCode(expense.groupId);
  if (!group) throw new Error('Group not found');
  const map = memberIdMap(group.members);
  const splitType = expense.settlements?.[0]?.splitType ?? 'equal';

  const { data: expRow, error: eErr } = await sb()
    .from('expenses')
    .insert({
      group_id: group._dbId,
      legacy_expense_id: expense.expenseId,
      particulars: expense.particulars,
      category: expense.category,
      invoice_number: expense.invoiceNumber,
      invoice_date: expense.invoiceDate,
      amount_value: expense.amount.value,
      amount_currency: expense.amount.currency,
      transaction_charges_value: expense.transactionCharges?.value ?? 0,
      transaction_charges_currency: expense.transactionCharges?.currency ?? expense.amount.currency,
      split_type: splitType,
      created_by_id: uid(),
      added_by_member_id: expense.addedByMemberId
        ? map.get(expense.addedByMemberId)
        : map.get(expense.createdBy) ?? null,
    })
    .select('*')
    .single();
  if (eErr) throw eErr;

  await insertExpenseLines(expRow.id, expense, map);
  return fetchExpenseByLegacyId(expense.expenseId);
}

async function insertExpenseLines(expenseDbId, expense, memberMap) {
  const payments = (expense.payments ?? []).map(p => ({
    expense_id: expenseDbId,
    member_id: memberMap.get(p.memberId),
    amount_value: p.amount.value,
    amount_currency: p.amount.currency,
    method: p.method || 'Other',
    proportion: p.proportion ?? 0,
  })).filter(p => p.member_id);

  if (payments.length) {
    const { error } = await sb().from('expense_payments').insert(payments);
    if (error) throw error;
  }

  const settlements = (expense.settlements ?? []).map(s => ({
    expense_id: expenseDbId,
    member_id: memberMap.get(s.memberId),
    percentage: s.percentage ?? null,
    calculated_amount_value: s.calculatedAmount.value,
    calculated_amount_currency: s.calculatedAmount.currency,
  })).filter(s => s.member_id);

  if (settlements.length) {
    const { error } = await sb().from('expense_settlements').insert(settlements);
    if (error) throw error;
  }
}

async function fetchExpenseByLegacyId(legacyId) {
  const { data: row, error } = await sb()
    .from('expenses')
    .select('*, groups!inner(join_code)')
    .eq('legacy_expense_id', legacyId)
    .single();
  if (error) throw error;

  const groupRow = await fetchGroupRowByJoinCode(row.groups.join_code);
  const members = await fetchMembersForGroup(groupRow.id);
  const all = await fetchExpensesForGroupDbId(groupRow.id, row.groups.join_code, members);
  return all.find(e => e.expenseId === legacyId) ?? null;
}

export async function updateExpenseInCloud(expenseId, updates, previousSnapshot) {
  const { data: row, error: findErr } = await sb()
    .from('expenses')
    .select('*')
    .eq('legacy_expense_id', expenseId)
    .single();
  if (findErr) throw findErr;

  if (previousSnapshot) {
    await sb().from('expense_edit_history').insert({
      expense_id: row.id,
      edited_by_id: uid(),
      snapshot: previousSnapshot,
    });
  }

  const patch = {};
  if (updates.particulars !== undefined) patch.particulars = updates.particulars;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.invoiceNumber !== undefined) patch.invoice_number = updates.invoiceNumber;
  if (updates.invoiceDate !== undefined) patch.invoice_date = updates.invoiceDate;
  if (updates.amount !== undefined) {
    patch.amount_value = updates.amount.value;
    patch.amount_currency = updates.amount.currency;
  }
  if (updates.transactionCharges !== undefined) {
    patch.transaction_charges_value = updates.transactionCharges.value;
    patch.transaction_charges_currency = updates.transactionCharges.currency;
  }
  if (updates.settlements?.[0]?.splitType) patch.split_type = updates.settlements[0].splitType;

  if (Object.keys(patch).length) {
    const { error } = await sb().from('expenses').update(patch).eq('id', row.id);
    if (error) throw error;
  }

  if (updates.payments || updates.settlements) {
    const { data: gRow } = await sb().from('groups').select('join_code').eq('id', row.group_id).single();
    const group = await fetchGroupByJoinCode(gRow.join_code);
    const map = memberIdMap(group.members);
    await sb().from('expense_payments').delete().eq('expense_id', row.id);
    await sb().from('expense_settlements').delete().eq('expense_id', row.id);
    await insertExpenseLines(row.id, updates, map);
  }

  return fetchExpenseByLegacyId(expenseId);
}

export async function deleteExpenseInCloud(expenseId) {
  const { error } = await sb().from('expenses').delete().eq('legacy_expense_id', expenseId);
  if (error) throw error;
}

export async function deleteExpensesByGroupInCloud(groupId) {
  const row = await fetchGroupRowByJoinCode(groupId);
  if (!row) return;
  const { error } = await sb().from('expenses').delete().eq('group_id', row.id);
  if (error) throw error;
}

export async function joinGroupInCloud(groupId, member) {
  const exists = await lookupGroupByJoinCode(groupId);
  if (!exists) throw new Error('Group not found. Please check the group ID.');

  let group = await fetchGroupByJoinCode(groupId);
  if (group?.members.some(m => m.memberId === member.memberId)) {
    return { group, alreadyMember: true };
  }

  await addMemberInCloud(groupId, member);
  group = await fetchGroupByJoinCode(groupId);
  return { group, alreadyMember: false };
}
