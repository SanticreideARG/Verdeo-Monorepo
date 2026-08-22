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

## Who gets chat

Operators, superadmins and repartidores. That reaches the database as the `chat.use` permission
granted to those roles in the seed, never as a role-name check in code: renaming or splitting a role
must not change who can talk.

## Who may talk to whom

Superadmins configure the graph. It resolves the same way permissions already do in this system —
grants from roles, then per-subject overrides — so there is one idiom to learn instead of two.

```text
chat_role_links            an unordered pair of roles that may converse
  role_a_id, role_b_id, active
  stored normalised (least, greatest) under a unique index

chat_user_links            an exception for one specific pair of people
  user_a_id, user_b_id, effect ('allow' | 'deny'), reason, created_by_user_id
  stored normalised under a unique index
```

Resolution for "may A and B hold a conversation":

1. both hold `chat.use`, otherwise no;
2. a `deny` in `chat_user_links` for the pair ends it — deny always wins;
3. an `allow` in `chat_user_links` grants it, regardless of roles;
4. otherwise, any active `chat_role_links` row joining a role of A with a role of B grants it;
5. otherwise no. **Deny by default**: an unconfigured system lets nobody start a conversation, which
   is the safe direction to fail.

A row where both roles are the same means that role may talk to itself. Leaving
`repartidor ↔ repartidor` out is how you stop drivers from opening threads with each other while
still letting each of them reach an operator.

> Deny wins unconditionally here. `resolvePermissions` applies overrides in array order, so a user
> holding both `allow` and `deny` for the same permission depends on ordering. That ambiguity is
> tolerable for a permission and is not for a communication policy, so this resolver is stricter on
> purpose.

Administered from Ajustes as a role matrix plus a short list of per-person exceptions, behind
`chat.links.manage`.

The link policy is the **only** authority over who can reach whom. Conversations are not scoped by
operation: whether an operator in one city may write to another city's staff is answered by the
matrix, not by the regional scope. This closes the directory question that was previously open.

An existing conversation survives a policy change; only starting a new one is gated. Revoking a link
stops new threads and leaves history readable, because deleting the record of a conversation that
happened is worse than letting it be read.

## The transport problem

Vercel Functions cannot hold a WebSocket open, so the usual chat architecture is unavailable.

| Option              | Fits serverless | New dependency                               | Notes                                                                   |
| ------------------- | --------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Polling + heartbeat | yes             | none                                         | works today; cost is invocation volume                                  |
| Server-Sent Events  | poorly          | none                                         | holds a function open; Hobby caps duration, so it reconnects constantly |
| Supabase Realtime   | yes             | none new — already the auth broker (ADR-029) | Broadcast + Presence channels, no function held open                    |

**Decision: polling and a heartbeat, behind an adapter.**

Supabase is available and its database is linked to the project, but two facts rule it out for now,
and neither is about preference:

- **Storage stays in Neon.** Putting chat in Supabase's Postgres would split the source of truth
  across two databases, with users on one side and conversations on the other: no foreign keys, no
  audit in the same transaction. `AGENTS.md` forbids a second source of truth, and this is exactly
  that.
- **Realtime would only work for some users.** `apps/web/src/lib/supabase.ts` creates the client with
  `autoRefreshToken: false`, and password-provisioned users never obtain a Supabase session at all
  (ADR-029 exchanges the token for a Verdeo session and does not persist it). Presence built on
  Realtime would work for Google sign-ins until their token expired, and never for the rest.
  Presence that is right for some colleagues and wrong for others is worse than no presence.

A heartbeat works identically for every user regardless of how they signed in, and needs no
provider. Realtime remains the natural upgrade once there is a measured reason and a session model
that covers everyone.

When Realtime does land: the database is **Neon**, so Supabase "Postgres Changes" cannot observe
these tables — only Broadcast and Presence apply. A broadcast announces that a conversation changed
and never carries content; the client then reads through the API so RBAC is enforced in one place.

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

## Retention

Messages live **30 days**. A daily scheduled purge deletes message rows past that age, together with
their locations and references, and records the count it removed.

Two consequences worth stating:

- **The audit trail outlives the message.** Sharing a customer reference is audited into
  `audit_events`, which has its own retention. Thirty days later the message is gone and the record
  that someone disclosed that customer remains.
- **Conversations are not deleted with their messages.** An emptied thread keeps its participants and
  its history of who joined when. It costs almost nothing and losing it would erase the fact that a
  conversation existed.

The purge is idempotent and safe to run twice, because a scheduled job that cannot be retried is a
job that will eventually be skipped.

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

## Presence

Two independent facts, deliberately kept apart:

- **Connected or not** — derived from a heartbeat (`last_seen_at` within a threshold). Ephemeral,
  never trusted from the client beyond "I am here".
- **Declared status** — `available`, `away`, `busy`, chosen by the operator and persisted.

Effective status = `offline` when the heartbeat is stale, otherwise the declared status. `away` may
also be set by the client after local inactivity; the server never guesses it.

Status values live in a configurable catalog rather than a hardcoded enum, consistent with the rest
of the domain. Only the offline derivation is code.

