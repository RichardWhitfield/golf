# Synced Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move practice and Trackman data from `localStorage` into DynamoDB so the phone and the laptop share one history, and retire `public/trackman.json`.

**Architecture:** A Lambda Function URL fronts a single DynamoDB table. In the browser, a new `RemoteRepo` implements the existing `Repository` interface and a `CachedRepo` decorator wraps it with a `localStorage` read cache. Writes are unauthenticated by explicit decision (D19); the blast radius is bounded by point-in-time recovery, structural body validation and per-item writes. The daily ingest workflow `PUT`s to the same public endpoint and therefore needs no AWS credentials.

**Tech Stack:** AWS SAM, DynamoDB (on-demand), Lambda (Node 22, plain ESM — no bundling), Svelte 5, TypeScript, Vitest.

## Global Constraints

Copied from `docs/superpowers/specs/2026-08-05-synced-storage-design.md` and `CLAUDE.md`. Every task's requirements implicitly include this section.

- **No component may call `localStorage` or import a repository directly.** Everything goes through `src/lib/stores/sessions.svelte.ts`, which constructs the only `Repository` in the app.
- **Every `Repository` method is `async`.** Never make one synchronous.
- **Club path is signed.** Never store an absolute value; never range-check with `Math.abs`.
- **Never blend club path across clubs.** No code path may compute a mean spanning more than one club.
- **`n` is absent, never zero,** on hand-typed readings. Never fabricate a default.
- **British English** (`lang="en-GB"`) in all copy.
- **No secrets in the client bundle.** The Function URL is public by design and is NOT a secret — it does not go in Actions secrets.
- **`CNAME` must end up in `dist/`**, and `dist/404.html` must exist. Do not touch the deploy workflow's assertions.
- **The app must render when `localStorage` is unavailable.** Never reintroduce a top-level `localStorage` reference.
- **The site must work after every task.** Never leave `golf.whitfield.life` half-migrated.
- **Docs are updated in the same commit** as the change that makes them wrong.
- **Table name:** `golf`. **Region:** `ap-southeast-2`. **Runtime:** `nodejs22.x`.
- **Item shape:** `pk`, `sk`, `doc` (JSON string), `source`, `schemaVersion`, `updatedAt`.
- **Sort key is the id alone** — never `<date>#<id>`. The date is editable and would break upsert-by-id.

---

## File Structure

| File | Responsibility |
|---|---|
| `infra/handler.mjs` | **Create.** The Lambda: routing, structural validation, DynamoDB calls. Plain ESM, no build step. |
| `infra/handler.test.mjs` | **Create.** Vitest against a fake DynamoDB client. No AWS. |
| `infra/template.yaml` | **Create.** SAM: table, function, Function URL, PITR, billing alarm. |
| `infra/README.md` | **Create.** How to deploy and how to restore from PITR. |
| `src/lib/storage/remote.ts` | **Create.** `RemoteRepo` — thin HTTP over the Function URL. |
| `src/lib/storage/remote.test.ts` | **Create.** Against a fake `fetch`. |
| `src/lib/storage/cached.ts` | **Create.** `CachedRepo` — cache-then-refresh, write-through, seed-on-empty. |
| `src/lib/storage/cached.test.ts` | **Create.** Cache policy in isolation. |
| `src/env.d.ts` | **Create.** Types `import.meta.env.VITE_API_URL`. |
| `src/lib/stores/sessions.svelte.ts` | **Modify.** Construct `CachedRepo`; drop `syncPublished()`. |
| `scripts/seed-remote.ts` | **Create.** One-off: push `public/trackman.json` into the table. |
| `scripts/trackman-ingest.ts` | **Modify.** `PUT` to the Function URL instead of writing a file. |
| `.github/workflows/trackman.yml` | **Modify.** Drop the commit/publish jobs; pass `API_URL`. |
| `src/lib/ingest/published.ts` | **Delete** (Task 8). |
| `public/trackman.json` | **Delete** (Task 8). |

`src/lib/ingest/merge.ts`, `src/lib/ingest/aggregate.ts`, `src/lib/storage/migrations.ts`, `src/lib/storage/transfer.ts` and `src/lib/storage/local.ts` are **not modified**. That is deliberate and is the evidence the rules did not drift.

---

### Task 1: The Lambda handler

The handler is plain ESM JavaScript, not TypeScript, so there is no bundling step — it deploys as a single file. It uses `@aws-sdk/client-dynamodb` directly with raw `AttributeValue` shapes (`{ S: '…' }`) rather than the document client, so it depends only on the one SDK package the Node 22 runtime ships.

**Validation here is a structural gate, not the authority on a valid session.** `checkTrackmanSession` in `src/lib/storage/transfer.ts` remains the real validator and still runs client-side. The handler's only job is to reject shapes that would break the client, because writes are unauthenticated (D19/D21).

**Files:**
- Create: `infra/handler.mjs`
- Test: `infra/handler.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `route(method, path)`, `validateSession(raw, id)`, `BadRequest`, `makeHandler(client, tableName)`, and a default `handler` export. Item attributes `pk`, `sk`, `doc`, `source`, `schemaVersion`, `updatedAt`.

- [ ] **Step 1: Write the failing test**

Create `infra/handler.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { BadRequest, route, validateSession, makeHandler } from './handler.mjs'

const PRACTICE = { id: 'a1', type: 'practice', date: '2026-08-05', location: 'home', entries: [] }

describe('route', () => {
  it('routes the session collection and a single session', () => {
    expect(route('GET', '/sessions')).toEqual({ kind: 'listSessions' })
    expect(route('PUT', '/sessions/a1')).toEqual({ kind: 'putSession', id: 'a1' })
    expect(route('DELETE', '/sessions/a1')).toEqual({ kind: 'deleteSession', id: 'a1' })
    expect(route('GET', '/settings')).toEqual({ kind: 'getSettings' })
  })

  it('returns null for anything else, including path traversal', () => {
    expect(route('GET', '/')).toBeNull()
    expect(route('POST', '/sessions')).toBeNull()
    expect(route('PUT', '/sessions/a1/../b2')).toBeNull()
    expect(route('GET', '/shots/a1')).toBeNull() // reserved, not implemented
  })
})

describe('validateSession', () => {
  it('accepts a well-formed practice session', () => {
    expect(validateSession(PRACTICE, 'a1')).toBe(PRACTICE)
  })

  it('rejects a body whose id does not match the path', () => {
    expect(() => validateSession(PRACTICE, 'b2')).toThrow(BadRequest)
  })

  it('rejects a trackman session with no clubs, because at least one is required', () => {
    const raw = { id: 'a1', type: 'trackman', date: '2026-08-05', clubs: [], source: 'api' }
    expect(() => validateSession(raw, 'a1')).toThrow(BadRequest)
  })

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() => validateSession({ ...PRACTICE, date: '5 Aug' }, 'a1')).toThrow(BadRequest)
  })
})

