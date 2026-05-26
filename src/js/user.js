/**
 * DutchIT – User Identity Management
 */
import { UserStore } from './store.js';
import { generateUserId, getAvatarColors, getInitials } from './utils.js';

let _currentUser = null;

export const User = {
  /** Initialize user from storage */
  init() {
    _currentUser = UserStore.get();
    return _currentUser;
  },

  /** Get current user */
  get() { return _currentUser; },

  /** Check if user is set up */
  isSetup() { return !!_currentUser; },

  /** Create a new user profile */
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

  /** Update display name */
  updateName(newName) {
    if (!_currentUser) return null;
    _currentUser = { ..._currentUser, displayName: newName.trim() };
    UserStore.set(_currentUser);
    return _currentUser;
  },

  /** Get avatar style for a name */
  getAvatarStyle(name) {
    const [bg, fg] = getAvatarColors(name || '');
    return `background: linear-gradient(135deg, ${bg}, ${fg});`;
  },

  /** Render an avatar element for a member */
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

  /** Clear user (for testing/reset) */
  clear() {
    _currentUser = null;
    UserStore.clear();
  },
};
