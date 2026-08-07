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

/**
 * Longer than any real id, short enough that nobody can use the path as a storage channel.
 * Trackman activity ids are 88 characters; `crypto.randomUUID()` is 36.
 */
const MAX_ID = 512

/**
 * **`rawPath` arrives percent-encoded** — verified against the deployed Function URL, where
 * `/sessions/a%3Ab` reaches the handler with the `%3A` intact. The id must therefore be decoded
 * before it is compared with the body's `id` or used as a sort key, or every Trackman session
 * fails: their ids are 88-character base64 ending in `=`, which `encodeURIComponent` escapes.
 *
 * Returns `null` for anything unusable, which the caller turns into a 404.
 */
function decodeId(raw) {
  let id
  try {
    id = decodeURIComponent(raw)
  } catch {
    // A malformed percent sequence — `decodeURIComponent` throws URIError on e.g. '%zz'.
    return null
  }
  if (id.length === 0 || id.length > MAX_ID) return null
  // Control characters only. **Not a charset allowlist**: these ids are opaque values from a
  // system we do not control, and enumerating "valid" characters guessed wrong once already —
  // the first version excluded base64 padding and rejected all 86 real sessions. The id becomes
  // a DynamoDB attribute, never a file path or a URL, so nothing else here is dangerous.
  // Escapes are explicit rather than literal control characters, which vanish in a diff.
  if (/[\u0000-\u001f\u007f]/.test(id)) return null
  return id
}

/** Kept in step with `SCHEMA_VERSION` in `src/lib/storage/migrations.ts`. */
const SCHEMA_VERSION = 3

/** Rejected before anything reaches DynamoDB. The message is shown to the user as-is. */
export class BadRequest extends Error {
  constructor(message) {
    super(message)
    this.name = 'BadRequest'
  }
}

/**
 * `/shots/{id}` holds the per-shot record, in its own item so no chart downloads it (D24).
 *
 * `GET` exists because a write nobody can read back is unverifiable, and this project's rule is
 * to verify a deploy before calling the work done. There is no `DELETE`: the ingest is the only
 * writer and nothing reads shots back, so an orphaned item costs a few KB and nothing else.
 * Note that `deleteSession` removes only the `SESSION` item — **deleting a session leaves its
 * shots behind.**
 */
export function route(method, path) {
  if (path === '/sessions' && method === 'GET') return { kind: 'listSessions' }
  if (path === '/settings' && method === 'GET') return { kind: 'getSettings' }
  if (path === '/settings' && method === 'PUT') return { kind: 'putSettings' }

  // `[^/]+` deliberately: an encoded slash (`%2F`) stays inside one segment and decodes back to
  // a literal slash, which is fine as an identifier because it only ever becomes a sort key.
  const session = /^\/sessions\/([^/]+)$/.exec(path)
  if (session) {
    const id = decodeId(session[1])
    if (id !== null) {
      if (method === 'PUT') return { kind: 'putSession', id }
      if (method === 'DELETE') return { kind: 'deleteSession', id }
    }
  }

  const shots = /^\/shots\/([^/]+)$/.exec(path)
  if (shots) {
    const id = decodeId(shots[1])
    if (id !== null) {
      if (method === 'PUT') return { kind: 'putShots', id }
      if (method === 'GET') return { kind: 'getShots', id }
    }
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

/**
 * Longer than any real session. The largest in thirteen months is 225 strokes; this bounds what
 * an open endpoint (D19) can be made to store, and is not a claim about the data.
 */
const MAX_SHOTS = 2000

/** Structural only — a gate against shapes the client cannot parse, not a second authority. */
export function validateShots(raw) {
  if (!isRecord(raw)) throw new BadRequest('The body must be a JSON object.')
  if (!Array.isArray(raw.shots)) throw new BadRequest('The body must carry a shots array.')
  if (raw.shots.length > MAX_SHOTS) {
    throw new BadRequest(`A session may not carry more than ${MAX_SHOTS} shots.`)
  }
  for (const shot of raw.shots) {
    if (!isRecord(shot)) throw new BadRequest('Every shot must be an object.')
    // A reading with no club tracks club selection rather than swing change (OQ-7). The club
    // name itself is the client's to police; this only insists there is one.
    if (typeof shot.club !== 'string' || shot.club === '') {
      throw new BadRequest('Every shot must name a club.')
    }
    if (shot.time !== undefined && typeof shot.time !== 'string') {
      throw new BadRequest('A shot time must be a string.')
    }
    if (!isRecord(shot.metrics)) throw new BadRequest('Every shot must carry a metrics object.')
    for (const value of Object.values(shot.metrics)) {
      // Absent is fine and expected; a NaN or a string is a shape the client cannot render.
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequest('Every shot reading must be a finite number.')
      }
    }
  }
  return raw.shots
}

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

        case 'putShots': {
          const shots = validateShots(body)
          await client.send(
            new PutItemCommand({
              TableName: tableName,
              Item: item(`SHOTS#${target.id}`, 'v1', shots, 'api'),
            }),
          )
          return json(200, { ok: true, count: shots.length })
        }

        case 'getShots': {
          const out = await client.send(
            new GetItemCommand({
              TableName: tableName,
              Key: { pk: { S: `SHOTS#${target.id}` }, sk: { S: 'v1' } },
            }),
          )
          return json(200, { shots: out.Item ? JSON.parse(out.Item.doc.S) : [] })
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
