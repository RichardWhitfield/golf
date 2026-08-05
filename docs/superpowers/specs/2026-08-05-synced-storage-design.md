# Phase 6 · Synced storage — design

**Date:** 2026-08-05
**Issue:** resolves [#8](https://github.com/RichardWhitfield/golf/issues/8) (OQ-3)
**Status:** approved

Move practice and Trackman data out of `localStorage` and into a remote store, so the same history
is visible on the phone at the range and the laptop afterwards. `localStorage` is demoted from
system of record to read cache.

This phase is a prerequisite for richer Trackman metrics, which is a **separate spec** — see §10.

---

## 1. Why now

OQ-3 said to revisit "once there's evidence of actual friction, not before". Two things supply it:

| Driver | Detail |
|---|---|
| **Two devices, two histories** | Sessions get logged on a phone; progress gets reviewed on a laptop. Today those are different `localStorage` documents with no relationship, and JSON export/import is a manual chore nobody performs weekly. |
| **The public-repo ceiling** | The next phase widens the Trackman query beyond `clubPath` to the full per-shot measurement set. The current publication channel is a file committed to a **public** repo, which is defensible for per-club aggregates and not defensible for a detailed shot-by-shot record. Storage must move before metrics widen, or the ingest is built against a destination we are about to abandon. |

The second is the binding one. It is why storage was sequenced first.

---

## 2. Requirements, as established

| # | Requirement | Source |
|---|---|---|
| R1 | Same data on phone and laptop, without manual export/import | The stated problem |
| R2 | **No offline support required** — there is always signal when logging | User, explicitly |
| R3 | **No authentication.** Reads and writes are both open; the data is not considered sensitive | User, explicitly, after the risk was put to them |
| R4 | Cheapest and simplest option that works; AWS preferred, as it is used elsewhere | User |
| R5 | The Trackman path moves too — `public/trackman.json` is retired in this phase | User |
| R6 | The site keeps working throughout, and keeps rendering when the network fails | Roadmap principle 1; existing `localStorage`-unavailable rule |

R2 is the single largest simplification. With no offline requirement there is one source of truth,
so there are **no conflicts to resolve** — no merge heuristics, no last-writer-wins policy, no
clock skew. Almost all of the difficulty in a sync design comes from the case this project does
not have.

---

## 3. Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D18 | Backend | **DynamoDB (on-demand) behind a Lambda Function URL** | Per-item model suits per-shot metrics, which a single JSON blob handles badly once it reaches megabytes. Costed at ~£0.02/month — see §4. |
| D19 | Access control | **None.** Open reads *and* open writes | R3. The alternative — a shared write token in an env var — was offered and declined. Consequences are contained by D20 and D21, not by access control. |
| D20 | Recovery | **Point-in-time recovery on**, 35-day window | The consequence of D19. It is the only thing standing between a bad write and permanent loss, so it is mandatory rather than optional. |
| D21 | Validation | **The Lambda validates request bodies but does not authenticate them** | Anyone may write; nobody may write a shape the client cannot parse. Ten lines that bound the blast radius of D19 to "a valid session was replaced by a different valid session" — recoverable — rather than "the store no longer parses". |
| D22 | Ingest credentials | **None. The workflow `PUT`s to the same public endpoint the browser uses** | A dividend of D19: no OIDC role, no IAM user, no new Actions secret. `TRACKMAN_REFRESH_TOKEN` remains the only secret in the repo. |
| D23 | Local storage role | **Read cache, written through on save** | R6. The page paints instantly on cold start and still renders when the network is down. |
| D24 | Item granularity | **Session aggregates and per-shot data are separate items** | Aggregates are what every current view reads (~125 KB total). Embedding shots would force a multi-megabyte download on every page load to render charts that do not use them. |
| D25 | Infrastructure as code | **AWS SAM template in the repo, deployed by hand** | Deploying infra from a public repo's CI needs AWS credentials — the one thing D22 otherwise avoids entirely. |
| D26 | Hosting | **Unchanged.** Static bundle, GitHub Pages, `CNAME`, generated `404.html` | Nothing about this phase requires moving the site. All existing deploy guards stand. |

### Deliberately excluded

No accounts, no login UI, no user table, no offline queue, no conflict resolution, no API Gateway,
no Cognito, no VPC, no custom API domain, no CI-driven infrastructure deploys.

---

## 4. Cost

Costed against real history: 86 stored Trackman sessions over 13 months, six practice sessions a week,
20 app loads a day. AWS publishes list prices for N. Virginia; **Sydney (`ap-southeast-2`)
typically runs 20–30% higher**, shown as an estimate.

| Component | Monthly volume | N. Virginia | Sydney (est.) |
|---|---|---|---|
| Writes | ~200 WRU (costed at 2,000 — 10× headroom) | $0.0013 | ~$0.0016 |
| Reads | ~95,000 RRU (deliberately pessimistic — see below) | $0.0119 | ~$0.0149 |
| Storage | ~1.5 MB | ~$0.0004 | ~$0.0005 |
| PITR | ~1.5 MB @ $0.20/GB-month | ~$0.0003 | ~$0.0004 |
| Lambda requests | ~700 | ~$0.0001 | ~$0.0002 |
| Lambda duration | ~18 GB-s | ~$0.0003 | ~$0.0004 |
| Data transfer out | ~750 MB | $0.00 | ~$0.0086 |
| **Total** | | **~$0.014** | **~$0.026** |

**Costed with no free-tier allowances at all.** The account postdates the mid-2025 restructure
(confirmed 2026-08-05), so the perpetual DynamoDB storage and Lambda request allowances are not
assumed. Every line above is list price.

Three notes:

- **Reads dominate, and the table deliberately overstates them by roughly 10×.** The ~95,000 RRU
  figure costs the *pre-D24* worst case: a full 1.26 MB re-read on every load, as though per-shot
  data were embedded in each session. With D24 a full history read is ~125 KB, about 16 read units,
  giving ~9,600 RRU/month — around **$0.001**. The pessimistic number is kept in the table so the
  total is an upper bound rather than a best case. Data transfer is overstated on the same basis
  (~75 MB in reality, against a 100 GB free allowance either way).
- **The real cost risk is misconfiguration, not usage** — provisioned capacity left running, or a
  retry loop. A **billing alarm at $1** is part of step 1 of the rollout, not a follow-up.
- **No free tier is assumed, and it does not matter.** The account postdates the mid-2025
  restructure, so it holds expiring credits rather than perpetual allowances. Removing every
  free-tier assumption moves the total from ~$0.017 to ~$0.026 — still **under three pence a
  month**, and still dominated by a read figure that is itself a 10× overestimate. The data
  transfer line is the most pessimistic of all: it assumes the 100 GB/month allowance does not
  apply and that every load re-downloads the full pre-D24 payload.

---

## 5. Shape

```
Browser  (golf.whitfield.life — static, GitHub Pages, unchanged)
   │
   │  CachedRepo(RemoteRepo) implements the existing Repository interface
   │  localStorage = read cache
   ▼
Lambda Function URL  ─────────────▶  DynamoDB (one table, on-demand, PITR on)
   ▲
   │  plain HTTPS PUT, no AWS credentials (D22)
   │
GitHub Actions  (daily Trackman ingest, schedule unchanged)
```

```
src/lib/storage/
  repository.ts     # the interface — unchanged
  local.ts          # LocalStorageRepo — retained, now serving as the cache
  remote.ts         # NEW: RemoteRepo, thin HTTP over the Function URL
  cached.ts         # NEW: CachedRepo decorator — cache-then-refresh, write-through
  migrations.ts     # unchanged
  transfer.ts       # unchanged — export/import stays the offline escape hatch

infra/
  template.yaml     # NEW: SAM — table, function, URL, PITR, billing alarm
  handler.mjs       # NEW: the Lambda, ~120 lines

src/lib/ingest/
  published.ts      # DELETED (§8, step 5)
  merge.ts          # unchanged
  aggregate.ts      # unchanged
```

`CachedRepo` **composes** the two — it holds a `RemoteRepo` and a `LocalStorageRepo` and is itself a
`Repository`. It is a decorator rather than caching baked into `RemoteRepo`, so the network layer
stays a thin, easily-faked HTTP client and the caching policy is testable on its own. Roughly 60
lines.

**One behaviour of `LocalStorageRepo` must be neutralised in its new role.** It currently refuses
every write once it cannot read its own document, quarantining the unreadable text — correct when
it is the only copy, wrong when it is a cache, because an unreadable *cache* would then block saves
that the remote would have accepted. In `CachedRepo`, the local repo's `faultMessage` is treated as
"discard and rebuild the cache"; only the **remote's** fault state gates writes. The quarantine
copy is still taken, since it costs nothing and the local document may be the last copy of
something the seed missed.

---

## 6. Data model

One table, `golf`, on-demand, PITR on. Single-partition by design: one user, and the partition
limits (10 GB, 3,000 RCU/s) are three orders of magnitude away.

| `pk` | `sk` | Holds | Size |
|---|---|---|---|
| `SESSION` | `<id>` | a `Session` exactly as typed today | ~400–600 B |
| `SHOTS#<sessionId>` | `v1` | per-shot metrics array | ~13 KB *(next phase)* |
| `SETTINGS` | `v1` | `Settings` | tiny |

**The sort key is the id alone, not `<date>#<id>`.** A date-prefixed key was considered for free
chronological ordering and rejected: `saveSession()` is contractually *"upsert by id"*, the date is
editable in the log form, and a mutable key means editing a session's date writes a **second item**
rather than updating the first — a silent duplicate. `listSessions()` sorts client-side instead,
which at ~250 items and ~30 new sessions a month is free.

The Phase 3 finding that **23 dates carry more than one session** still holds; it is simply no
longer the binding constraint on key choice.

**Unchanged:** the `Session`, `ClubPath` and `Settings` types. `StoreDocument` remains the export
format, so **existing JSON exports stay importable**. Each item gains a `schemaVersion` and an
`updatedAt` stamp.

**`migrations.ts` is not modified, and the per-item `schemaVersion` does not change how migration
works.** `RemoteRepo` assembles fetched items into a `StoreDocument` internally — taking the
document version as the minimum of the items' versions — and runs the existing migration chain over
that. Migrations continue to operate on a whole document, which is the shape they are written and
tested against. The per-item stamp exists so a partially-migrated table is detectable, not so that
migrations become per-item.

### The `manual` rule moves into the database

"Never overwrite a session marked `manual`" currently lives in `ingest/merge.ts` as a
read-then-merge. With two writers — the browser and the daily workflow — that is a read-modify-write
race. The ingest write path therefore carries a condition expression:

```
attribute_not_exists(pk) OR #source <> :manual
```

so the guarantee holds even if the script races or is buggy. The rule is now enforced in two places
by design: the pure merge functions (fast, tested) and the database (authoritative).

`ingest/merge.ts` and `aggregate.ts` are **not modified**. The script constructs a `RemoteRepo` —
`fetch` is native in Node 22 — and calls the existing `mergeTrackman()`. Same functions, same
Vitest coverage, new sink. `mergeTrackman()` therefore stays on the `Repository` interface rather
than being deleted.

---

## 7. API and sync behaviour

One handler, ~120 lines, Node 22. The AWS SDK v3 ships in the runtime, so there is no bundling
step.

| Method | Path | Maps to |
|---|---|---|
| `GET` | `/sessions` | `Query` `pk = SESSION` |
| `PUT` | `/sessions/{id}` | `PutItem` — conditional on the ingest path (§6) |
| `DELETE` | `/sessions/{id}` | `DeleteItem` |
| `GET` / `PUT` | `/settings` | single item |
| `GET` / `PUT` | `/shots/{id}` | reserved, next phase |

**CORS is a convenience, not a control.** The Function URL allows `https://golf.whitfield.life`
and `http://localhost:5173`. It lets the browser make the call; it prevents nothing, since the
workflow's `PUT` never passes through a browser. Recorded here so it is not later mistaken for a
safeguard.

**The Function URL is public and is not a secret.** It reaches the bundle as `VITE_API_URL`. It
does **not** go in Actions secrets — putting a non-secret there would blur the rule that matters.
Any claim that the URL's random hostname provides obscurity is false: the browser must call it, so
it is in `dist/` and therefore public. D20 and D21 carry the whole load.

### Sync behaviour

- **Read** — return the `localStorage` cache immediately so the page paints, then fetch and update
  in place. Cold start never shows a spinner before the day's drills.
- **Write** — `await` the remote, then mirror into the cache. Remote-first, deliberately: a write
  that reached only the cache would look saved and would not be.

### Error handling

| Failure | Behaviour |
|---|---|
| Remote read fails | Serve the cache, show a stale indicator. **The site never blanks.** |
| Remote write fails | **Throw, and surface it in the form.** |
| Remote returns unparseable JSON | Set `faultMessage`, refuse writes, reuse the existing quarantine pattern |
| Cache write fails (private browsing, blocked cookies) | Ignore. The remote is authoritative, so a missing cache is a performance issue, not a data one |
| Cache is unreadable | Discard and rebuild from the remote. **Does not block writes** — see §5 |

**The write-failure rule is a deliberate departure from `syncPublished()`**, which swallows every
failure by design. That was correct: published Trackman data is optional enrichment and must never
block app load. This is the user's own data, and a save that silently did not happen is precisely
the failure mode `localStorage` never had.

`faultMessage` carries over unchanged. The interface already anticipated this — it is documented as
*"a future remote repo has the same 'I can see something is wrong, don't let the user overwrite it'
state"*.

---

## 8. Rollout

Five steps. Each leaves `golf.whitfield.life` working (roadmap principle 1).

| # | Step | Verification |
|---|---|---|
| 1 | Deploy infra only — table, function, URL, PITR, **$1 billing alarm**. No app change | `curl` the endpoint; confirm PITR and the alarm in the console |
| 2 | Seed. Practice data from a JSON export; Trackman history from `public/trackman.json` | Session counts match the file (86) and the export, before proceeding |
| 3 | Switch the app to `CachedRepo(RemoteRepo)`. Deploy | Log a session on the phone; confirm it appears on the laptop |
| 4 | Switch the workflow to `PUT` at the Function URL | **Two** daily runs observed green, with data landing |
| 5 | Delete `public/trackman.json` and `ingest/published.ts` | Site still renders the full history from DynamoDB |

**The file being retired is the migration source.** Seeding Trackman history from
`public/trackman.json` needs no refresh token, no API call, and no exercise of the fragile
integration — the data is already in the repo in the right shape, and the result is verifiable by
diffing counts against a file that can simply be read.

**The seed triggers on a *successful* read returning zero items, never on a failed read.** Those
are the same value to a naive implementation and very different in meaning: treating a network
error as "the remote is empty" produces a re-seed loop.

Step 5 is last and is gated on step 4, so there is never a window in which Trackman data has no
working source.

---

## 9. Testing

Vitest, domain and storage only, consistent with D8. No test touches real AWS.

- **`RemoteRepo` against a fake `fetch`** — URL construction, HTTP error mapping, `faultMessage` on
  an unparseable body.
- **`CachedRepo`** — cache-then-refresh ordering, write-through, and the read-failure fallback that
  must not blank the app.
- **The Lambda handler as a pure function**, with a faked DynamoDB client — routing, body
  validation (D21), and construction of the `manual` condition expression. This is where D19 earns
  its coverage.
- **`merge.test.ts` and `aggregate.test.ts` stay untouched and passing.** That is the evidence the
  ingest rules did not drift when the sink changed.

Real AWS is verified by hand — `curl` in step 1, a live workflow run in step 4. `npm run check` and
`npm test` continue to gate the deploy.

---

## 10. Scope boundary

**Out of scope, and the subject of its own spec:** widening the Trackman GraphQL query beyond
`measurement { clubPath }` to the full per-shot measurement set, including swing plane.

That work starts with a **schema introspection query** against the `measurement` type. Field names
must be read from the live schema and never guessed — the same discipline `domain/clubs.ts` applies
to club spellings, where an unrecognised string returns `null` and is reported rather than assumed.
Introspection is enabled on this API (OQ-1), so the surface is verifiable.

This phase reserves the `SHOTS#<sessionId>` key space for it and otherwise leaves it alone.

Also out of scope: course rounds (OQ-6, [#11](https://github.com/RichardWhitfield/golf/issues/11)),
a `Block` entity (OQ-2, [#7](https://github.com/RichardWhitfield/golf/issues/7)), any visual change,
and any change to the plan page.

---

## 11. Documentation to update in the same commit

| File | Change |
|---|---|
| `CLAUDE.md` | "`localStorage` is the only copy of the user's practice data" is **no longer true** and would actively mislead. Replace with the cache/record split, the open-write posture, and PITR as the recovery path. Remove `public/trackman.json` references. |
| `docs/architecture.md` | D2 amended; D18–D26 added; §2 layout; §4 ingest rewritten for the new sink; §5 unchanged |
| `docs/roadmap.md` | OQ-3 marked resolved; this phase added; the "deliberately excluded" YAGNI list in `architecture.md` updated to note the reversal |

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| **Open writes (D19)** — anyone may overwrite or delete a session | PITR (D20), body validation (D21), per-item writes so damage is bounded to one record, JSON export retained |
| **The AWS account becomes a single point of failure** | Export/import stays; the cache means a total outage degrades to read-only rather than to a blank site |
| **Storage-cost surprise** | $1 billing alarm in step 1; on-demand only, never provisioned. Costed at list price with no free-tier assumption, so credit expiry changes nothing |
| **The Trackman integration breaks during the rerouting** | Steps 4 and 5 are separate, and step 5 is gated on two observed green runs. `public/trackman.json` remains in the repo until then |
| **AWS credits expire and the account converts to paid** | Already assumed. §4 costs everything at list price with no allowances, so expiry moves nothing |
