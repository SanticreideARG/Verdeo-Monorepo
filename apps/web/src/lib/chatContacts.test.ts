import { describe, expect, it } from 'vitest';

import { contactsWithoutConversation, type ChatContact, type ChatConversation } from './chat.js';

const person = (id: string): ChatContact => ({ avatarUrl: null, displayName: id, id });
const conversation = (participants: ChatContact[]): ChatConversation => ({
  id: participants.map((p) => p.id).join('-'),
  kind: 'direct',
  lastMessageAt: null,
  participants,
  title: null,
  unreadCount: 0,
});

describe('contactsWithoutConversation', () => {
  it('no repite como contacto a quien ya tiene conversación directa', () => {
    const ana = person('ana');
    const beto = person('beto');

    expect(contactsWithoutConversation([ana, beto], [conversation([ana])])).toEqual([beto]);
  });

  it('una conversación de grupo no esconde a sus integrantes', () => {
    const ana = person('ana');
    const beto = person('beto');

    expect(contactsWithoutConversation([ana, beto], [conversation([ana, beto])])).toEqual([
      ana,
      beto,
    ]);
  });
});
