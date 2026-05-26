/**
 * DutchIT – FX Calculator (preset & trip-average rates, localStorage)
 */
import { getAverageRate, getConversionStats } from './expenses.js';
import { GroupStore } from './store.js';
import { round, parseNum } from './utils.js';

const STORAGE_KEY = 'dutchit_fx_calculator';

/** 1 local = rate foreign (e.g. 1 INR = 190 IDR) */
export const RATE_MODE_FOREIGN_PER_LOCAL = 'foreign_per_local';
/** 1 foreign = rate local */
export const RATE_MODE_LOCAL_PER_FOREIGN = 'local_per_foreign';

const DEFAULTS = {
  localCurrency: 'INR',
  foreignCurrency: 'IDR',
  presetRate: 190,
  rateMode: RATE_MODE_FOREIGN_PER_LOCAL,
  rateSource: 'preset',
  linkedGroupId: null,
  lastForeignInput: '',
  lastLocalInput: '',
  convertDirection: 'foreign_to_local',
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export const FxStore = {
  get() {
    return load();
  },

  update(partial) {
    const next = { ...load(), ...partial };
    save(next);
    return next;
  },

  reset() {
    save({ ...DEFAULTS });
    return { ...DEFAULTS };
  },
};

/**
 * Resolve effective rate for converting foreign → local.
 * @returns {{ rate: number, label: string, isDefault: boolean, source: string }}
 */
export function resolveFxRate(settings, groupId = null) {
  const { localCurrency, foreignCurrency, presetRate, rateMode, rateSource } = settings;

  if (rateSource === 'average' && groupId) {
    const group = GroupStore.getById(groupId);
    if (group) {
      const stats = getConversionStats(group, foreignCurrency, localCurrency);
      const { rate, isDefault } = getAverageRate(group, foreignCurrency, localCurrency);
      const effectiveRate = stats.tradeCount > 0 && stats.srcSum > 0
        ? stats.tgtSum / stats.srcSum
        : rate;
      return {
        rate: effectiveRate,
        label: stats.tradeCount > 0
          ? `Volume-weighted (${stats.tradeCount} trade${stats.tradeCount !== 1 ? 's' : ''})`
          : isDefault ? 'Default fallback rate' : 'Trip conversion path',
        isDefault,
        source: 'average',
        rateMode: RATE_MODE_LOCAL_PER_FOREIGN,
      };
    }
  }

  const r = parseNum(presetRate);
  return {
    rate: r > 0 ? r : 1,
    label: rateMode === RATE_MODE_FOREIGN_PER_LOCAL
      ? `1 ${localCurrency} = ${r} ${foreignCurrency}`
      : `1 ${foreignCurrency} = ${r} ${localCurrency}`,
    isDefault: false,
    source: 'preset',
    rateMode,
  };
}

/** Convert foreign amount → local using resolved rate settings */
export function foreignToLocal(foreignAmount, resolved) {
  const amt = parseNum(foreignAmount);
  if (amt <= 0 || resolved.rate <= 0) return 0;

  if (resolved.source === 'average' || resolved.rateMode === RATE_MODE_LOCAL_PER_FOREIGN) {
    return round(amt * resolved.rate, 4);
  }
  return round(amt / resolved.rate, 4);
}

/** Convert local amount → foreign */
export function localToForeign(localAmount, resolved) {
  const amt = parseNum(localAmount);
  if (amt <= 0 || resolved.rate <= 0) return 0;

  if (resolved.source === 'average' || resolved.rateMode === RATE_MODE_LOCAL_PER_FOREIGN) {
    return round(amt / resolved.rate, 4);
  }
  return round(amt * resolved.rate, 4);
}
