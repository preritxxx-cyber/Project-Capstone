/**
 * DutchIT – User Identity Management
 */
import { UserStore } from './store.js';
import { generateUserId, getAvatarColors, getInitials } from './utils.js';
import { isCloudMode } from './config.js';
import { Auth } from './auth.js';

let _currentUser = null;

export const User = {
  init() {
    _currentUser = UserStore.get();
    return _currentUser;
  },

  /** Load app user from Supabase session + profile (cloud mode) */
  async initFromAuth() {
    const session = Auth.getSession();
    if (!session?.user?.id) {
      _currentUser = null;
      return null;
    }
    try {
      const profile = await Auth.fetchProfile(session.user.id);
      _currentUser = {
        userId: session.user.id,
        displayName: profile.display_name,
        email: session.user.email,
        createdAt: profile.created_at,
        authId: session.user.id,
      };
      UserStore.set(_currentUser);
      return _currentUser;
    } catch {
      _currentUser = {
        userId: session.user.id,
        displayName: session.user.email?.split('@')[0] || 'Traveler',
        email: session.user.email,
        createdAt: new Date().toISOString(),
        authId: session.user.id,
      };
      UserStore.set(_currentUser);
      return _currentUser;
    }
  },

  get() { return _currentUser; },

  isSetup() { return !!_currentUser; },

  /** Local-only profile (VITE_DATA_MODE=local) */
  create(displayName) {
    const userId = generateUserId();
    const user = {
      userId,
      displayName: displayName.trim(),
      createdAt: new Date().toISOString(),
    };
    UserStore.set(user);
    _currentUser = user;
    return user;
  },

  /** Cloud sign-up: email + password + display name */
  async createWithAuth(displayName, email, password) {
    await Auth.signUp(email, password, displayName);
    return this.initFromAuth();
  },

  async signIn(email, password) {
    await Auth.signIn(email, password);
    return this.initFromAuth();
  },

  updateName(newName) {
    if (!_currentUser) return null;
    _currentUser = { ..._currentUser, displayName: newName.trim() };
    UserStore.set(_currentUser);
    if (isCloudMode() && Auth.isSignedIn()) {
      Auth.updateDisplayName(newName).catch(console.error);
    }
    return _currentUser;
  },

  async signOut() {
    if (isCloudMode()) await Auth.signOut();
    _currentUser = null;
    UserStore.clear();
  },

  getAvatarStyle(name) {
    const [bg, fg] = getAvatarColors(name || '');
    return `background: linear-gradient(135deg, ${bg}, ${fg});`;
  },

  renderAvatar(member, size = '') {
    const name = member?.name || '?';
    const initials = getInitials(name);
    const style = this.getAvatarStyle(name);
    const sizeClass = size ? `size-${size}` : '';

    if (member?.picture && member.pictureType === 'upload') {
      return `<div class="member-avatar ${sizeClass}" style="${style}">
        <img src="${member.picture}" alt="${name}" />
      </div>`;
    }
    return `<div class="member-avatar ${sizeClass}" style="${style}">${initials}</div>`;
  },

  clear() {
    _currentUser = null;
    UserStore.clear();
  },
};
