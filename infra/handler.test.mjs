import { describe, expect, it } from 'vitest'
// The test deliberately sits OUTSIDE `function/`, which is the directory that gets zipped and
// deployed. `aws cloudformation package` archives the whole CodeUri directory, so a test file
// living beside the handler would ship to production.
import {
  BadRequest,
  route,
  validateSession,
  validateShots,
  validateDestinations,
  makeHandler,
} from './function/handler.mjs'

const PRACTICE = { id: 'a1', type: 'practice', date: '2026-08-05', location: 'home', entries: [] }

describe('route', () => {
  it('routes the session collection and a single session', () => {
    expect(route('GET', '/sessions')).toEqual({ kind: 'listSessions' })
    expect(route('PUT', '/sessions/a1')).toEqual({ kind: 'putSession', id: 'a1' })
    expect(route('DELETE', '/sessions/a1')).toEqual({ kind: 'deleteSession', id: 'a1' })
    expect(route('GET', '/settings')).toEqual({ kind: 'getSettings' })
  })

  it('routes the destinations pair, mirroring settings', () => {
    expect(route('GET', '/destinations')).toEqual({ kind: 'getDestinations' })
    expect(route('PUT', '/destinations')).toEqual({ kind: 'putDestinations' })
  })

  it('has no per-course destinations route', () => {
    // One small document, read whole and written whole (D38). A route per course would buy write
    // granularity a single user does not need.
    expect(route('PUT', '/destinations/kingston-heath')).toBeNull()
    expect(route('DELETE', '/destinations')).toBeNull()
    expect(route('POST', '/destinations')).toBeNull()
  })

  it('returns null for anything else, including path traversal', () => {
    expect(route('GET', '/')).toBeNull()
    expect(route('POST', '/sessions')).toBeNull()
    expect(route('PUT', '/sessions/a1/../b2')).toBeNull()
  })

  it('decodes a real Trackman id, which is 88-character base64 ending in "="', () => {
    // rawPath arrives percent-encoded, verified against the deployed Function URL. The first
    // version of this route matched an allowlisted charset that omitted "=" and rejected all
    // 86 real sessions — the seed found it, not the tests.
    const id =
      'VmlydHVhbFJhbmdlU2Vzc2lvbkFjdGl2aXR5CmRjNTlkNzkzMS1kNjQ0LTU1OTQtYTEyMC04ZTIzOTA5MDQ1MmU='
    expect(route('PUT', `/sessions/${encodeURIComponent(id)}`)).toEqual({
      kind: 'putSession',
      id,
    })
  })

  it('keeps an encoded slash inside one segment and decodes it back', () => {
    // Base64 can emit "/", and it is harmless as an identifier — the id only ever becomes a
    // DynamoDB sort key, never a path.
    expect(route('DELETE', '/sessions/ab%2Fcd')).toEqual({ kind: 'deleteSession', id: 'ab/cd' })
  })

  it('rejects a malformed percent sequence rather than throwing', () => {
    expect(route('PUT', '/sessions/%zz')).toBeNull()
  })

  it('rejects an over-long id and one carrying control characters', () => {
    expect(route('PUT', `/sessions/${'a'.repeat(513)}`)).toBeNull()
    expect(route('PUT', '/sessions/a%00b')).toBeNull()
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

describe('the shots routes', () => {
  it('routes a put and a get, and nothing else', () => {
    expect(route('PUT', '/shots/a1')).toEqual({ kind: 'putShots', id: 'a1' })
    expect(route('GET', '/shots/a1')).toEqual({ kind: 'getShots', id: 'a1' })
    expect(route('DELETE', '/shots/a1')).toBeNull()
    expect(route('PUT', '/shots')).toBeNull()
  })

  it('decodes a real Trackman id the same way the session routes do', () => {
    // 88-character base64 ending in "=". Validating these against an invented charset rejected
    // all 86 real sessions once; the rule is safety, not format.
    const id =
      'VmlydHVhbFJhbmdlU2Vzc2lvbkFjdGl2aXR5CmRjNTlkNzkzMS1kNjQ0LTU1OTQtYTEyMC04ZTIzOTA5MDQ1MmU='
    expect(route('PUT', `/shots/${encodeURIComponent(id)}`)).toEqual({ kind: 'putShots', id })
  })
})

describe('validateShots', () => {
  it('accepts an array of shots with a club and finite readings', () => {
    const shots = [{ club: 'DRIVER', time: '2026-07-27T08:00:00Z', metrics: { clubPath: -6 } }]
    expect(validateShots({ shots })).toEqual(shots)
  })

  it('accepts a reading of exactly zero, which is the target, not a missing value', () => {
    // A club path of 0.00 deg is a perfectly neutral swing — the number this whole app exists
    // to reach. A truthiness guard would reject it as though it were absent.
    const shots = [{ club: 'DRIVER', metrics: { clubPath: 0, faceToPath: 0 } }]
    expect(validateShots({ shots })).toEqual(shots)
  })

  it('accepts an empty array — a session where nothing was measured', () => {
    expect(validateShots({ shots: [] })).toEqual([])
  })

  it('rejects a body that is not a shots array', () => {
    expect(() => validateShots({})).toThrow(BadRequest)
    expect(() => validateShots({ shots: 'lots' })).toThrow(BadRequest)
  })

  it('rejects a shot with no club, since a reading with no club is meaningless', () => {
    // Club path without a club tracks nothing: a mixed-club figure follows club selection.
    expect(() => validateShots({ shots: [{ metrics: { clubPath: -6 } }] })).toThrow(BadRequest)
  })

  it('rejects a non-finite reading rather than storing a NaN the client cannot render', () => {
    expect(() =>
      validateShots({ shots: [{ club: 'DRIVER', metrics: { clubPath: 'left' } }] }),
    ).toThrow(BadRequest)
  })

  it('refuses a batch far larger than any real session', () => {
    // The largest real session is 225 strokes. This bounds an open endpoint (D19), it is not a
    // statement about the data.
    const shots = Array.from({ length: 2001 }, () => ({ club: 'DRIVER', metrics: {} }))
    expect(() => validateShots({ shots })).toThrow(BadRequest)
  })

  it('accepts a shot carrying a reduced-accuracy flag', () => {
    const shots = [{ club: 'DRIVER', metrics: { spinRate: 5500 }, reducedAccuracy: ['SpinRate'] }]
    expect(validateShots({ shots })).toEqual(shots)
  })

  it('rejects a reduced-accuracy value that is not an array of strings', () => {
    expect(() =>
      validateShots({ shots: [{ club: 'DRIVER', metrics: {}, reducedAccuracy: 'SpinRate' }] }),
    ).toThrow(BadRequest)
    expect(() =>
      validateShots({ shots: [{ club: 'DRIVER', metrics: {}, reducedAccuracy: [7] }] }),
    ).toThrow(BadRequest)
  })

  it('still rejects a non-numeric reading inside metrics', () => {
    expect(() =>
      validateShots({ shots: [{ club: 'DRIVER', metrics: { spinRate: 'lots' } }] }),
    ).toThrow(BadRequest)
  })
})

describe('validateDestinations', () => {
  it('accepts the two statuses, with and without a date and a note', () => {
    const notes = {
      'kingston-heath': { status: 'played', playedOn: '2026-03-11', note: 'Windy.' },
      'barnbougle-dunes': { status: 'want' },
    }
    expect(validateDestinations(notes)).toEqual(notes)
  })

  it('accepts an empty map — every course un-marked', () => {
    expect(validateDestinations({})).toEqual({})
  })

  it('does not check a slug against the course list', () => {
    // This function has no business knowing the hundred. A ranking that dropped a course would
    // otherwise strand every mark made against it, and the list would have to be redeployed by
    // hand each time it moved. Shape, not membership.
    expect(validateDestinations({ 'a-course-that-is-not-in-the-top-100': { status: 'want' } })).toEqual(
      { 'a-course-that-is-not-in-the-top-100': { status: 'want' } },
    )
  })

  it('rejects a body that is not an object', () => {
    expect(() => validateDestinations([])).toThrow(BadRequest)
    expect(() => validateDestinations('want')).toThrow(BadRequest)
    expect(() => validateDestinations(undefined)).toThrow(BadRequest)
  })

  it('rejects a mark that is not an object', () => {
    expect(() => validateDestinations({ 'kingston-heath': 'want' })).toThrow(BadRequest)
    expect(() => validateDestinations({ 'kingston-heath': null })).toThrow(BadRequest)
  })

  it('rejects any status but the two, including a third meaning "no opinion"', () => {
    // An absent key is how a course carries no opinion. A `'none'` status would be a second way
    // to say it, and the two would have to be kept in step everywhere a mark is read.
    expect(() => validateDestinations({ 'kingston-heath': {} })).toThrow(BadRequest)
    expect(() => validateDestinations({ 'kingston-heath': { status: 'none' } })).toThrow(BadRequest)
    expect(() => validateDestinations({ 'kingston-heath': { status: 1 } })).toThrow(BadRequest)
  })

  it('rejects a played-on date that is not YYYY-MM-DD', () => {
    expect(() =>
      validateDestinations({ 'kingston-heath': { status: 'played', playedOn: '11/03/2026' } }),
    ).toThrow(BadRequest)
  })

  it('rejects a note that is not text, and one that is too long', () => {
    expect(() => validateDestinations({ 'kingston-heath': { status: 'want', note: 7 } })).toThrow(
      BadRequest,
    )
    expect(() =>
      validateDestinations({ 'kingston-heath': { status: 'want', note: 'x'.repeat(501) } }),
    ).toThrow(BadRequest)
  })

  it('rejects an over-long slug and an empty one', () => {
    expect(() => validateDestinations({ ['x'.repeat(129)]: { status: 'want' } })).toThrow(BadRequest)
    expect(() => validateDestinations({ '': { status: 'want' } })).toThrow(BadRequest)
  })

  it('rejects more marks than there are courses to mark', () => {
    const many = {}
    for (let i = 0; i < 201; i++) many[`course-${i}`] = { status: 'want' }
    expect(() => validateDestinations(many)).toThrow(BadRequest)
  })

  it('rejects an unknown field, which is what actually bounds the item', () => {
    // Caps on the note, the slug and the count mean nothing if an arbitrary field can carry a
    // megabyte beside them, and writes here are unauthenticated (D19).
    expect(() =>
      validateDestinations({ 'kingston-heath': { status: 'want', padding: 'x'.repeat(100000) } }),
    ).toThrow(BadRequest)
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
    expect(JSON.parse(res.body)).toEqual({ sessions: [], schemaVersion: 5 })
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

  it('reads the destinations singleton, and an absent item is an empty map', async () => {
    const empty = await makeHandler(fakeClient({}), 'golf')(event('GET', '/destinations'))
    expect(JSON.parse(empty.body)).toEqual({ destinations: {} })

    const stored = fakeClient({ Item: { doc: { S: '{"kingston-heath":{"status":"want"}}' } } })
    const res = await makeHandler(stored, 'golf')(event('GET', '/destinations'))
    expect(JSON.parse(res.body)).toEqual({ destinations: { 'kingston-heath': { status: 'want' } } })
    expect(stored.sent[0].input.Key).toEqual({ pk: { S: 'DESTINATIONS' }, sk: { S: 'v1' } })
  })

  it('writes the whole map to one item beside settings', async () => {
    const client = fakeClient()
    const notes = { 'kingston-heath': { status: 'played', playedOn: '2026-03-11' } }
    const res = await makeHandler(client, 'golf')(event('PUT', '/destinations', notes))
    expect(res.statusCode).toBe(200)
    expect(client.sent[0].input.Item.pk).toEqual({ S: 'DESTINATIONS' })
    expect(client.sent[0].input.Item.sk).toEqual({ S: 'v1' })
    expect(JSON.parse(client.sent[0].input.Item.doc.S)).toEqual(notes)
    expect(client.sent[0].input.Item.schemaVersion).toEqual({ N: '5' })
  })

  it('rejects a malformed destinations body with 400 and writes nothing', async () => {
    const client = fakeClient()
    const res = await makeHandler(client, 'golf')(
      event('PUT', '/destinations', { 'kingston-heath': { status: 'maybe' } }),
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).message).toMatch(/want.*played/)
    expect(client.sent).toHaveLength(0)
  })

  it('404s an unknown route', async () => {
    const res = await makeHandler(fakeClient(), 'golf')(event('GET', '/nope'))
    expect(res.statusCode).toBe(404)
  })
})