Presence is visible only between people the link policy already connects. It exposes user id,
display name and status and nothing else: it must not become a second, softer user directory that
leaks email or role, nor a way to observe colleagues you are not allowed to contact.

## Permissions

New `chat.*` group, deliberately separate from `messages.*`:

| Key                    | Grants                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `chat.use`             | Participate: read own conversations, send, set own presence |
| `chat.start_group`     | Create group conversations                                  |
| `chat.share_reference` | Attach an order or customer reference                       |
| `chat.presence.read`   | See the presence of connected colleagues                    |
| `chat.links.manage`    | Configure who may talk to whom                              |

`chat.share_reference` is separate on purpose: a user may need chat without being able to point
colleagues at customer records. The reference still resolves per viewer, so this is defence in depth
rather than the only control.

## Audit policy

Auditing every message body would be heavy and would turn an operational tool into surveillance.
The line drawn here:

- **Audited:** conversation created, participant added or removed, reference shared, message deleted,
  link policy changed, retention purge with its count.
- **Not audited:** message bodies, presence changes, read receipts.

This is a deliberate narrowing of "every relevant mutation is audited" and needs sign-off, because
it is a judgement about what "relevant" means for internal communication.

## Milestones

The service is built to CHAT-2 and then parked. CHAT-3 onwards is designed but not scheduled.

| #          | Scope                                                                                                           | Prerequisites                                                             | Notes                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| **CHAT-1** | Link policy and its admin screen; direct conversations, text messages, read state; REST + polling; 30-day purge | none                                                                      | No new infrastructure                      |
| **CHAT-2** | Presence: heartbeat, declared status, indicator in the shell                                                    | CHAT-1                                                                    | Still no provider — **standby after this** |
| CHAT-3     | References to orders and customers resolved per viewer; locations                                               | CHAT-1                                                                    | The audited part                           |
| CHAT-4     | Group conversations                                                                                             | CHAT-1                                                                    |                                            |
| CHAT-5     | Realtime transport swap behind the adapter                                                                      | CHAT-1..3, a measured reason, and a session model covering password users | Polling stays as fallback                  |

CHAT-1 carries the link policy because a conversation cannot be created without knowing whether the
pair is allowed, which makes it larger than a plain messaging slice. Locations and references moved
to CHAT-3 so the parked service is a working text chat rather than a half-built one.

## As built (CHAT-1)

Tables are `chat_role_links`, `chat_user_links`, `staff_conversations`,
`staff_conversation_participants` and `staff_messages` (migration 0011, purely additive). The
resolver lives in `@verdeo/chat` as pure functions so the policy is testable without a database, and
`PostgresChatService` applies it.

Screens: `/app/chat` for the conversation, `/app/ajustes/chat` for the role matrix and the
exceptions.

Three things worth knowing:

- **Polling backs off when the tab is hidden**, from five seconds to thirty. Every poll is a function
  invocation, and an operator with the window behind another does not need the faster cadence.
- **A non-participant is told the conversation does not exist**, never that it exists and is
  forbidden. A 403 there would confirm the thread is real.
- **The retention job authenticates with a shared secret, not a session**, and lives at
  `/api/v1/cron/chat-retention` rather than under `/api/v1/chat`, so it is not behind the session
  guard. With no `CRON_SECRET` configured it refuses everyone: a purge nobody can trigger beats one
  anybody can. Vercel runs it daily at 04:00.

The seed grants `chat.use` to the operator and driver roles; superadmin already holds every
permission. It seeds **no links**: an installation starts with nobody able to talk until a superadmin
fills the matrix, which is the documented deny-by-default.

## As built (CHAT-2)

`chat_presence_statuses` and `staff_presence` (migration 0012, additive; the migration seeds the
three documented statuses as rows). `effectivePresence` is a pure function in `@verdeo/chat`.

- **The heartbeat beats while the tab is hidden**, unlike the message polling that backs off. A
  minimised window is still a reachable colleague, which is the whole point of presence.
- **A plain beat never resets a declared status.** The status field is omitted rather than defaulted,
  so 'I am here' and 'I am busy' stay separate statements.
- **A colleague who never connected is reported offline, not omitted.** Missing from a list reads as
  'not a colleague'; offline reads as 'not right now'.
- **Presence follows the link policy.** `listPresence` is built from the contact list, so someone you
  cannot message is someone whose presence you cannot observe either.
- **The dot is never the only signal**: each carries a label for anyone who cannot rely on colour.

`away` is offered as a choice and never inferred from idleness. A status the system invents is a
status colleagues cannot trust.

## Standby

The service stops here by decision. CHAT-3 (references and locations), CHAT-4 (groups) and CHAT-5
(Realtime transport) are designed above and unscheduled. Nothing in what is built assumes they will
not arrive: message `kind` already admits `location` and `reference`, conversations already admit
`group`, and the transport sits behind the polling client rather than in it.

## Still OPEN

- Can a conversation ever be read by someone who was not a participant — for an audit or a dispute?
  Today the answer is no, and nothing in the model provides for it.
- Notifications beyond in-app unread counts. Out of scope for V1; the question is whether the model
  needs to anticipate them now.
