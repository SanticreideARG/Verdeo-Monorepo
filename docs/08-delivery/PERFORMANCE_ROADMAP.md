# Performance and perceived-latency roadmap

## Why this exists

Staff screens interrupt the operator with full-screen loaders, and the underlying requests are
slower than they need to be. The two problems are independent and are fixed in different places:
the interruption is a frontend navigation issue, the latency is mostly infrastructure and query
shape. Caching is deliberately last, because caching over a slow API hides the problem instead of
removing it.

## Measured baseline

Taken 2026-08-22 against the deployed API (`083b66b`) and the repository.

| Signal                    | Value                                | Note                                                |
| ------------------------- | ------------------------------------ | --------------------------------------------------- |
| `/health` cold            | 2.6 s                                | does not touch the database                         |
| `/health` warm            | 0.46 – 0.59 s                        | does not touch the database                         |
| Web bundle                | 320 KB JS (94 KB gzip), single chunk | no route splitting                                  |
| API region                | Vercel default                       | `apps/api/vercel.json` declares no `regions`        |
| Database region           | `sa-east-1` (São Paulo)              | every query crosses to the function's region        |
| Connection pool on Vercel | `max: 1`                             | `apps/api/src/runtime.ts`                           |
| `GET /api/v1/orders`      | 1 + 4N queries                       | `loadOrder` runs 4 queries per row, default page 30 |

The order listing is the worst case: roughly 120 queries, serialised over one connection, each
crossing regions.

## FASE 1 — Stop interrupting ✅ done

**Priority:** highest. **Prerequisites:** none. **Effort:** small.

- Sidebar navigation used `<a href>`, which discarded the SPA and reloaded the whole bundle on every
  click. Now `<Link>`, with an explicit anchor scroll since client navigation no longer gets the
  browser's native one.
- A non-blocking progress bar under the top bar, driven by an in-flight request counter inside
  `apiRequest`. It appears only after 120 ms so instant responses show nothing, and lingers briefly
  so fast ones do not flicker.
- Refreshes after a mutation no longer blank the operations screen; only the first load does.

## FASE 2 — Share session and scope

**Priority:** high. **Prerequisites:** Fase 1. **Effort:** medium.

Each screen fetches `/api/v1/me` independently and blocks on it before anything else, and the shell
fetches `/api/v1/scope` on every mount. That is two serialised round trips added to every
navigation, for data that does not change between screens.

- A `SessionProvider` at the `App` level resolving `/me` and `/scope` once, with screens reading
  from context.
- Changing the operating site currently calls `window.location.reload()`
  (`DashboardShell.tsx`). Replace it with cache invalidation plus a background refetch. This is
  the last full page reload left in the dashboard, and it needs Fase 3's invalidation hook to be
  removed correctly — until then it stays, because showing one city's data under another city's
  label is worse than a reload.

**Done when:** navigating between screens issues no `/me` or `/scope` request, and switching city
does not reload the document.

## FASE 3 — Stale-while-revalidate cache

**Priority:** medium. **Prerequisites:** Fase 2, and ideally Fase 4 items 1–2 so the cache is not
covering for avoidable latency. **Effort:** medium.

- An in-memory store keyed by endpoint **and active operating site**. Omitting the site from the key
  would show one city's rows while another is selected, which is a correctness bug, not a cache miss.
- Revisiting a screen paints the last known data immediately and revalidates behind the progress bar.
- Mutations invalidate the keys they affect rather than triggering a blanket reload.

`zustand` is already a dependency of `apps/web` and is currently unused; it is enough for this and
avoids adding a data-fetching library.

**Done when:** returning to a previously visited screen renders without a visible loading state.

## FASE 4 — Backend latency

These are independent of each other and of the frontend phases. Item 1 is one line and probably the
single largest measurable win.

### 4.1 Co-locate the API with the database

**Priority:** high. **Prerequisites:** none. **Effort:** trivial.

Declare `"regions": ["gru1"]` in `apps/api/vercel.json` so the function runs in São Paulo alongside
Neon. Today every database round trip crosses regions, and endpoints make several.

**Verify:** compare `/health` and one database-backed endpoint before and after, on a warm function.

### 4.2 Remove the order listing N+1

**Priority:** high. **Prerequisites:** none. **Effort:** medium.

`listOrders` selects the page's ids and then calls `loadOrder` per row, four queries each. Replace
with a single query joining items, selections and instructions, aggregated in one pass.
`resolveOrderItems` has the same shape on the write path — four queries per line item, including
`composableFamilyName`, which returns the same value for every line and should be resolved once.

**Verify:** count queries per request in the structured logs; the listing should be a small constant.

### 4.3 Raise the Vercel connection pool

**Priority:** medium. **Prerequisites:** 4.2 (fixing the N+1 first may make this unnecessary).
**Effort:** trivial.

`max: 1` serialises every query in a request. Neon's pooler supports more; the value was chosen to
be safe under serverless concurrency and has never been revisited.

**Verify:** no connection exhaustion under concurrent requests in Preview.

### 4.4 Route-level code splitting

**Priority:** low. **Prerequisites:** none. **Effort:** small.

320 KB in one chunk is parsed before anything renders. `React.lazy` per route means the public
landing does not pay for the staff dashboard. Lower priority than it looks now that Fase 1 stopped
re-parsing the bundle on every navigation.

### 4.5 Neon scale-to-zero

**Priority:** informational. **Prerequisites:** none.

The Free plan suspends compute after inactivity, so the first request after an idle period pays a
database cold start on top of the function's. It contributes to the 2.6 s figure above and is a plan
characteristic, not a defect. Worth knowing before attributing cold latency to the code.

## Suggested order

```text
FASE 1 ✅
  -> 4.1 región          (una línea, mayor ganancia medible)
  -> 4.2 N+1 de pedidos  (la pantalla más lenta)
  -> FASE 2 sesión/alcance compartidos
  -> 4.3 pool
  -> FASE 3 cache
  -> 4.4 code splitting
```

Measure after 4.1 and 4.2 before starting Fase 3: the cache may turn out to be unnecessary for the
screens that feel slow today.