describe('handler', () => {
  /** Records commands instead of calling AWS. `reply` is what `send` resolves to. */
  function fakeClient(reply = {}) {
    const sent = []
    return { sent, send: async (command) => (sent.push(command), reply) }
  }

  const event = (method, path, body, query = {}) => ({
    rawPath: path,
    requestContext: { http: { method } },
    queryStringParameters: query,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  it('returns the stored documents, newest first', async () => {
    const client = fakeClient({
      Items: [
        {
          doc: { S: JSON.stringify({ ...PRACTICE, id: 'old', date: '2026-08-01' }) },
          schemaVersion: { N: '2' },
        },
        { doc: { S: JSON.stringify(PRACTICE) }, schemaVersion: { N: '2' } },
      ],
    })
    const res = await makeHandler(client, 'golf')(event('GET', '/sessions'))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).sessions.map((s) => s.id)).toEqual(['a1', 'old'])
    expect(JSON.parse(res.body).schemaVersion).toBe(2)
  })

  it('reports the LOWEST schemaVersion present, so a part-migrated table is visible', async () => {
    const client = fakeClient({
      Items: [
        { doc: { S: JSON.stringify(PRACTICE) }, schemaVersion: { N: '2' } },
        { doc: { S: JSON.stringify({ ...PRACTICE, id: 'old' }) }, schemaVersion: { N: '1' } },
      ],
    })
    const res = await makeHandler(client, 'golf')(event('GET', '/sessions'))
    expect(JSON.parse(res.body).schemaVersion).toBe(1)
  })

  it('reports the current version for an empty table, which is a first run, not v0', async () => {
    const res = await makeHandler(fakeClient({ Items: [] }), 'golf')(event('GET', '/sessions'))
    expect(JSON.parse(res.body)).toEqual({ sessions: [], schemaVersion: 2 })
  })

  it('rejects an invalid body with 400 and writes nothing', async () => {
    const client = fakeClient()
    const res = await makeHandler(client, 'golf')(event('PUT', '/sessions/a1', { id: 'a1' }))
    expect(res.statusCode).toBe(400)
    expect(client.sent).toHaveLength(0)
  })

  it('adds the manual condition only when ifNotManual is set', async () => {
    const bare = fakeClient()
    await makeHandler(bare, 'golf')(event('PUT', '/sessions/a1', PRACTICE))
    expect(bare.sent[0].input.ConditionExpression).toBeUndefined()

    const guarded = fakeClient()
    await makeHandler(guarded, 'golf')(event('PUT', '/sessions/a1', PRACTICE, { ifNotManual: '1' }))
    expect(guarded.sent[0].input.ConditionExpression).toBe(
      'attribute_not_exists(pk) OR #source <> :manual',
    )
  })

  it('reports a blocked manual overwrite as skipped, not as an error', async () => {
    const client = {
      send: async () => {
        const error = new Error('The conditional request failed')
        error.name = 'ConditionalCheckFailedException'
        throw error
      },
    }
    const res = await makeHandler(client, 'golf')(
      event('PUT', '/sessions/a1', PRACTICE, { ifNotManual: '1' }),
    )
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ skipped: true })
  })

  it('404s an unknown route', async () => {
    const res = await makeHandler(fakeClient(), 'golf')(event('GET', '/nope'))
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run infra/handler.test.mjs`
Expected: FAIL — `Failed to resolve import "./handler.mjs"`.

- [ ] **Step 3: Write the implementation**

Create `infra/handler.mjs`:

```js
/**
 * The golf practice store's only write path.
 *
 * **Deliberately unauthenticated** — see D19 in
 * `docs/superpowers/specs/2026-08-05-synced-storage-design.md`. Anyone may read and anyone may
 * write. The consequences are bounded by point-in-time recovery (D20), by the structural
 * validation below (D21), and by writing one item at a time so damage cannot span the history.
 *
 * **The validation here is a gate, not an authority.** `checkTrackmanSession` in
 * `src/lib/storage/transfer.ts` is the real validator and still runs in the browser. This exists
 * only so an open endpoint cannot be used to store a shape the client fails to parse — which
 * would take the site down rather than merely corrupt one record.
 *
 * Plain ESM on purpose: with no imports beyond the SDK the runtime already ships, there is
 * nothing to bundle, so the deployment artifact is this file.
 */
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Ids come from the Trackman activity id or `crypto.randomUUID()`. No slashes, no dots. */
const ID = /^[A-Za-z0-9_:-]{1,128}$/

/** Rejected before anything reaches DynamoDB. The message is shown to the user as-is. */
export class BadRequest extends Error {
  constructor(message) {
    super(message)
    this.name = 'BadRequest'
  }
}

/**
 * `/shots/{id}` is deliberately absent. The `SHOTS#<id>` key space is reserved for per-shot
 * metrics, but reserving a key space costs nothing while an unused endpoint is code to maintain.
 */
export function route(method, path) {
  if (path === '/sessions' && method === 'GET') return { kind: 'listSessions' }
  if (path === '/settings' && method === 'GET') return { kind: 'getSettings' }
  if (path === '/settings' && method === 'PUT') return { kind: 'putSettings' }

  const match = /^\/sessions\/([^/]+)$/.exec(path)
  if (match && ID.test(match[1])) {
    if (method === 'PUT') return { kind: 'putSession', id: match[1] }
    if (method === 'DELETE') return { kind: 'deleteSession', id: match[1] }
  }
  return null
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural only — see the note at the top of this file. */
export function validateSession(raw, id) {
  if (!isRecord(raw)) throw new BadRequest('The body must be a JSON object.')
  if (raw.id !== id) throw new BadRequest('The body id must match the path id.')
  if (raw.type !== 'practice' && raw.type !== 'trackman') {
    throw new BadRequest('A session must have type "practice" or "trackman".')
  }
  if (typeof raw.date !== 'string' || !ISO_DATE.test(raw.date)) {
    throw new BadRequest('A session must have a date in YYYY-MM-DD form.')
  }
  if (raw.type === 'practice' && !Array.isArray(raw.entries)) {
    throw new BadRequest('A practice session must have an entries array.')
  }
  if (raw.type === 'trackman') {
    // At least one club is required: it is the KPI and the reason the type exists.
    if (!Array.isArray(raw.clubs) || raw.clubs.length === 0) {
      throw new BadRequest('A Trackman session must carry at least one club.')
    }
    if (raw.source !== 'manual' && raw.source !== 'api') {
      throw new BadRequest('A Trackman session must record its source as "manual" or "api".')
    }
  }
  return raw
}

const SCHEMA_VERSION = 2

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function makeHandler(client, tableName) {
  const item = (pk, sk, value, source) => ({
    pk: { S: pk },
    sk: { S: sk },
    doc: { S: JSON.stringify(value) },
    // Promoted out of `doc` so the condition expression below can see it.
    source: { S: source ?? 'manual' },
    schemaVersion: { N: String(SCHEMA_VERSION) },
    updatedAt: { S: new Date().toISOString() },
  })

  return async function handler(event) {
    const method = event.requestContext?.http?.method ?? ''
    const target = route(method, event.rawPath ?? '')
    if (!target) return json(404, { message: 'No such route.' })

    let body
    if (event.body !== undefined && event.body !== null) {
      try {
        body = JSON.parse(event.body)
      } catch {
        return json(400, { message: 'The body is not valid JSON.' })
      }
    }

    try {
      switch (target.kind) {
        case 'listSessions': {
          const out = await client.send(
            new QueryCommand({
              TableName: tableName,
              KeyConditionExpression: 'pk = :pk',
              ExpressionAttributeValues: { ':pk': { S: 'SESSION' } },
            }),
          )
          const items = out.Items ?? []
          const sessions = items.map((i) => JSON.parse(i.doc.S))
          // Newest first, matching the Repository contract. Sorted here rather than by the sort
          // key: the key is the id, because the date is editable and a mutable key would make
          // an edited date insert a duplicate instead of updating in place.
          sessions.sort((a, b) => b.date.localeCompare(a.date))
          // **The lowest version present**, because a document is only as migrated as its
          // least-migrated item. Reporting the highest would let a part-migrated table claim to
          // be current and skip the migration that fixes it. An empty table is a first run, so
          // it reports the current version rather than zero.
          const versions = items.map((i) => Number(i.schemaVersion?.N ?? SCHEMA_VERSION))
          return json(200, {
            sessions,
            schemaVersion: versions.length > 0 ? Math.min(...versions) : SCHEMA_VERSION,
          })
        }

        case 'putSession': {
          const session = validateSession(body, target.id)
          // Set only by the ingest. It makes "never overwrite a manual record" hold even if the
          // script races the browser — the pure merge in ingest/merge.ts is the fast path, this
          // is the authoritative one.
          const guard = event.queryStringParameters?.ifNotManual === '1'
          await client.send(
            new PutItemCommand({
              TableName: tableName,
              Item: item('SESSION', target.id, session, session.source),
              ...(guard
                ? {
                    ConditionExpression: 'attribute_not_exists(pk) OR #source <> :manual',
                    ExpressionAttributeNames: { '#source': 'source' },
                    ExpressionAttributeValues: { ':manual': { S: 'manual' } },
                  }
                : {}),
            }),
          )
          return json(200, { ok: true })
        }

        case 'deleteSession': {
          await client.send(
            new DeleteItemCommand({
              TableName: tableName,
              Key: { pk: { S: 'SESSION' }, sk: { S: target.id } },
            }),
          )
          return json(200, { ok: true })
        }

        case 'getSettings': {
          const out = await client.send(
            new GetItemCommand({
              TableName: tableName,
              Key: { pk: { S: 'SETTINGS' }, sk: { S: 'v1' } },
            }),
          )
          return json(200, { settings: out.Item ? JSON.parse(out.Item.doc.S) : {} })
        }

        case 'putSettings': {
          if (!isRecord(body)) return json(400, { message: 'Settings must be a JSON object.' })
          await client.send(
            new PutItemCommand({ TableName: tableName, Item: item('SETTINGS', 'v1', body) }),
          )
          return json(200, { ok: true })
        }

        default:
          return json(404, { message: 'No such route.' })
      }
    } catch (error) {
      // The expected outcome when the ingest meets a hand-typed record, not a failure. Reported
      // as a skip so the workflow log can say so rather than showing an error for correct
      // behaviour.
      if (error.name === 'ConditionalCheckFailedException') return json(200, { skipped: true })
      if (error instanceof BadRequest) return json(400, { message: error.message })
      console.error(error)
      return json(500, { message: 'The store could not complete that request.' })
    }
  }
}

export const handler = makeHandler(new DynamoDBClient({}), process.env.TABLE_NAME)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run infra/handler.test.mjs`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the full suite and the type check**

Run: `npm test && npm run check`
Expected: PASS. `infra/` is outside `tsconfig.json`'s `include`, so `svelte-check` ignores it — the handler is covered by its tests, not by the type checker.

- [ ] **Step 6: Commit**

```bash
git add infra/handler.mjs infra/handler.test.mjs
git commit -m "Add the Lambda handler for the remote store"
```

---

### Task 2: Infrastructure, deployed and verified

The template is committed; the deploy is run by hand. Deploying from CI would need AWS credentials in a public repo, which is the one thing D22 avoids entirely.

**Files:**
- Create: `infra/template.yaml`, `infra/README.md`

**Interfaces:**
- Consumes: `infra/handler.mjs` from Task 1.
- Produces: a live Function URL, recorded as `VITE_API_URL`. Table `golf` in `ap-southeast-2`.

**Free tier:** already established — the account **postdates** the mid-2025 restructure, so it holds expiring credits and no perpetual allowances. Everything is costed at list price and the total is ~$0.026/month. Nothing in this task depends on a free tier, and credit expiry changes nothing.

- [ ] **Step 1: Write the SAM template**

Create `infra/template.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: golf.whitfield.life practice store

Parameters:
  AlarmEmail:
    Type: String
    Description: Address to notify if estimated charges exceed one dollar.

Resources:
  Table:
    Type: AWS::DynamoDB::Table
    # Retain on stack delete. The table is the only copy of the practice log once localStorage
    # is demoted to a cache; a mistyped `sam delete` must not be able to destroy it.
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      TableName: golf
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: pk
          AttributeType: S
        - AttributeName: sk
          AttributeType: S
      KeySchema:
        - AttributeName: pk
          KeyType: HASH
        - AttributeName: sk
          KeyType: RANGE
      # D20. With writes unauthenticated this is the only thing between a bad write and
      # permanent loss, so it is mandatory rather than a nicety.
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true

  Api:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: golf-store
      CodeUri: ./
      Handler: handler.handler
      Runtime: nodejs22.x
      MemorySize: 256
      Timeout: 10
      Environment:
        Variables:
          TABLE_NAME: !Ref Table
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref Table
      FunctionUrlConfig:
        # D19: no authentication, by explicit decision.
        AuthType: NONE
        Cors:
          # A convenience, not a control — it lets the browser make the call and prevents
          # nothing, since the ingest workflow's PUT never passes through a browser.
          AllowOrigins:
            - https://golf.whitfield.life
            - http://localhost:5173
          AllowMethods: [GET, PUT, DELETE]
          AllowHeaders: [content-type]

  BillingTopic:
    Type: AWS::SNS::Topic
    Properties:
      Subscription:
        - Protocol: email
          Endpoint: !Ref AlarmEmail

  # The real cost risk is misconfiguration, not usage. Usage is costed at about 2p a month.
  BillingAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: golf-estimated-charges
      Namespace: AWS/Billing
      MetricName: EstimatedCharges
      Dimensions:
        - Name: Currency
          Value: USD
      Statistic: Maximum
      Period: 21600
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanThreshold
      AlarmActions:
        - !Ref BillingTopic

Outputs:
  ApiUrl:
    Description: Public Function URL. Not a secret — it ships in the client bundle.
    Value: !GetAtt ApiUrl.FunctionUrl
```

- [ ] **Step 2: Write the deploy and restore notes**

Create `infra/README.md`:

```markdown
# Infrastructure

One DynamoDB table behind one Lambda Function URL. Deployed by hand, never from CI —
deploying from a public repo's Actions would require AWS credentials, and this design
otherwise needs none (D22).

## Deploy

    cd infra
    sam build
    sam deploy --guided --region ap-southeast-2 --stack-name golf-store

`--guided` asks for `AlarmEmail`. Confirm the SNS subscription from your inbox, or the
billing alarm cannot notify you.

The stack outputs `ApiUrl`. Put it in `.env` as `VITE_API_URL` and in the repository
variable `API_URL` (Settings → Secrets and variables → Actions → **Variables**, not
Secrets — the URL is public by design and filing it as a secret would blur the rule).

## Restore

Writes are unauthenticated by decision (D19), so point-in-time recovery is the safety net.

    aws dynamodb restore-table-to-point-in-time \
      --source-table-name golf \
      --target-table-name golf-restored \
      --restore-date-time 2026-08-05T09:00:00Z

Restore beside the live table, check it, then swap. Never restore over `golf`.

The `Retain` deletion policy means `sam delete` leaves the table behind on purpose.
```

- [ ] **Step 3: Deploy**

Run:
```bash
cd infra && sam build && sam deploy --guided --region ap-southeast-2 --stack-name golf-store
```
Expected: `CREATE_COMPLETE`, and an `ApiUrl` output. Confirm the SNS subscription email.

- [ ] **Step 4: Verify the deployed runtime end to end**

This step exists to catch the one deployment assumption worth checking: that `@aws-sdk/client-dynamodb` resolves inside the Node 22 runtime without bundling.

Run, substituting the output URL:
```bash
API=https://xxxx.lambda-url.ap-southeast-2.on.aws
curl -sS "$API/sessions"
curl -sS -X PUT "$API/sessions/smoke-1" -H 'content-type: application/json' \
  -d '{"id":"smoke-1","type":"practice","date":"2026-08-05","location":"home","entries":[]}'
curl -sS "$API/sessions"
curl -sS -X PUT "$API/sessions/smoke-1" -H 'content-type: application/json' -d '{"id":"smoke-1"}'
curl -sS -X DELETE "$API/sessions/smoke-1"
```
Expected: `{"sessions":[]}`, then `{"ok":true}`, then the session listed, then a **400** with a readable message, then `{"ok":true}`.

**If the first call 500s with a module-resolution error**, the runtime does not ship the SDK. Fix by adding to `infra/package.json` a dependency on `@aws-sdk/client-dynamodb` and letting `sam build` install it — the handler code does not change.

- [ ] **Step 5: Confirm PITR and the alarm**

DynamoDB console → table `golf` → **Backups**: point-in-time recovery **On**.
CloudWatch → Alarms: `golf-estimated-charges` present and not in `INSUFFICIENT_DATA` after six hours.

- [ ] **Step 6: Commit**

```bash
git add infra/template.yaml infra/README.md
git commit -m "Add the SAM stack for the remote store"
```

---

### Task 3: `RemoteRepo`

**Files:**
- Create: `src/lib/storage/remote.ts`
- Test: `src/lib/storage/remote.test.ts`

**Interfaces:**
- Consumes: `Repository`, `Settings`, `StoreDocument`, `ImportSummary`, `emptyDocument` from `./repository`; `mergeTrackmanSessions` from `../ingest/merge`; `parseDocument`, `mergeDocuments` from `./transfer`; `SCHEMA_VERSION` from `./migrations`.
- Produces: `class RemoteRepo implements Repository`, constructed as `new RemoteRepo(baseUrl, fetcher?)`. Also `RemoteStoreError`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/remote.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Session } from '../domain/types'
import { RemoteRepo } from './remote'

const PRACTICE: Session = {
  id: 'a1',
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [],
}

/** Records requests and replies from a queue. No network, no AWS. */
function fakeFetch(replies: Array<{ status?: number; body?: unknown; text?: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const reply = replies.shift() ?? { body: {} }
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      text: async () => reply.text ?? JSON.stringify(reply.body ?? {}),
    } as Response
  }) as unknown as typeof fetch
  return { calls, fetcher }
}

describe('RemoteRepo', () => {
  it('lists sessions from the store', async () => {
    const { calls, fetcher } = fakeFetch([{ body: { sessions: [PRACTICE] } }])
    const repo = new RemoteRepo('https://api.example', fetcher)
    expect(await repo.listSessions()).toEqual([PRACTICE])
    expect(calls[0].url).toBe('https://api.example/sessions')
  })

  it('PUTs a session to its own id', async () => {
    const { calls, fetcher } = fakeFetch([{ body: { ok: true } }])
    await new RemoteRepo('https://api.example', fetcher).saveSession(PRACTICE)
    expect(calls[0].url).toBe('https://api.example/sessions/a1')
    expect(calls[0].init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(PRACTICE)
  })

  it('throws on a write failure rather than reporting success', async () => {
    const { fetcher } = fakeFetch([{ status: 500, body: { message: 'nope' } }])
    await expect(
      new RemoteRepo('https://api.example', fetcher).saveSession(PRACTICE),
    ).rejects.toThrow(/nope/)
  })

  it('runs the migration chain over what the store reports', async () => {
    // v1 → v2 is an identity migration, so the observable effect is that a v1 document is
    // accepted and normalised rather than rejected. The guard that matters is the next one.
    const { fetcher } = fakeFetch([{ body: { sessions: [PRACTICE], schemaVersion: 1 } }])
    expect(await new RemoteRepo('https://api.example', fetcher).listSessions()).toEqual([PRACTICE])
  })

  it('refuses a document written by a newer build rather than mangling it', async () => {
    const { fetcher } = fakeFetch([{ body: { sessions: [PRACTICE], schemaVersion: 99 } }])
    await expect(
      new RemoteRepo('https://api.example', fetcher).listSessions(),
    ).rejects.toThrow(/version 99/)
  })

  it('records a fault and refuses writes when the store returns unparseable JSON', async () => {
    const { fetcher } = fakeFetch([{ text: '<html>gateway</html>' }, { body: { ok: true } }])
    const repo = new RemoteRepo('https://api.example', fetcher)
    await expect(repo.listSessions()).rejects.toThrow()
    expect(repo.faultMessage).not.toBeNull()
    await expect(repo.saveSession(PRACTICE)).rejects.toThrow(/Refusing/)
  })

  it('sets ifNotManual only on the Trackman merge path', async () => {
    const trackman: Session = {
      id: 't1',
      type: 'trackman',
      date: '2026-08-05',
      clubs: [{ club: 'DRIVER', typical: -3.2, best: -1.1, n: 12 }],
      source: 'api',
    }
    const { calls, fetcher } = fakeFetch([{ body: { sessions: [] } }, { body: { ok: true } }])
    const result = await new RemoteRepo('https://api.example', fetcher).mergeTrackman([trackman])
    expect(result.added).toBe(1)
    expect(calls[1].url).toBe('https://api.example/sessions/t1?ifNotManual=1')
  })

  it('reports no change when the merge finds nothing new, and writes nothing', async () => {
    const trackman: Session = {
      id: 't1',
      type: 'trackman',
      date: '2026-08-05',
      clubs: [{ club: 'DRIVER', typical: -3.2, best: -1.1, n: 12 }],
      source: 'api',
    }
    const { calls, fetcher } = fakeFetch([{ body: { sessions: [trackman] } }])
    const result = await new RemoteRepo('https://api.example', fetcher).mergeTrackman([trackman])
    expect(result.changed).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/storage/remote.test.ts`
Expected: FAIL — cannot resolve `./remote`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage/remote.ts`:

```ts
import type { Session, TrackmanSession } from '../domain/types'
import { mergeTrackmanSessions, type TrackmanMergeResult } from '../ingest/merge'
import { SCHEMA_VERSION, migrate } from './migrations'
import type { ImportSummary, Repository, Settings, StoreDocument } from './repository'
import { mergeDocuments, parseDocument } from './transfer'

/** Every failure to reach or read the store. Carries a message meant for the user. */
export class RemoteStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemoteStoreError'
  }
}

const UNREADABLE =
  'The practice store returned something this build cannot read. Nothing has been changed.'

/**
 * The `Repository` implementation over the Lambda Function URL.
 *
 * **Thin on purpose.** Caching, cold-start rendering and the seed all live in `CachedRepo`, so
 * this class is a plain HTTP client that a fake `fetch` can exercise completely.
 *
 * `fetch` is injected for the tests, and because this class also runs in Node under the ingest
 * workflow, where the global is present but worth being explicit about.
 */
export class RemoteRepo implements Repository {
  readonly #base: string
  readonly #fetch: typeof fetch
  #fault: string | null = null

  constructor(baseUrl: string, fetcher: typeof fetch = globalThis.fetch) {
    // A trailing slash would produce `//sessions`, which the route table does not match.
    this.#base = baseUrl.replace(/\/+$/, '')
    this.#fetch = fetcher
  }

  get faultMessage(): string | null {
    return this.#fault
  }

  /**
   * **Migrations still run, and still operate on a whole document.** The store reports the lowest
   * `schemaVersion` among its items, and that assembled document goes through the same `migrate()`
   * chain the local store uses — so "bump the version and write a migration" keeps working now
   * that the data lives remotely. Settings are migrated by `exportDocument()`, which is the only
   * path that has them to hand; a future migration that touches `settings` must therefore be
   * written to tolerate an absent one here.
   */
  async listSessions(): Promise<Session[]> {
    const body = await this.#request<{ sessions: Session[]; schemaVersion?: number }>(
      'GET',
      '/sessions',
    )
    const doc = migrate({
      schemaVersion: body.schemaVersion ?? SCHEMA_VERSION,
      sessions: body.sessions,
      settings: {},
    })
    // The handler already sorts, but the contract is this method's to keep, not the server's.
    return doc.sessions.slice().sort((a, b) => b.date.localeCompare(a.date))
  }

  async saveSession(session: Session): Promise<void> {
    await this.#write(`/sessions/${encodeURIComponent(session.id)}`, session)
  }

  async deleteSession(id: string): Promise<void> {
    this.#guard()
    await this.#request('DELETE', `/sessions/${encodeURIComponent(id)}`)
  }

  async getSettings(): Promise<Settings> {
    const body = await this.#request<{ settings: Settings }>('GET', '/settings')
    return { ...body.settings }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.#write('/settings', settings)
  }

  /**
   * Assembled into the same `StoreDocument` the local store exports, so **existing exports stay
   * importable and existing imports keep working**. `schemaVersion` is the document's, not any
   * item's — migrations operate on whole documents and this keeps that true.
   */
  async exportDocument(): Promise<StoreDocument> {
    // Both reads happen FIRST — they are what *detect* a fault. Checking beforehand only sees one
    // left by an earlier call, so a fresh instance over a broken store would hand back an empty
    // document as though it were a successful backup. `LocalStorageRepo.exportDocument` carries
    // the same ordering, and for the same reason.
    const sessions = await this.listSessions()
    const settings = await this.getSettings()
    if (this.#fault) throw new RemoteStoreError(this.#fault)
    return { schemaVersion: SCHEMA_VERSION, sessions, settings }
  }

  async importDocument(raw: unknown): Promise<ImportSummary> {
    const incoming = parseDocument(raw)
    const current = await this.exportDocument()
    const { doc, summary } = mergeDocuments(current, incoming)
    // Only what changed. Rewriting untouched sessions would burn write units and churn
    // `updatedAt` on records nobody edited.
    const before = new Map(current.sessions.map((s) => [s.id, JSON.stringify(s)]))
    for (const session of doc.sessions) {
      if (before.get(session.id) !== JSON.stringify(session)) await this.saveSession(session)
    }
    if (JSON.stringify(current.settings) !== JSON.stringify(doc.settings)) {
      await this.saveSettings(doc.settings)
    }
    return summary
  }

  /**
   * The same pure merge the local store uses — one implementation of "never overwrite a manual
   * record", covered by one set of tests.
   *
   * `?ifNotManual=1` makes the database enforce it too. The merge below is a read-then-write, so
   * a browser save landing between the read and the write would otherwise slip past it.
   */
  async mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult> {
    const current = await this.listSessions()
    const result = mergeTrackmanSessions(current, incoming)
    if (!result.changed) return result

    const before = new Map(current.map((s) => [s.id, JSON.stringify(s)]))
    for (const session of result.sessions) {
      if (before.get(session.id) === JSON.stringify(session)) continue
      await this.#write(`/sessions/${encodeURIComponent(session.id)}?ifNotManual=1`, session)
    }
    return result
  }

  /** Nothing is quarantined remotely — an unreadable response is not a stored document. */
  async readQuarantine(): Promise<string | null> {
    return null
  }

  #guard(): void {
    if (this.#fault) throw new RemoteStoreError(`Refusing to write: ${this.#fault}`)
  }

  async #write(path: string, value: unknown): Promise<void> {
    this.#guard()
    await this.#request('PUT', path, value)
  }

  async #request<T>(method: string, path: string, value?: unknown): Promise<T> {
    let res: Response
    try {
      res = await this.#fetch(`${this.#base}${path}`, {
        method,
        ...(value === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }),
      })
    } catch (error) {
      throw new RemoteStoreError(
        `Could not reach the practice store: ${error instanceof Error ? error.message : 'unknown'}`,
      )
    }

    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      // A gateway error page, a redirect, a truncated response. Treated as a fault so writes
      // stop, rather than as an empty store — the same instinct as the local quarantine.
      this.#fault = UNREADABLE
      throw new RemoteStoreError(UNREADABLE)
    }

    if (!res.ok) {
      const message =
        typeof (body as { message?: unknown })?.message === 'string'
          ? (body as { message: string }).message
          : `The practice store returned HTTP ${res.status}.`
      throw new RemoteStoreError(message)
    }

    this.#fault = null
    return body as T
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/storage/remote.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and the type check**

