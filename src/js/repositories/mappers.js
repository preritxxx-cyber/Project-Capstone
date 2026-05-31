/**
 * DutchIT – Map Supabase rows ↔ existing app JSON shapes (UI unchanged)
 */

export function toAppMember(row) {
  return {
    memberId: row.legacy_member_id,
    name: row.display_name,
    isCreator: row.is_creator,
    isDummy: row.is_guest,
    joinedAt: row.joined_at,
    _dbId: row.id,
  };
}

export function toAppConversionRate(row, addedByLegacyId) {
  return {
    rateId: row.legacy_rate_id,
    from: row.from_currency,
    fromAmount: Number(row.from_amount),
    to: row.to_currency,
    toAmount: Number(row.to_amount),
    addedBy: addedByLegacyId,
    createdAt: row.created_at,
    _dbId: row.id,
  };
}

export function toAppGroup(row, members = [], conversionRates = [], creatorLegacyId) {
  return {
    groupId: row.join_code,
    name: row.name,
    picture: row.picture,
    pictureType: row.picture_type,
    baseCurrency: row.base_currency,
    intermediateCurrency: row.intermediate_currency,
    creatorId: creatorLegacyId ?? row.creator_id,
    members,
    conversionRates,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _dbId: row.id,
  };
}

export function toAppPayment(row, legacyMemberId) {
  return {
    memberId: legacyMemberId,
    amount: { value: Number(row.amount_value), currency: row.amount_currency },
    method: row.method,
    proportion: Number(row.proportion),
    _dbId: row.id,
  };
}

export function toAppSettlement(row, legacyMemberId, splitType) {
  return {
    memberId: legacyMemberId,
    name: row.display_name ?? '',
    splitType,
    percentage: row.percentage != null ? Number(row.percentage) : undefined,
    calculatedAmount: {
      value: Number(row.calculated_amount_value),
      currency: row.calculated_amount_currency,
    },
    _dbId: row.id,
  };
}

export function toAppExpense(row, payments = [], settlements = [], editHistory = [], joinCode) {
  return {
    expenseId: row.legacy_expense_id,
    groupId: joinCode ?? row.group_id,
    particulars: row.particulars,
    category: row.category,
    invoiceNumber: row.invoice_number ?? '',
    invoiceDate: row.invoice_date,
    amount: { value: Number(row.amount_value), currency: row.amount_currency },
    transactionCharges: {
      value: Number(row.transaction_charges_value),
      currency: row.transaction_charges_currency,
    },
    payments,
    settlements,
    createdBy: row.created_by_legacy_id ?? row.created_by_id,
    addedByMemberId: row.added_by_legacy_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editHistory,
    _dbId: row.id,
    _splitType: row.split_type,
  };
}

/** Build legacy_member_id → group_members.id map */
export function memberIdMap(members) {
  const map = new Map();
  for (const m of members) {
    map.set(m.memberId, m._dbId);
  }
  return map;
}
