/**
 * DutchIT – Supabase Auth helpers
 */
import { getSupabase } from './supabaseClient.js';
import { isCloudMode } from './config.js';

let _session = null;

export const Auth = {
  getSession() {
    return _session;
  },

  isSignedIn() {
    return Boolean(_session?.user?.id);
  },

  /** Restore session on app load */
  async init() {
    if (!isCloudMode()) return null;
    const sb = getSupabase();
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) throw error;
    _session = session;
    sb.auth.onAuthStateChange((_event, session) => {
      _session = session;
    });
    return session;
  },

  async signUp(email, password, displayName) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw error;

    if (!data.session) {
      throw new Error(
        'Account created but no session. In Supabase Dashboard → Authentication → Email, turn OFF "Confirm email" for development, then try again.'
      );
    }

    _session = data.session;

    if (data.user?.id) {
      await this.ensureProfile(data.user.id, displayName.trim());
    }
    return data;
  },

  async signIn(email, password) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    _session = data.session;
    if (data.user?.id) {
      const name = data.user.user_metadata?.display_name || email.split('@')[0];
      await this.ensureProfile(data.user.id, name);
    }
    return data;
  },

  /** Create profile row if trigger did not run (required for groups.creator_id FK) */
  async ensureProfile(userId, displayName) {
    const sb = getSupabase();
    const { data: existing } = await sb.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (existing) {
      await sb.from('profiles').update({ display_name: displayName }).eq('id', userId);
      return;
    }
    const { error } = await sb.from('profiles').insert({
      id: userId,
      display_name: displayName,
      legacy_user_id: userId,
    });
    if (error) throw error;
  },

  async signOut() {
    if (!isCloudMode()) return;
    const sb = getSupabase();
    await sb.auth.signOut();
    _session = null;
  },

  async fetchProfile(userId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  },

  async updateDisplayName(displayName) {
    const uid = _session?.user?.id;
    if (!uid) throw new Error('Not signed in');
    const sb = getSupabase();
    const { error } = await sb.from('profiles').update({ display_name: displayName.trim() }).eq('id', uid);
    if (error) throw error;
  },
};