Run: `npm test && npm run check`
Expected: PASS, with `merge.test.ts` and `aggregate.test.ts` still green and untouched.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/remote.ts src/lib/storage/remote.test.ts
git commit -m "Add RemoteRepo over the Function URL"
```

---

### Task 4: `CachedRepo`

**Files:**
- Create: `src/lib/storage/cached.ts`
- Test: `src/lib/storage/cached.test.ts`

**Interfaces:**
- Consumes: `RemoteRepo` (Task 3) and `LocalStorageRepo` (existing), both as `Repository`.
- Produces: `class CachedRepo implements Repository`, constructed as `new CachedRepo(remote, cache)`. Adds `refresh(): Promise<void>` and `stale: boolean` beyond the interface.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/cached.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Session } from '../domain/types'
import { CachedRepo } from './cached'
import { LocalStorageRepo } from './local'
import type { Repository } from './repository'

const CACHED: Session = {
  id: 'c1', type: 'practice', date: '2026-08-01', location: 'home', entries: [],
}
const FRESH: Session = {
  id: 'r1', type: 'practice', date: '2026-08-05', location: 'home', entries: [],
}

/** In-memory Storage, so the tests run in Node with no jsdom. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

function fakeRemote(sessions: Session[], failing = false): Repository & { saved: Session[] } {
  const saved: Session[] = []
  return {
    saved,
    faultMessage: null,
    listSessions: async () => {
      if (failing) throw new Error('offline')
      return sessions
    },
    saveSession: async (s) => void saved.push(s),
    deleteSession: async () => {},
    getSettings: async () => ({}),
    saveSettings: async () => {},
    exportDocument: async () => ({ schemaVersion: 2, sessions, settings: {} }),
    importDocument: async () => ({ added: 0, updated: 0 }),
    mergeTrackman: async () => ({ sessions, added: 0, updated: 0, skipped: 0, changed: false }),
    readQuarantine: async () => null,
  }
}

describe('CachedRepo', () => {
  it('returns the cache immediately, then the remote after a refresh', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const repo = new CachedRepo(fakeRemote([FRESH]), cache)

    expect(await repo.listSessions()).toEqual([CACHED])
    await repo.refresh()
    expect(await repo.listSessions()).toEqual([FRESH])
  })

  it('writes to the remote first, then mirrors into the cache', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    const remote = fakeRemote([])
    const repo = new CachedRepo(remote, cache)

    await repo.saveSession(FRESH)
    expect(remote.saved).toEqual([FRESH])
    expect(await cache.listSessions()).toEqual([FRESH])
  })

  it('serves the cache and reports staleness when the remote read fails', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const repo = new CachedRepo(fakeRemote([], true), cache)

    await repo.refresh()
    expect(await repo.listSessions()).toEqual([CACHED])
    expect(repo.stale).toBe(true)
  })

  it('seeds the remote from the cache when a successful read finds it empty', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const remote = fakeRemote([])
    await new CachedRepo(remote, cache).refresh()
    expect(remote.saved).toEqual([CACHED])
  })

  it('never seeds after a failed read, however empty the result looks', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const remote = fakeRemote([], true)
    await new CachedRepo(remote, cache).refresh()
    expect(remote.saved).toEqual([])
  })

  it('does not let an unreadable cache block a write', async () => {
    const storage = fakeStorage()
    storage.setItem('golf:store', '{ not json')
    const remote = fakeRemote([])
    const repo = new CachedRepo(remote, new LocalStorageRepo(storage))

    await repo.saveSession(FRESH)
    expect(remote.saved).toEqual([FRESH])
    expect(repo.faultMessage).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/storage/cached.test.ts`
