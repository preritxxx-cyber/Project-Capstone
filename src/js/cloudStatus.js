/**
 * DutchIT – Cloud sync diagnostics & user-visible errors
 */
import { isCloudMode, config } from './config.js';
import { Auth } from './auth.js';

let _onError = null;

export function setCloudErrorHandler(fn) {
  _onError = fn;
}

export function getCloudStatus() {
  return {
    mode: config.dataMode,
    cloudActive: isCloudMode(),
    signedIn: Auth.isSignedIn(),
    userId: Auth.getSession()?.user?.id ?? null,
  };
}

export function logCloudStatus() {
  const s = getCloudStatus();
  console.info('[DutchIT]', {
    dataMode: s.mode,
    cloudSync: s.cloudActive ? 'ON' : 'OFF',
    auth: s.signedIn ? `signed in (${s.userId})` : 'NOT signed in',
  });
  if (config.dataMode === 'cloud' && !s.cloudActive) {
    console.warn('[DutchIT] VITE_DATA_MODE=cloud but Supabase URL/key missing. Restart npm run dev after editing .env.local');
  }
  if (s.cloudActive && !s.signedIn) {
    console.warn('[DutchIT] Cloud mode requires sign-in. Data will NOT reach Supabase until you sign in.');
  }
}

export function reportCloudError(label, err) {
  const msg = err?.message || err?.details || String(err);
  console.error(`[DutchIT] Cloud sync failed (${label}):`, err);
  if (typeof _onError === 'function') {
    _onError(`Could not save to cloud (${label}): ${msg}`);
  }
}

export function assertCloudAuth() {
  if (!isCloudMode()) return;
  if (!Auth.isSignedIn()) {
    throw new Error('Not signed in to Supabase. Sign out and sign in again.');
  }
}
