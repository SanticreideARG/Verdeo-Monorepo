# Internal messaging and presence

## What this is, and what it is not

Staff-to-staff messaging inside Verdeo: text, shared locations, and links to an order or a customer,
plus presence so an operator can tell who is available before asking.

It is **not** the customer channel. `MESSAGING_WHATSAPP.md` and `OPERATIONAL_MODULES.md` already
reserve `Conversation`, `Message`, `MessagingAccount`, the `conversations` / `messages` tables and
the `messages.*` permission group for conversations **with customers**. Internal messaging uses
`staff_*` tables and the `chat.*` permission group so the two domains never collide — they have
different participants, different privacy rules and different retention.

File sharing is out of scope. Only text, locations and references.

## Non-negotiables this inherits

- A repartidor must never receive customer contact data (`AGENTS.md`). Internal messaging is the
  easiest place to leak it by accident, which is why references are resolved per viewer (below).
- Zod at the boundary, dynamic RBAC, audit for relevant mutations.
- External providers behind adapters, and the product keeps working when one is down.

## The transport problem

Vercel Functions cannot hold a WebSocket open, so the usual chat architecture is unavailable. Three
options were considered:

| Option              | Fits serverless | New dependency                               | Notes                                                                   |
| ------------------- | --------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Polling + heartbeat | yes             | none                                         | works today; cost is invocation volume                                  |
| Server-Sent Events  | poorly          | none                                         | holds a function open; Hobby caps duration, so it reconnects constantly |
| Supabase Realtime   | yes             | none new — already the auth broker (ADR-029) | Broadcast + Presence channels, no function held open                    |

**Decision: start with polling and a heartbeat, behind an adapter.** V1 needs no new infrastructure
and no new provider. Realtime becomes a transport swap once there is a measured reason, exactly as
the performance roadmap treats caching: do not add infrastructure before measuring.

One detail that a naive Realtime plan gets wrong: the database is **Neon**, not Supabase's Postgres,
so Supabase "Postgres Changes" cannot observe these tables. Only **Broadcast** and **Presence**
channels apply, with Neon remaining the source of truth.

When Realtime does land, a broadcast carries only "conversation X changed", never message content.
The client then reads through the API so RBAC is enforced in one place. That costs one indexed query
per message and removes a whole class of authorization bypass.

## Domain model

```text
staff_conversations
  id, kind ('direct' | 'group'), title, direct_key, created_by_user_id, last_message_at, timestamps

staff_conversation_participants
  conversation_id, user_id, joined_at, left_at, last_read_at, muted
  PK (conversation_id, user_id)

staff_messages
  id, conversation_id, author_user_id, kind ('text' | 'location' | 'reference'),
  body, created_at, edited_at, deleted_at

staff_message_locations
  message_id, latitude, longitude, label

staff_message_references
  message_id, resource_type ('order' | 'customer'), resource_id

staff_presence
  user_id PK, status, status_message, last_seen_at, updated_at
```

`direct_key` is the two participant ids sorted and joined, under a partial unique index where
`kind = 'direct'`. Without it, two operators opening a chat at the same moment create two threads for
the same pair.

`left_at` rather than deleting the row: who was in a conversation and when is part of its history.

Unread counts come from `last_read_at` per participant, not from a per-message read table. One
timestamp comparison against an index on `(conversation_id, created_at)` answers it.

A deleted message keeps its row with `deleted_at` set and its body cleared. The conversation stays
readable and the gap stays visible.

## Presence

Two independent facts, deliberately kept apart:

- **Connected or not** — derived from a heartbeat (`last_seen_at` within a threshold). Ephemeral,
  never trusted from the client beyond "I am here".
- **Declared status** — `available`, `away`, `busy`, chosen by the operator and persisted.

Effective status = `offline` when the heartbeat is stale, otherwise the declared status. `away` may
also be set by the client after local inactivity; the server never guesses it.

Status values live in a configurable catalog rather than a hardcoded enum, consistent with the rest
of the domain. Only the offline derivation is code.

Presence exposes user id, display name and status. Nothing else: it must not become a second, softer
user directory that leaks email or role.

## Shared references — the PII-safe part

A reference message stores **a pointer, never a copy**: `{ resource_type, resource_id }`.

At render time each viewer resolves it through the existing endpoint with their own permissions. A
repartidor without `customers.read` sees "referencia no disponible", not a cached customer card. A
snapshot would freeze data the recipient was never allowed to see, and would go stale.

Sharing a customer reference **is a PII disclosure event and is audited** — who shared which customer
with whom. This is the one place where audit matters more than the message body.

Locations are plain coordinates the sender chose, with an optional label. A customer's address is
**not** shared as a location; it is shared as a customer reference, so the permission check applies.
Sending the same coordinates as a raw location would be the leak the reference model exists to
prevent.

## Permissions

New `chat.*` group, deliberately separate from `messages.*`:

| Key                    | Grants                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `chat.use`             | Participate: read own conversations, send, set own presence |
| `chat.start_group`     | Create group conversations                                  |
| `chat.share_reference` | Attach an order or customer reference                       |
| `chat.presence.read`   | See other users' presence                                   |

`chat.share_reference` is separate on purpose: a user may need chat without being able to point
colleagues at customer records. The reference still resolves per viewer, so this is defence in depth
rather than the only control.

## Audit policy

Auditing every message body would be heavy and would turn an operational tool into surveillance.
The line drawn here:

- **Audited:** conversation created, participant added or removed, reference shared, message deleted.
- **Not audited:** message bodies, presence changes, read receipts.

This is a deliberate narrowing of "every relevant mutation is audited" and needs sign-off, because
it is a judgement about what "relevant" means for internal communication.

## Regional scope — OPEN

Conversations are between people, not operations, so the tables carry no `operating_site_id`. What is
genuinely open is **the directory**: whether an operator in one city can start a conversation with
staff from another, or only with people who share one of their operations.

Recommendation: default the directory to the operations the user belongs to, with the full list
behind `sites.access_all`. Not implemented until decided, because it changes who can talk to whom.

## Other OPEN questions

- Retention: do messages live forever, like menus, or expire?
- Do repartidores get chat at all, and if so can they receive references?
- Is a conversation ever readable by someone who was not a participant (audit, dispute)?
- Notifications beyond in-app unread counts: out of scope for V1, but does the model need to
  anticipate them?

## Milestones

| #          | Scope                                                                   | Prerequisites                           | Notes                     |
| ---------- | ----------------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| **CHAT-1** | Schema, direct conversations, text messages, read state, REST + polling | none                                    | No new infrastructure     |
| **CHAT-2** | Presence: heartbeat, declared status, presence in the shell             | CHAT-1                                  | Still no provider         |
| **CHAT-3** | References to orders and customers, resolved per viewer; locations      | CHAT-1, and the directory OPEN resolved | The audited part          |
| **CHAT-4** | Group conversations                                                     | CHAT-1                                  |                           |
| **CHAT-5** | Realtime transport swap behind the adapter                              | CHAT-1..3, plus a measured reason       | Polling stays as fallback |

CHAT-1 and CHAT-2 are deliberately shaped so the feature is usable before any provider decision is
made. Measure polling cost with real usage before committing to CHAT-5.
