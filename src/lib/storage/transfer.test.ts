import { describe, expect, it } from 'vitest'
import {
  InvalidImportError,
  exportFilename,
  mergeDocuments,
  parseDocument,
  serialiseDocument,
} from './transfer'
import { SCHEMA_VERSION } from './migrations'
import { emptyDocument, type StoreDocument } from './repository'
import type { PracticeSession, Session, TrackmanSession } from '../domain/types'

const session = (id: string, over: Partial<PracticeSession> = {}): PracticeSession => ({
  id,
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
  ...over,
})

// `unknown[]` in, `Session[]` out: half these tests deliberately pass malformed records, which is
// the point — `parseDocument` is the thing that decides whether they are sessions at all.
const doc = (sessions: unknown[], settings = {}): StoreDocument => ({
  schemaVersion: SCHEMA_VERSION,
  sessions: sessions as Session[],
  settings,
})

const trackman = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  type: 'trackman',
  date: '2026-07-27',
  source: 'api',
  clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }],
  ...over,
})

describe('parseDocument · Trackman sessions', () => {
  it('accepts one', () => {
    expect(parseDocument(doc([trackman()])).sessions[0]).toEqual(trackman())
  })

  it('accepts one with no shot count, drills or notes', () => {
    const bare = trackman({ clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2 }] })
    expect(parseDocument(doc([bare])).sessions[0]).toEqual(bare)
  })

  it('keeps a positive club path exactly as stored', () => {
    // +3 is in-to-out. Real, if unlikely on this player. Never coerce the sign.
    const s = trackman({ clubs: [{ club: 'IRON7', typical: 3.1, best: 0.4 }] })
    const parsed = parseDocument(doc([s])).sessions[0] as TrackmanSession
    expect(parsed.clubs[0].typical).toBe(3.1)
    expect(parsed.clubs[0].best).toBe(0.4)
  })

  it('sorts clubs into bag order', () => {
    const s = trackman({
      clubs: [
        { club: 'SAND_WEDGE', typical: -8, best: -4 },
        { club: 'DRIVER', typical: -7, best: -1 },
      ],
    })
    const parsed = parseDocument(doc([s])).sessions[0] as TrackmanSession
    expect(parsed.clubs.map((c) => c.club)).toEqual(['DRIVER', 'SAND_WEDGE'])
  })

  it('keeps drills worked when they are valid', () => {
    const s = trackman({ drillsWorked: ['01', '04'] })
    expect(parseDocument(doc([s])).sessions[0]).toMatchObject({ drillsWorked: ['01', '04'] })
  })

  it('rejects a club this app does not know', () => {
    const s = trackman({ clubs: [{ club: 'SPOON', typical: -1, best: -1 }] })
    expect(() => parseDocument(doc([s]))).toThrow(InvalidImportError)
  })

  it('rejects a session with no clubs', () => {
    expect(() => parseDocument(doc([trackman({ clubs: [] })]))).toThrow(/no club-path/)
  })

  it('rejects the same club twice in one session', () => {
    const s = trackman({
      clubs: [
        { club: 'DRIVER', typical: -1, best: -1 },
        { club: 'DRIVER', typical: -2, best: -2 },
      ],
    })
    expect(() => parseDocument(doc([s]))).toThrow(/twice/)
  })

  it('rejects an unknown source', () => {
    expect(() => parseDocument(doc([trackman({ source: 'guess' })]))).toThrow(/source/)
  })

  it('rejects a path beyond any real swing', () => {
    const s = trackman({ clubs: [{ club: 'DRIVER', typical: -400, best: -1 }] })
    expect(() => parseDocument(doc([s]))).toThrow(/implausible/)
  })

  it('rejects a non-numeric or infinite path', () => {
    for (const typical of ['-7.5', null, Number.POSITIVE_INFINITY, Number.NaN]) {
      const s = trackman({ clubs: [{ club: 'DRIVER', typical, best: -1 }] })
      expect(() => parseDocument(doc([s]))).toThrow(InvalidImportError)
    }
  })

  it('rejects a shot count that is not a positive integer', () => {
    for (const n of [2.5, 0, -3, '26']) {
      const s = trackman({ clubs: [{ club: 'DRIVER', typical: -1, best: -1, n }] })
      expect(() => parseDocument(doc([s]))).toThrow(/shot count/)
    }
  })

  it('rejects a drill that does not exist', () => {
    expect(() => parseDocument(doc([trackman({ drillsWorked: ['99'] })]))).toThrow(/drill/)
  })

  it('names an unknown session type rather than calling it "not a practice session"', () => {
    expect(() => parseDocument(doc([trackman({ type: 'round' })]))).toThrow(/round/)
  })

  it('merges by id across both session types', () => {
    const stored = parseDocument(doc([trackman()]))
    const incoming = parseDocument(doc([trackman({ notes: 'edited' })]))
    const { doc: merged, summary } = mergeDocuments(stored, incoming)
    expect(merged.sessions).toHaveLength(1)
    expect(summary).toEqual({ added: 0, updated: 1 })
  })

  it('round-trips through serialise and parse', () => {
    const original = parseDocument(doc([session('a'), trackman()]))
    expect(parseDocument(JSON.parse(serialiseDocument(original)))).toEqual(original)
  })

  it('preserves the wider metrics through an export and import round trip', () => {
    // The reason for the version bump: a build that drops `metrics` on import would lose them
    // silently, and the loss would only show up as charts quietly going empty.
    const doc = {
      schemaVersion: 3,
      sessions: [
        { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
          clubs: [{
            club: 'DRIVER', typical: -5.4, best: -0.19, n: 618,
            metrics: { swingPlane: { typical: 49.75, n: 666 }, faceToPath: { typical: 4.36, best: 0.97, n: 556 } },
          }] },
      ],
      settings: {},
    }
    const parsed = parseDocument(doc)
    expect(parsed.sessions[0]).toMatchObject({
      clubs: [{ metrics: { swingPlane: { typical: 49.75, n: 666 } } }],
    })
  })

  it('rejects a metric reading with a non-finite typical', () => {
    const doc = {
      schemaVersion: 3,
      sessions: [
        { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
          clubs: [{ club: 'DRIVER', typical: -5.4, best: -0.19, n: 618,
                    metrics: { swingPlane: { typical: 'steep', n: 4 } } }] },
      ],
      settings: {},
    }
    expect(() => parseDocument(doc)).toThrow()
  })

  it('drops a metric it does not know, rather than storing a name it cannot chart', () => {
    const doc = {
      schemaVersion: 3,
      sessions: [
        { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
          clubs: [{ club: 'DRIVER', typical: -5.4, best: -0.19, n: 618,
                    metrics: { swingDirection: { typical: -8, n: 4 } } }] },
      ],
      settings: {},
    }
    expect(parseDocument(doc).sessions[0]).toMatchObject({ clubs: [{ metrics: {} }] })
  })
})

