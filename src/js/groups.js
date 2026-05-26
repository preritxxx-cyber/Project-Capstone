/**
 * DutchIT – Group Business Logic
 */
import { GroupStore } from './store.js';
import { generateGroupId, generateDummyMemberId } from './utils.js';
import { User } from './user.js';

export const Groups = {

  /** Create a new group */
  create({ name, picture, pictureType, baseCurrency, intermediateCurrency, members }) {
    const currentUser = User.get();
    if (!currentUser) throw new Error('No user logged in');

    // Validate name uniqueness per user
    if (GroupStore.userHasGroupNamed(currentUser.userId, name)) {
      throw new Error(`You already have a group named "${name}". Please choose a different name.`);
    }

    const groupId = generateGroupId(currentUser.userId);

    // Ensure current user is always in members as creator
    const creatorMember = {
      memberId: currentUser.userId,
      name: currentUser.displayName,
      isCreator: true,
      isDummy: false,
      joinedAt: new Date().toISOString(),
    };

    // Merge in other members (deduplicate by memberId)
    const allMembers = [creatorMember];
    for (const m of (members || [])) {
      if (m.memberId !== currentUser.userId) {
        allMembers.push(m);
      }
    }

    const group = {
      groupId,
      name: name.trim(),
      picture: picture || null,
      pictureType: pictureType || 'emoji',
      baseCurrency: baseCurrency || 'USD',
      intermediateCurrency: intermediateCurrency || null,
      creatorId: currentUser.userId,
      members: allMembers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return GroupStore.create(group);
  },

  /** Update group details (except creator) */
  update(groupId, { name, picture, pictureType, baseCurrency, intermediateCurrency, members }) {
    const group = GroupStore.getById(groupId);
    if (!group) throw new Error('Group not found');

    const currentUser = User.get();
    // If changing name, check uniqueness for creator
    if (name && name.trim().toLowerCase() !== group.name.toLowerCase()) {
      // Only validate uniqueness against the creator
      if (GroupStore.userHasGroupNamed(group.creatorId, name)) {
        const creatorIsCurrentUser = group.creatorId === currentUser?.userId;
        if (creatorIsCurrentUser) {
          throw new Error(`You already have a group named "${name}".`);
        }
      }
    }

    const updates = {};
    if (name !== undefined)         updates.name = name.trim();
    if (picture !== undefined)      updates.picture = picture;
    if (pictureType !== undefined)  updates.pictureType = pictureType;
    if (baseCurrency !== undefined)         updates.baseCurrency = baseCurrency;
    if (intermediateCurrency !== undefined) updates.intermediateCurrency = intermediateCurrency || null;
    if (members !== undefined)              updates.members = members;

    return GroupStore.update(groupId, updates);
  },

  /** Delete a group */
  delete(groupId) {
    GroupStore.delete(groupId);
  },

  /** Get all groups for current user */
  getMyGroups() {
    const currentUser = User.get();
    if (!currentUser) return [];
    return GroupStore.getForUser(currentUser.userId);
  },

  /** Get group by ID */
  getById(groupId) {
    return GroupStore.getById(groupId);
  },

  /** Join a group by ID (add current user as member) */
  joinById(groupId) {
    const currentUser = User.get();
    if (!currentUser) throw new Error('No user logged in');

    const group = GroupStore.getById(groupId);
    if (!group) throw new Error('Group not found. Please check the group ID.');

    // Already a member?
    if (group.members.some(m => m.memberId === currentUser.userId)) {
      return { group, alreadyMember: true };
    }

    const member = {
      memberId: currentUser.userId,
      name: currentUser.displayName,
      isCreator: false,
      isDummy: false,
      joinedAt: new Date().toISOString(),
    };

    GroupStore.addMember(groupId, member);
    return { group: GroupStore.getById(groupId), alreadyMember: false };
  },

  /** Add a dummy member to a group */
  addDummyMember(groupId, name) {
    const member = {
      memberId: generateDummyMemberId(),
      name: name.trim(),
      isCreator: false,
      isDummy: true,
      joinedAt: new Date().toISOString(),
    };
    return GroupStore.addMember(groupId, member);
  },

  /** Remove a member from a group */
  removeMember(groupId, memberId) {
    const group = GroupStore.getById(groupId);
    if (!group) return null;
    // Cannot remove creator
    const member = group.members.find(m => m.memberId === memberId);
    if (member?.isCreator) throw new Error('Cannot remove the group creator.');
    return GroupStore.removeMember(groupId, memberId);
  },

  /** Create a dummy member object (not yet saved) */
  createDummyMemberObj(name) {
    return {
      memberId: generateDummyMemberId(),
      name: name.trim(),
      isCreator: false,
      isDummy: true,
      joinedAt: new Date().toISOString(),
    };
  },
};
