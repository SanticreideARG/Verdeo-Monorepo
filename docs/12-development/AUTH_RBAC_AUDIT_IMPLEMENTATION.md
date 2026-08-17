# Auth, RBAC, and Audit Implementation

## Objective

Complete the security foundation used by every staff and operational feature. Authentication identifies a
user, RBAC determines allowed actions from database configuration, and Audit records relevant mutations.
These concerns remain separate even when executed in one request.

## Existing foundation

- `User`, `AuthIdentity`, `Session`, `Role`, `Permission`, assignment, override, audit, and domain-event
  tables;
- opaque session-token generation and SHA-256 token hashing;
- dynamic permission resolution with user `allow`/`deny` overrides;
- initial permission catalog and role seed;
- Hono request IDs, structured logs, and API error envelope;
- provider-neutral auth ADR in `Proposed` state.

## Authentication flow

```text
OAuth provider callback
  -> verify provider response
  -> resolve provider + providerSubject
  -> load active User
  -> create opaque session token
  -> persist token hash and expiry
  -> return Secure, HttpOnly, SameSite cookie
  -> middleware hashes cookie token
  -> load active, non-revoked session and User
  -> attach Principal to request context
```

### Required rules

- provider tokens and raw session tokens are secrets;
- raw session tokens never enter database, logs, audit metadata, analytics, or URLs;
- cookies are `Secure` in production, `HttpOnly`, scoped narrowly, and have an explicit `SameSite` policy;
- login rotates/creates a new session and logout revokes it server-side;
- disabling a user invalidates effective access even if a session row has not expired;
- session expiry and revocation are checked on every authenticated request;
- account linking requires verified provider evidence and explicit policy;
- OAuth `state`, nonce/PKCE where applicable, and callback origin are verified.

## Principal and permission snapshot

The authenticated request principal should contain only identifiers and resolved permissions needed by the
request:

```ts
interface Principal {
  userId: string;
  sessionId: string;
  permissions: ReadonlySet<string>;
}
```

It must not contain provider tokens. Permission resolution order:

1. load permissions granted by all active roles;
2. apply user overrides;
3. `deny` removes a role grant;
4. `allow` adds a direct grant;
5. unknown or absent permissions deny access.

Do not authorize with `role === 'superadmin'` or equivalent. The superadmin seed works because its role is
assigned permission records.

## Authorization layers

- **API middleware:** rejects unauthenticated requests and checks coarse endpoint permission.
- **Domain service:** checks the action and resource scope again before mutation.
- **Repository query:** constrains returned records where ownership or operational scope applies.
- **DTO mapper:** removes fields the caller does not need.

Hidden navigation is a UX aid, not authorization.

## Initial API surface

### Session

- `GET /me`
- `POST /auth/logout`
- provider-specific login/callback routes behind an auth adapter
- `GET /sessions` for the current user
- `DELETE /sessions/:id` to revoke an owned session

### Administration

- `GET /users`
- `POST /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `POST /users/:id/disable`
- `POST /users/:id/sessions/revoke`
- `GET /roles`
- `POST /roles`
- `PATCH /roles/:id`
- `PUT /roles/:id/permissions`
- `PUT /users/:id/roles`
- `PUT /users/:id/permission-overrides`

All request parameters and response bodies require Zod contracts. Mutation endpoints should support an
idempotency strategy when retries could repeat an external or sensitive action.

## Domain services

- `SessionService`: authenticate, create, rotate, revoke, and expire sessions.
- `UserAdministrationService`: create, update, disable, and prevent unsafe privilege changes.
- `PermissionService`: load and resolve permission snapshots.
- `RoleService`: maintain role definitions and permission assignments.
- `AuditService`: append immutable audit events through a transactional sink.

React components and Zustand stores must not implement these rules.

## Audit requirements

Record at minimum:

- login success/failure summary without credentials;
- logout and session revocation;
- user create/update/disable;
- role create/update/disable;
- role assignment changes;
- permission assignment and override changes;
- first-superadmin bootstrap;
- rejected sensitive operations where security review benefits from a record.

Each event includes actor, action, entity type/ID, safe before/after or diff, source, request ID,
correlation ID, and UTC timestamp. Redact secrets and avoid duplicating unnecessary PII.

For required mutation audit, write the business change and audit record in the same database transaction.
Technical logs are not a replacement for `AuditEvent`.

## Test matrix

### Unit

- active, expired, and revoked sessions;
- disabled user with an otherwise active session;
- multiple-role permission union;
- user allow and deny overrides;
- deny-by-default for an unknown permission;
- self-disable/self-lockout safeguards;
- audit redaction/diff generation.

### Integration/API

- OAuth adapter mocked at the boundary;
- secure cookie creation and clearing;
- `/me` authenticated and unauthenticated;
- permission guard returns `403` with the standard envelope;
- role/permission mutations commit with audit;
- failed mutation creates no misleading success audit;
- concurrent role updates remain consistent;
- session revocation takes effect immediately.

### Security

- CSRF and OAuth state validation;
- session fixation;
- IDOR on users/sessions;
- privilege escalation through role or override endpoints;
- secret/token exposure in logs and audit;
- rate limiting for auth endpoints;
- disabled-account access.

## Acceptance criteria

- the chosen auth adapter is isolated from domain services;
- no role-name authorization exists;
- all admin endpoints require explicit permissions;
- all relevant mutations are transactional and audited;
- session revocation and user disable work immediately;
- API DTOs expose no provider credentials or token hashes;
- tests and `pnpm check` pass;
- ADR-019 records the accepted provider and session policy.

## OPEN decisions

- staff OAuth provider;
- allowed accounts/domains;
- session duration and idle timeout;
- MFA enforcement and recovery policy;
- safe first-superadmin identity and bootstrap operator;
- whether users may self-revoke all sessions;
- exact protection against removing the final active superadmin.