Expected: FAIL — cannot resolve `./cached`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage/cached.ts`:

```ts
import type { Session, TrackmanSession } from '../domain/types'
import type { TrackmanMergeResult } from '../ingest/merge'
import { STORAGE_KEY } from './migrations'
import type { ImportSummary, Repository, Settings, StoreDocument } from './repository'

/**
 * The remote store, with a `localStorage` read cache in front of it.
 *
 * **Remote is the record; the cache exists so the page paints.** Reads answer from the cache and
 * then `refresh()` replaces it. Writes go to the remote *first* and are mirrored afterwards — a
 * write that reached only the cache would look saved and would not be.
 *
 * A decorator rather than caching baked into `RemoteRepo`, so the network layer stays a thin
 * fake-able HTTP client and this policy is testable on its own.
 */
export class CachedRepo implements Repository {
  readonly #remote: Repository
  readonly #cache: Repository
  #stale = false

  constructor(remote: Repository, cache: Repository) {
    this.#remote = remote
    this.#cache = cache
  }

  /** True when the last refresh could not reach the store, so reads are serving cached data. */
  get stale(): boolean {
    return this.#stale
  }

  /**
   * **Only the remote's fault gates writes.** `LocalStorageRepo` refuses every write once it
   * cannot read its own document — correct when it is the only copy, wrong when it is a cache,
   * because an unreadable cache would then block saves the remote would have accepted.
   */
  get faultMessage(): string | null {
    return this.#remote.faultMessage
  }

