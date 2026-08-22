import { describe, expect, it } from 'vitest';

import {
  canHoldConversation,
  directConversationKey,
  normalizePair,
  reachableParticipants,
  resolveChatLink,
  type ChatLinkPolicy,
  type ChatParticipant,
} from './link-policy.js';

const OPERADOR = 'role-operador';
const REPARTIDOR = 'role-repartidor';
const SUPERADMIN = 'role-superadmin';

function participant(userId: string, roleIds: string[], canUseChat = true): ChatParticipant {
  return { canUseChat, roleIds, userId };
}

const isabella = participant('u-isabella', [SUPERADMIN]);
const tamara = participant('u-tamara', [OPERADOR]);
const operadorDos = participant('u-operador-2', [OPERADOR]);
const chofer = participant('u-chofer', [REPARTIDOR]);
const choferDos = participant('u-chofer-2', [REPARTIDOR]);

/** Drivers reach operators and superadmins, operators reach each other, drivers do not. */
const policy: ChatLinkPolicy = {
  roleLinks: [
    { active: true, roleAId: SUPERADMIN, roleBId: OPERADOR },
    { active: true, roleAId: SUPERADMIN, roleBId: REPARTIDOR },
    { active: true, roleAId: OPERADOR, roleBId: REPARTIDOR },
    { active: true, roleAId: OPERADOR, roleBId: OPERADOR },
  ],
  userLinks: [],
};

describe('chat link policy', () => {
  it('lets a driver reach an operator', () => {
    expect(resolveChatLink(chofer, tamara, policy)).toEqual({
      allowed: true,
      reason: 'ROLE_LINK',
    });
  });

  it('keeps drivers from opening a thread with each other', () => {
    // repartidor <-> repartidor is deliberately absent from the matrix.
    expect(resolveChatLink(chofer, choferDos, policy)).toEqual({
      allowed: false,
      reason: 'NOT_LINKED',
    });
  });

  it('lets operators reach each other through the same-role link', () => {
    expect(canHoldConversation(tamara, operadorDos, policy)).toBe(true);
  });

  it('is symmetric', () => {
    expect(canHoldConversation(chofer, isabella, policy)).toBe(
      canHoldConversation(isabella, chofer, policy),
    );
  });

  it('denies everyone when nothing is configured', () => {
    // Deny by default: an unconfigured installation is silent, not open.
    expect(resolveChatLink(tamara, isabella, { roleLinks: [], userLinks: [] })).toEqual({
      allowed: false,
      reason: 'NOT_LINKED',
    });
  });

  it('ignores an inactive role link', () => {
    const disabled: ChatLinkPolicy = {
      roleLinks: [{ active: false, roleAId: OPERADOR, roleBId: REPARTIDOR }],
      userLinks: [],
    };

    expect(canHoldConversation(chofer, tamara, disabled)).toBe(false);
  });

  it('lets a per-person allow override a missing role link', () => {
    const withException: ChatLinkPolicy = {
      ...policy,
      userLinks: [{ effect: 'allow', userAId: chofer.userId, userBId: choferDos.userId }],
    };

    expect(resolveChatLink(chofer, choferDos, withException)).toEqual({
      allowed: true,
      reason: 'USER_ALLOW',
    });
  });

  it('lets a per-person deny override an existing role link', () => {
    const withException: ChatLinkPolicy = {
      ...policy,
      userLinks: [{ effect: 'deny', userAId: chofer.userId, userBId: tamara.userId }],
    };

    expect(resolveChatLink(chofer, tamara, withException)).toEqual({
      allowed: false,
      reason: 'USER_DENIED',
    });
  });

  it('lets deny win over an allow for the same pair, whatever the order', () => {
    const conflicting = (links: ChatLinkPolicy['userLinks']): ChatLinkPolicy => ({
      ...policy,
      userLinks: links,
    });
    const allowThenDeny = conflicting([
      { effect: 'allow', userAId: chofer.userId, userBId: choferDos.userId },
      { effect: 'deny', userAId: chofer.userId, userBId: choferDos.userId },
    ]);
    const denyThenAllow = conflicting([
      { effect: 'deny', userAId: choferDos.userId, userBId: chofer.userId },
      { effect: 'allow', userAId: chofer.userId, userBId: choferDos.userId },
    ]);

    // Order must not decide a contact policy, unlike permission overrides.
    expect(canHoldConversation(chofer, choferDos, allowThenDeny)).toBe(false);
    expect(canHoldConversation(chofer, choferDos, denyThenAllow)).toBe(false);
  });

  it('matches an exception regardless of which way the pair was stored', () => {
    const reversed: ChatLinkPolicy = {
      ...policy,
      userLinks: [{ effect: 'deny', userAId: tamara.userId, userBId: chofer.userId }],
    };

    expect(canHoldConversation(chofer, tamara, reversed)).toBe(false);
  });

  it('refuses a user who cannot use chat, even with a link', () => {
    const revoked = participant(tamara.userId, [OPERADOR], false);

    expect(resolveChatLink(chofer, revoked, policy)).toEqual({
      allowed: false,
      reason: 'NO_CHAT_PERMISSION',
    });
  });

  it('refuses a conversation with oneself', () => {
    expect(resolveChatLink(tamara, tamara, policy)).toEqual({
      allowed: false,
      reason: 'SAME_USER',
    });
  });

  it('lists only the colleagues a driver may reach', () => {
    const reachable = reachableParticipants(chofer, [isabella, tamara, choferDos], policy);

    expect(reachable.map((person) => person.userId)).toEqual([isabella.userId, tamara.userId]);
  });

  it('normalises a pair and its conversation key in both directions', () => {
    expect(normalizePair('b', 'a')).toEqual(['a', 'b']);
    expect(directConversationKey('b', 'a')).toBe(directConversationKey('a', 'b'));
  });
});
