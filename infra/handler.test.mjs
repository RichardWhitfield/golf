import { describe, expect, it } from 'vitest'
// The test deliberately sits OUTSIDE `function/`, which is the directory that gets zipped and
// deployed. `aws cloudformation package` archives the whole CodeUri directory, so a test file
// living beside the handler would ship to production.
import { BadRequest, route, validateSession, makeHandler } from './function/handler.mjs'

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