  async listSessions(): Promise<Session[]> {
    try {
      return await this.#cache.listSessions()
    } catch {
      return this.#remote.listSessions()
    }
  }

  async getSettings(): Promise<Settings> {
    try {
      return await this.#cache.getSettings()
    } catch {
      return this.#remote.getSettings()
    }
  }

  /**
   * Pull the remote into the cache. Call after mount; never block first paint on it.
   *
   * Seeds the remote from the cache when — and only when — a **successful** read comes back
   * empty. A failed read and an empty store are the same value and very different meanings;
   * treating a network error as "nothing there yet" would re-upload on every load.
   */
  async refresh(): Promise<void> {
    let sessions: Session[]
    let settings: Settings
    try {
      sessions = await this.#remote.listSessions()
      settings = await this.#remote.getSettings()
      this.#stale = false
    } catch {
      this.#stale = true
      return
    }

    if (sessions.length === 0) {
      const local = await this.#cacheSessions()
      if (local.length > 0) {
        for (const session of local) await this.#remote.saveSession(session)
        return
      }
    }

    await this.#replaceCache({ sessions, settings })
  }

  async saveSession(session: Session): Promise<void> {
    await this.#remote.saveSession(session)
    await this.#mirror(() => this.#cache.saveSession(session))
  }

  async deleteSession(id: string): Promise<void> {
    await this.#remote.deleteSession(id)
    await this.#mirror(() => this.#cache.deleteSession(id))
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.#remote.saveSettings(settings)
    await this.#mirror(() => this.#cache.saveSettings(settings))
  }

