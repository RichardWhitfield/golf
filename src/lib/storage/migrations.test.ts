import { describe, expect, it } from 'vitest'
import { FutureSchemaError, SCHEMA_VERSION, UnreadableStoreError, migrate } from './migrations'
import { emptyDocument } from './repository'
import type { PracticeSession, TrackmanSession } from '../domain/types'

const session: PracticeSession = {
  id: 'a',
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
}

const trackman: TrackmanSession = {
  id: 't1',
  type: 'trackman',
  date: '2026-07-27',
  source: 'api',
  clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }],
}

describe('SCHEMA_VERSION', () => {
  it('is at version 5', () => {
    expect(SCHEMA_VERSION).toBe(5)
  })
})

describe('migrate', () => {
  it('passes a current-version document through', () => {
    const doc = {
      schemaVersion: SCHEMA_VERSION,
      sessions: [session],
      settings: { blockStart: '2026-08-03' },
      destinations: { 'kingston-heath': { status: 'want' as const } },
    }
    expect(migrate(doc)).toEqual(doc)
  })

  it('fills in missing sessions, settings and destinations rather than failing', () => {
    expect(migrate({ schemaVersion: SCHEMA_VERSION })).toEqual(emptyDocument())
  })

  it('refuses a sessions field that is present but not an array', () => {
    // The distinction that matters: absent means first run, malformed means damage. Collapsing
    // the second into an empty log would discard the user's only copy of their history.
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: 'corrupt' })).toThrow(
      UnreadableStoreError,
    )
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: 42 })).toThrow(
      UnreadableStoreError,
    )
  })

  it('refuses a settings field that is present but not an object', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: [], settings: 42 })).toThrow(
      UnreadableStoreError,
    )
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: [], settings: [] })).toThrow(
      UnreadableStoreError,
    )
  })

  it('refuses a destinations field that is present but not an object', () => {
    // Same distinction as sessions and settings: absent is a document written before marks
    // existed, malformed is damage. Zeroing the second would delete marks without a word.
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, destinations: 'corrupt' })).toThrow(
      UnreadableStoreError,
    )
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, destinations: [] })).toThrow(
      UnreadableStoreError,
    )
  })

  it('refuses a document written by a newer build', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, sessions: [], settings: {} })).toThrow(
      FutureSchemaError,
    )
  })

  it('refuses anything that is not an object', () => {
    for (const raw of [null, undefined, 42, 'text', []]) {
      expect(() => migrate(raw)).toThrow(UnreadableStoreError)
    }
  })

  it('refuses a document with no usable version', () => {
    expect(() => migrate({ sessions: [] })).toThrow(UnreadableStoreError)
    expect(() => migrate({ schemaVersion: 0 })).toThrow(UnreadableStoreError)
    expect(() => migrate({ schemaVersion: 'one' })).toThrow(UnreadableStoreError)
    expect(() => migrate({ schemaVersion: 1.5 })).toThrow(UnreadableStoreError)
  })

  it('rejects a negative version before it can reach the migration loop', () => {
    expect(() => migrate({ schemaVersion: -1 })).toThrow(UnreadableStoreError)
  })

  it('runs the migration loop for real, now that a registered step exists', () => {
    // The predecessor of this test noted that while SCHEMA_VERSION was 1 the loop body was
    // unreachable. It is reachable now: a v1 document takes the 1 → 2 → 3 → 4 → 5 steps.
    const v1 = {
      schemaVersion: 1,
      sessions: [session],
      settings: { blockStart: '2026-07-20' },
    }
    const doc = migrate(v1)
    expect(doc.schemaVersion).toBe(5)
    // 1 → 2 → 3 → 4 is identity: v1 held only practice sessions, and those are unchanged, while
    // 2 → 3 and 3 → 4 only ever widen an optional field. 4 → 5 adds the empty map and nothing
    // else, so everything authored in v1 arrives untouched.
    expect(doc.sessions).toEqual([session])
    expect(doc.settings).toEqual({ blockStart: '2026-07-20' })
    expect(doc.destinations).toEqual({})
  })

  it('carries a Trackman session through a v2 round trip', () => {
    const v2 = {
      schemaVersion: 2,
      sessions: [trackman],
      settings: {},
    }
    expect(migrate(v2).sessions).toEqual([trackman])
  })

  it('refuses a document from one version ahead, which is the whole point of the bump', () => {
    // The v5 build deployed today does exactly this when it meets a v6 document: refuses, does
    // not quarantine, and tells the user to update the site. It is also what the *v4* build
    // does when it meets the v5 documents this phase starts writing — without the bump it would
    // read them and silently drop every destination mark on an export/import round trip.
    expect(() => migrate({ schemaVersion: 6, sessions: [], settings: {} })).toThrow(
      FutureSchemaError,
    )
  })

  it('migrates a version 2 document to 5 without altering its sessions', () => {
    // Identity all the way to 4: every v2 document is already a valid v4 one — `metrics` widens
    // from twelve fields to forty-three but stays optional throughout, and nothing existing
    // changes shape. 4 → 5 adds a key and touches no session.
    const doc = {
      schemaVersion: 2,
      sessions: [
        { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
          clubs: [{ club: 'DRIVER', typical: -5.4, best: -0.19, n: 618 }] },
      ],
      settings: {},
    }
    // Snapshotted before the call: no step here copies the sessions array, so `out.sessions` IS
    // `doc.sessions` — comparing them to each other would pass even if it mutated in place.
    const before = JSON.parse(JSON.stringify(doc.sessions))
    const out = migrate(doc)
    expect(out.schemaVersion).toBe(5)
    expect(out.sessions).toEqual(before)
  })

  it('migrates v3 to v5 without touching the session data', () => {
    const doc = {
      schemaVersion: 3,
      sessions: [{
        id: 's1', type: 'trackman', date: '2026-08-17', source: 'api',
        clubs: [{ club: 'DRIVER', typical: -6, best: -1, n: 5, metrics: { carry: { typical: 180, n: 5 } } }],
      }],
      settings: {},
    }
    const out = migrate(structuredClone(doc))
    expect(out.schemaVersion).toBe(5)
    expect(out.sessions).toEqual(doc.sessions)
  })

  it('still carries a v2 document all the way to v5', () => {
    const out = migrate({ schemaVersion: 2, sessions: [], settings: {} })
    expect(out.schemaVersion).toBe(5)
  })

  it('adds an empty destinations map to a real v4 document, leaving everything else alone', () => {
    // A realistic v4 export: both session types, a metric map on a club row, a block start. The
    // migration is additive, and the thing worth asserting is that months of history come
    // through a bump that exists to add one empty key.
    const v4 = {
      schemaVersion: 4,
      sessions: [session, trackman],
      settings: { blockStart: '2026-08-03' },
    }
    const before = structuredClone(v4)
    const out = migrate(v4)

    expect(out.schemaVersion).toBe(5)
    expect(out.sessions).toEqual(before.sessions)
    expect(out.settings).toEqual(before.settings)
    expect(out.destinations).toEqual({})
  })

  it('keeps destination marks that arrive on a document stamped v4', () => {
    // Hardening, not a live bug: no caller reaches the 4 → 5 step with marks on the document
    // today. But a JSON export is hand-editable and is this app's documented escape hatch, so a
    // file with a stale version stamp is a real input — and this migration must be able to add a
    // key without being able to alter one.
    const out = migrate({
      schemaVersion: 4,
      sessions: [session],
      settings: { blockStart: '2026-08-03' },
      destinations: { 'kingston-heath': { status: 'played', playedOn: '2026-03-11' } },
    })
    expect(out.schemaVersion).toBe(5)
    expect(out.destinations).toEqual({
      'kingston-heath': { status: 'played', playedOn: '2026-03-11' },
    })
    expect(out.sessions).toEqual([session])
  })

  it('still refuses a malformed destinations field on a v4 document', () => {
    // The other half of the same rule: absent is filled in, present-but-damaged throws so the
    // caller quarantines rather than silently zeroing it.
    expect(() =>
      migrate({ schemaVersion: 4, sessions: [], settings: {}, destinations: 'corrupt' }),
    ).toThrow(UnreadableStoreError)
  })

  it('does not mutate the v4 document it was handed', () => {
    // Pure, as the file requires. `read()` in `LocalStorageRepo` parses fresh text every time,
    // but `RemoteRepo` migrates an object it assembled and still holds.
    const v4 = { schemaVersion: 4, sessions: [session], settings: {} }
    migrate(v4)
    expect(v4).toEqual({ schemaVersion: 4, sessions: [session], settings: {} })
    expect('destinations' in v4).toBe(false)
  })

  it('carries destination marks already in a v5 document through untouched', () => {
    const out = migrate({
      schemaVersion: 5,
      sessions: [],
      settings: {},
      destinations: {
        'kingston-heath': { status: 'played', playedOn: '2026-03-11', note: 'Windy.' },
        'barnbougle-dunes': { status: 'want' },
      },
    })
    expect(out.destinations).toEqual({
      'kingston-heath': { status: 'played', playedOn: '2026-03-11', note: 'Windy.' },
      'barnbougle-dunes': { status: 'want' },
    })
  })
})

describe('emptyDocument', () => {
  it('is stamped with the current schema version', () => {
    expect(emptyDocument().schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('returns a fresh object each time so callers cannot share state', () => {
    const a = emptyDocument()
    a.sessions.push(session)
    expect(emptyDocument().sessions).toEqual([])
  })
})