describe('parseDocument', () => {
  it('accepts a well-formed export', () => {
    expect(parseDocument(doc([session('a')]))).toEqual(doc([session('a')]))
  })

  it('accepts a document with no sessions', () => {
    expect(parseDocument(doc([])).sessions).toEqual([])
  })

  it('rejects a file that is not a document', () => {
    for (const raw of [null, 'text', 42, []]) {
      expect(() => parseDocument(raw)).toThrow(InvalidImportError)
    }
  })

  it('rejects a session missing an id', () => {
    const bad = { ...session('a'), id: '' }
    expect(() => parseDocument(doc([bad]))).toThrow(InvalidImportError)
  })

  it('rejects a session with an unknown drill id', () => {
    const bad = session('a', { entries: [{ drillId: '99' as never, swings: 1, feel: 3 }] })
    expect(() => parseDocument(doc([bad]))).toThrow(InvalidImportError)
  })

  it('rejects a session with an out-of-range feel', () => {
    const bad = session('a', { entries: [{ drillId: '01', swings: 1, feel: 9 as never }] })
    expect(() => parseDocument(doc([bad]))).toThrow(InvalidImportError)
  })

  it('rejects a session with a malformed date', () => {
    expect(() => parseDocument(doc([session('a', { date: '5 Aug' })]))).toThrow(InvalidImportError)
  })

  it('rejects a session with an unknown location', () => {
    expect(() => parseDocument(doc([session('a', { location: 'range' as never })]))).toThrow(
      InvalidImportError,
    )
  })

  it('rejects the whole file when one session of many is bad', () => {
    const bad = { ...session('b'), location: 'range' }
    expect(() => parseDocument(doc([session('a'), bad as PracticeSession]))).toThrow(
      InvalidImportError,
    )
  })

  it('rejects duplicate ids within one file', () => {
    expect(() => parseDocument(doc([session('a'), session('a')]))).toThrow(InvalidImportError)
  })

  it('explains why it refused', () => {
    expect(() => parseDocument('text')).toThrow(/not a practice-log export/i)
  })
})

describe('mergeDocuments', () => {
  it('adds sessions that are not already stored', () => {
    const { doc: merged, summary } = mergeDocuments(doc([session('a')]), doc([session('b')]))
    expect(merged.sessions.map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(summary).toEqual({ added: 1, updated: 0 })
  })

  it('updates a session whose id is already stored', () => {
    const { doc: merged, summary } = mergeDocuments(
      doc([session('a')]),
      doc([session('a', { location: 'course' })]),
    )
    expect(merged.sessions).toHaveLength(1)
    expect(merged.sessions[0]).toMatchObject({ location: 'course' })
    expect(summary).toEqual({ added: 0, updated: 1 })
  })

  it('never drops a stored session that the file does not mention', () => {
    const { doc: merged } = mergeDocuments(doc([session('keep')]), doc([]))
    expect(merged.sessions.map((s) => s.id)).toEqual(['keep'])
  })

  it('takes the block start when the store has none', () => {
    const { doc: merged } = mergeDocuments(doc([]), doc([], { blockStart: '2026-08-03' }))
    expect(merged.settings.blockStart).toBe('2026-08-03')
  })

  it('keeps the block start the store already had', () => {
    const { doc: merged } = mergeDocuments(
      doc([], { blockStart: '2026-08-03' }),
      doc([], { blockStart: '2026-01-01' }),
    )
    expect(merged.settings.blockStart).toBe('2026-08-03')
  })

  it('does not mutate either input', () => {
    const current = doc([session('a')])
    const incoming = doc([session('b')])
    mergeDocuments(current, incoming)
    expect(current.sessions).toHaveLength(1)
    expect(incoming.sessions).toHaveLength(1)
  })

  it('stamps the result with the current schema version', () => {
    expect(mergeDocuments(emptyDocument(), emptyDocument()).doc.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('serialiseDocument', () => {
  it('produces JSON that parses back to the same document', () => {
    const original = doc([session('a')], { blockStart: '2026-08-03' })
    expect(JSON.parse(serialiseDocument(original))).toEqual(original)
  })

  it('is indented, so the file is readable if it ever needs hand-editing', () => {
    expect(serialiseDocument(emptyDocument())).toContain('\n  ')
  })
})

describe('exportFilename', () => {
  it('names the file after the date it was taken', () => {
    expect(exportFilename('2026-08-04')).toBe('golf-practice-2026-08-04.json')
  })
})