  async exportDocument(): Promise<StoreDocument> {
    return this.#remote.exportDocument()
  }

  async importDocument(raw: unknown): Promise<ImportSummary> {
    const summary = await this.#remote.importDocument(raw)
    await this.refresh()
    return summary
  }

  async mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult> {
    const result = await this.#remote.mergeTrackman(incoming)
    if (result.changed) await this.refresh()
    return result
  }

  /** The local quarantine is still worth offering — it may hold sessions the seed never saw. */
  async readQuarantine(): Promise<string | null> {
    return this.#cache.readQuarantine()
  }

  async #cacheSessions(): Promise<Session[]> {
    try {
      return await this.#cache.listSessions()
    } catch {
      return []
    }
  }

  /**
   * An unreadable cache is discarded and rebuilt rather than quarantined a second time — the
   * local repo already took its copy on the failing read, and the remote holds the real data.
   */
  async #replaceCache(doc: { sessions: Session[]; settings: Settings }): Promise<void> {
    await this.#mirror(async () => {
      if (this.#cache.faultMessage) this.#clearCacheKey()
      for (const session of doc.sessions) await this.#cache.saveSession(session)
      await this.#cache.saveSettings(doc.settings)
    })
  }

  #clearCacheKey(): void {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch {
      // Blocked site data. The cache is optional; the remote is authoritative.
    }
  }

  /**
   * Cache failures are swallowed by design — private browsing, blocked cookies, a full quota.
   * A missing cache is a performance problem, not a data one, because the write already landed
   * remotely. This is the one place in the app where swallowing is correct.
   */
  async #mirror(write: () => Promise<void>): Promise<void> {
    try {
      await write()
    } catch {
      // Deliberately silent — see above.
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/storage/cached.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full suite and the type check**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/cached.ts src/lib/storage/cached.test.ts
git commit -m "Add CachedRepo, the read cache in front of the remote store"
```

---

### Task 5: Seed the table from `public/trackman.json`

Two seeds are needed and they come from different places. The 91 Trackman sessions live in the repo and are seeded by this script. The practice sessions live only in the user's browser and are seeded by `CachedRepo.refresh()`, built in Task 4 and wired up in Task 6.

**Files:**
- Create: `scripts/seed-remote.ts`
- Modify: `package.json` (add the `seed` script)

**Interfaces:**
- Consumes: `RemoteRepo` (Task 3), `parsePublished` from `src/lib/ingest/published.ts` (still present until Task 8).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the script**

Create `scripts/seed-remote.ts`:

```ts
/**
 * One-off: push the committed Trackman history into the remote store.
 *
 * **The file being retired is the migration source.** `public/trackman.json` is already in the
 * right shape, needs no refresh token, and exercises none of the undocumented API — so the seed
 * is verifiable by comparing counts against a file that can simply be read.
 *
 *   API_URL=https://xxxx.lambda-url.ap-southeast-2.on.aws npm run seed
 *
 * Idempotent: `mergeTrackman` is keyed on the activity id, so a second run adds nothing.
 */
import { readFileSync } from 'node:fs'
import { RemoteRepo } from '../src/lib/storage/remote'
import { parsePublished } from '../src/lib/ingest/published'

const IN = 'public/trackman.json'

function fail(message: string): never {
  console.error(`::error::${message}`)
  process.exit(1)
}

const url = process.env.API_URL
if (!url) fail('Set API_URL to the Function URL.')

const sessions = parsePublished(JSON.parse(readFileSync(IN, 'utf8')))
console.log(`${IN} holds ${sessions.length} session(s).`)

const result = await new RemoteRepo(url).mergeTrackman(sessions)
console.log(`Seeded: ${result.added} added · ${result.updated} updated · ${result.skipped} skipped.`)

const stored = await new RemoteRepo(url).listSessions()
const trackman = stored.filter((s) => s.type === 'trackman')
if (trackman.length !== sessions.length) {
  fail(`Seeded ${trackman.length} but the file holds ${sessions.length}. Investigate before continuing.`)
}
console.log(`Verified: ${trackman.length} Trackman session(s) in the store.`)
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` after `"ingest"`:

```json
    "seed": "tsx scripts/seed-remote.ts"
```

- [ ] **Step 3: Run the seed**

Run, substituting the Function URL from Task 2:
```bash
API_URL=https://xxxx.lambda-url.ap-southeast-2.on.aws npm run seed
```
Expected: `public/trackman.json holds 91 session(s).`, then `Seeded: 91 added · 0 updated · 0 skipped.`, then `Verified: 91 Trackman session(s) in the store.`

If the counts disagree, the script fails loudly. Do not proceed to Task 6 until they match.

- [ ] **Step 4: Verify idempotence**

Run the same command again.
Expected: `Seeded: 0 added · 0 updated · 0 skipped.` and the same verified count.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-remote.ts package.json
git commit -m "Add the one-off seed from the published Trackman file"
```

---

### Task 6: Point the app at the remote store

After this task the site is live on DynamoDB. `public/trackman.json` is still committed and still deployed, but nothing reads it — that is what makes Task 8 safe.

**Files:**
- Create: `src/env.d.ts`, `.env.example`
- Modify: `src/lib/stores/sessions.svelte.ts`

**Interfaces:**
- Consumes: `CachedRepo` (Task 4), `RemoteRepo` (Task 3), `LocalStorageRepo` (existing).
- Produces: `sessions.stale` on the store, for the UI to surface.

- [ ] **Step 1: Type the environment variable**

Create `src/env.d.ts`:

```ts
interface ImportMetaEnv {
  /**
   * The Lambda Function URL. **Public by design** — it ships in `dist/` and is not a secret,
   * which is why it is a repository *variable* rather than a secret (D19, D22).
   */
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

Create `.env.example`:

```
# The Function URL from `sam deploy` (infra/README.md). Public, not a secret.
VITE_API_URL=https://xxxx.lambda-url.ap-southeast-2.on.aws
```

- [ ] **Step 2: Write the failing check**

There is no unit test for the store — it is a Svelte rune module, and D8 puts UI outside the test boundary. The gate is the type checker.

Run: `npm run check`
Expected: PASS now; it must still pass after Step 3.

- [ ] **Step 3: Rewire the store**

In `src/lib/stores/sessions.svelte.ts`:

Replace the two ingest/storage imports:

```ts
import { LocalStorageRepo } from '../storage/local'
import { fetchPublished } from '../ingest/published'
```

with:

```ts
import { CachedRepo } from '../storage/cached'
import { LocalStorageRepo } from '../storage/local'
import { RemoteRepo } from '../storage/remote'
```

Replace the constructor default:

```ts
  constructor(repo: Repository = new LocalStorageRepo()) {
```

with:

```ts
  /**
   * The one place the app decides where data lives — the entire justification for the async
   * interface, cashed in. `CachedRepo` paints from `localStorage` and refreshes from DynamoDB.
   */
  constructor(
    repo: Repository = new CachedRepo(
      new RemoteRepo(import.meta.env.VITE_API_URL),
      new LocalStorageRepo(),
    ),
  ) {
```

Add a `stale` rune beside `warning`:

```ts
  /** True when the store could not be reached and the view is showing cached data. */
  stale = $state(false)
```

Replace the whole `syncPublished()` method with `sync()`:

```ts
  /**
   * Pull the remote into the cache after first paint.
   *
   * **Never awaited by the caller and never allowed to throw.** The plan page needs no stored
   * data at all, and a store that cannot be reached must degrade to cached, read-only viewing
   * rather than a blank site.
   *
   * Note the asymmetry with `save()`, which deliberately *does* throw: a failed refresh shows
   * stale data, while a failed save would silently lose a session.
   */
  async sync(): Promise<void> {
    try {
      const repo = this.#repo
      if (!(repo instanceof CachedRepo)) return
      await repo.refresh()
      this.stale = repo.stale
      await this.load()
    } catch {
      // Silent by design. The cached view is still usable.
      this.stale = true
    }
  }
```

Update `load()` to carry staleness through:

```ts
  async load(): Promise<void> {
    this.list = await this.#repo.listSessions()
    this.settings = await this.#repo.getSettings()
    this.warning = this.#repo.faultMessage
    this.ready = true
  }
```

(unchanged — listed so it is not accidentally edited).

- [ ] **Step 4: Update the caller**

Run: `rg -n 'syncPublished' src/`
Expected: one or more `.svelte` call sites. Rename each `syncPublished()` call to `sync()`. Do not add `await` — the call stays fire-and-forget.

- [ ] **Step 5: Verify**

Run: `npm run check && npm test && npm run build`
Expected: all PASS. `rg -n 'syncPublished' src/` returns nothing.

- [ ] **Step 6: Test in the browser**

Run: `VITE_API_URL=https://xxxx.lambda-url.ap-southeast-2.on.aws npm run dev`

Check, in order:
1. `/progress` shows the 91 seeded Trackman sessions.
2. Log a practice session on `/log`; reload; it is still there.
3. In DevTools, delete the `golf:store` key and reload — the session reappears from DynamoDB.
4. Go offline in DevTools and reload — the page still renders from cache.

- [ ] **Step 7: Set the production variable and deploy**

Add `VITE_API_URL` to the deploy workflow's build step environment, sourced from the repository **variable** `API_URL` (not a secret). In `.github/workflows/deploy.yml`, on the `npm run build` step:

```yaml
        env:
          VITE_API_URL: ${{ vars.API_URL }}
```

- [ ] **Step 8: Commit and verify the live site**

```bash
git add src/env.d.ts .env.example src/lib/stores/sessions.svelte.ts .github/workflows/deploy.yml src/
git commit -m "Read and write practice data through the remote store"
git push
```

Then open `https://golf.whitfield.life/progress` and confirm the charts render the seeded history. **This is a live site — do not proceed until it is verified.**

---

### Task 7: Repoint the ingest workflow

**Files:**
- Modify: `scripts/trackman-ingest.ts`, `.github/workflows/trackman.yml`

**Interfaces:**
- Consumes: `RemoteRepo` (Task 3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite the script's sink**

In `scripts/trackman-ingest.ts`, replace the imports:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ApiSource } from '../src/lib/ingest/api'
import { mergeTrackmanSessions } from '../src/lib/ingest/merge'
import { PUBLISHED_FORMAT_VERSION, parsePublished } from '../src/lib/ingest/published'
import { resolveISODate } from '../src/lib/domain/today'
import type { ISODate, TrackmanSession } from '../src/lib/domain/types'
```

with:

```ts
import { ApiSource } from '../src/lib/ingest/api'
import { RemoteRepo } from '../src/lib/storage/remote'
import { resolveISODate } from '../src/lib/domain/today'
import type { ISODate, TrackmanSession } from '../src/lib/domain/types'
```

Delete the `DEFAULT_OUT` constant and the whole `existing()` function.

Replace the body of `main()` from `const out = arg('out') ?? DEFAULT_OUT` onwards:

```ts
async function main(): Promise<void> {
  const token = process.env.TRACKMAN_REFRESH_TOKEN
  if (!token) fail('Set TRACKMAN_REFRESH_TOKEN.')

  const url = process.env.API_URL
  if (!url) fail('Set API_URL to the Function URL.')

  const from = since()

  const unknownClubs = new Set<string>()
  const source = new ApiSource(token)

  let fetched: TrackmanSession[]
  try {
    fetched = await source.fetchSince(from, (name) => unknownClubs.add(name))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The pull failed for an unknown reason.')
  }

  for (const name of unknownClubs) {
    console.log(`::warning::Unmapped club "${name}" — its strokes were skipped. Add it to src/lib/domain/clubs.ts.`)
  }

  // The same merge the browser uses, against the store rather than a file. `?ifNotManual=1` is
  // added inside `mergeTrackman`, so a hand-typed record survives even if a save from the phone
  // lands between the read and the write.
  let result
  try {
    result = await new RemoteRepo(url).mergeTrackman(fetched)
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The store could not be written.')
  }

  console.log(
    `Pulled from ${from}: ${fetched.length} session(s) measured · ` +
      `${result.added} new · ${result.updated} updated · ${result.skipped} skipped.`,
  )
}
```

Update the file's top comment: replace the `--out` line of the usage example with `npm run ingest -- --since 2025-06-01`, and replace "writes them to the published data file" with "writes them to the practice store". Remove the `--out` mention from the sentence about argument parsing.

- [ ] **Step 2: Verify the script still type-checks**

Run: `npm run check && npm test`
Expected: PASS. `published.ts` is now unused by the script but still imported by `seed-remote.ts`, so it stays until Task 8.

- [ ] **Step 3: Simplify the workflow**

In `.github/workflows/trackman.yml`:

Change the top-level `permissions: {}` comment block to keep `permissions: {}` as-is, then **delete the entire `Commit if the data changed` step**, the `outputs:` block on the `ingest` job, the `permissions: contents: write` on the `ingest` job, and the whole `publish` job.

Replace the `Pull sessions` step's `env:` block with:

```yaml
        env:
          TRACKMAN_REFRESH_TOKEN: ${{ secrets.TRACKMAN_REFRESH_TOKEN }}
          API_URL: ${{ vars.API_URL }}
          SINCE: ${{ inputs.since }}
```

Add above the `ingest:` job, replacing the old comment about publishing:

```yaml
# The job no longer commits anything, so it needs no write permission and no publish step:
# the data goes straight into the store and the deployed site reads it at runtime. `API_URL`
# is a repository *variable*, not a secret — it is public by design and ships in the bundle.
```

Keep the `checkout`, `setup-node` and `npm ci` steps, the pinned action SHAs, the `concurrency` block, and the `SINCE` handling through `env:` exactly as they are. **Never interpolate `inputs.since` into `run:`.**

- [ ] **Step 4: Verify the workflow parses**

Run: `rg -n 'contents: write|publish:|trackman.json' .github/workflows/trackman.yml`
Expected: no matches.

- [ ] **Step 5: Commit and run it**

```bash
git add scripts/trackman-ingest.ts .github/workflows/trackman.yml
git commit -m "Write ingested Trackman sessions to the store, not a file"
git push
```

Then trigger it by hand: Actions → *Pull Trackman sessions* → **Run workflow**, `since` blank.
Expected: green, with a log line reporting counts. Confirm on `https://golf.whitfield.life/progress` that nothing was lost.

- [ ] **Step 6: Wait for two scheduled runs**

**Do not start Task 8 until two consecutive daily runs have gone green.** This is the gate that makes deleting `public/trackman.json` safe.

---

### Task 8: Retire the published file and update the documentation

**Files:**
- Delete: `src/lib/ingest/published.ts`, `src/lib/ingest/published.test.ts`, `public/trackman.json`
- Modify: `scripts/seed-remote.ts` (delete — its source is gone), `package.json`, `CLAUDE.md`, `docs/architecture.md`, `docs/roadmap.md`

- [ ] **Step 1: Confirm the gate**

Run: `gh run list --workflow 'Pull Trackman sessions' --limit 3`
Expected: at least two consecutive `completed success` runs since Task 7. If not, stop and wait.

- [ ] **Step 2: Confirm nothing reads the file**

Run: `rg -n 'trackman\.json|published' src/ scripts/`
Expected: only `scripts/seed-remote.ts` and `src/lib/ingest/published.*`. Anything else means a live reader remains — fix it before deleting.

- [ ] **Step 3: Delete**

```bash
git rm src/lib/ingest/published.ts src/lib/ingest/published.test.ts public/trackman.json scripts/seed-remote.ts
```

Remove the `"seed"` line from `package.json`'s `scripts`.

- [ ] **Step 4: Verify**

Run: `npm run check && npm test && npm run build`
Expected: all PASS.

Run: `ls dist/CNAME dist/404.html`
Expected: both present. The deploy workflow asserts these; losing either drops the custom domain or 404s every deep link.

- [ ] **Step 5: Update `CLAUDE.md`**

Under **Things to be careful about**, replace the bullet beginning "**`localStorage` is the only copy of the user's practice data.**" with:

```markdown
- **DynamoDB is the record; `localStorage` is a cache.** Reads paint from the cache and refresh
  from the store; writes go remote-first. A failed *read* degrades to stale cached data and must
  never blank the site. A failed *write* must **throw** — silently losing a session is the one
  failure mode `localStorage` never had. JSON export/import stays as the offline escape hatch.
- **Writes are unauthenticated, by explicit decision (D19).** Anyone who has the Function URL can
  overwrite or delete a session. What bounds that is point-in-time recovery (35 days), the
  handler's structural validation, and writing one item at a time. Never widen the handler to
  accept a shape it does not validate, and never turn PITR off.
```

Under **Current state**, replace the sentence describing `public/trackman.json` with a description of the ingest writing to the store via the Function URL. Under **Deployment**, add:

```markdown
- **`VITE_API_URL` is public and is not a secret.** It ships in `dist/` because the browser must
  call it. It is a repository *variable*, never an Actions secret — filing a non-secret as a
  secret blurs the rule that matters.
```

- [ ] **Step 6: Update `docs/architecture.md`**

- Amend **D2** to record that storage moved to DynamoDB and that the async interface is what made it a contained change.
- Add **D18–D26** exactly as listed in §3 of the spec.
- In §2, update the `src/lib/storage/` and `src/lib/ingest/` file lists: add `remote.ts` and `cached.ts`, remove `published.ts`, and add the `infra/` directory.
- Rewrite §4's "What gets published, and why only that" and "Automated pull" subsections for the new sink. **Keep** the data notes verified against 5,877 real strokes, the merge rules, and the fragility warning — none of those changed.
- Update the "Deliberately excluded (YAGNI)" list to note that "no server database" was deliberately reversed, and why.

- [ ] **Step 7: Update `docs/roadmap.md`**

- Set **Last updated** to the current date.
- Under **Where things stand**, replace the `public/trackman.json` bullet and the `localStorage` bullet.
- Mark **OQ-3** resolved, linking this plan and the spec, and record the two pieces of evidence that finally justified it.
- Add a **Phase 6 · Synced storage — done** section in the style of Phases 3 and 4, including the decisions that changed during implementation.
- Add a line under the **next** phase noting that per-shot metrics are unblocked and that the `SHOTS#` key space is reserved.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Retire the published Trackman file"
git push
```

- [ ] **Step 9: Verify the live site one last time**

Open `https://golf.whitfield.life`, `/log` and `/progress`. Confirm the plan page renders, the log lists sessions, and the progress charts show the full 13-month history. Confirm `https://golf.whitfield.life/trackman.json` now 404s and that nothing on the site broke as a result.

---

## Notes for the implementer

- **Do not "fix" the store's refusal to write when it cannot read.** In `LocalStorageRepo` that behaviour is deliberate and stays. `CachedRepo` neutralises it only in the cache role, where an unreadable cache must not block a save the remote would accept.
- **`ingest/merge.ts` and `ingest/aggregate.ts` must not be modified by any task.** If a change seems necessary, the design is wrong — stop and raise it.
- **`best` means the reading closest to neutral, never `Math.max`.** Nothing in this plan touches that code, but do not let a refactor drift into it.
- **The target is a band, not a maximum.** Any progress visual keeps fault regions on both sides.
