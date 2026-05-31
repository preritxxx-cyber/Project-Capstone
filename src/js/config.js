/**
 * DutchIT – runtime configuration (Vite env)
 */
export const DataMode = {
  LOCAL: 'local',
  CLOUD: 'cloud',
};

export const config = {
  dataMode: import.meta.env.VITE_DATA_MODE || DataMode.LOCAL,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};

export function isSupabaseConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

/** Cloud DB + auth when mode is cloud and env vars exist */
export function isCloudMode() {
  return config.dataMode === DataMode.CLOUD && isSupabaseConfigured();
}
