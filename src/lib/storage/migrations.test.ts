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

describe('migrate', () => {
  it('passes a current-version document through', () => {
    const doc = { schemaVersion: SCHEMA_VERSION, sessions: [session], settings: { blockStart: '2026-08-03' } }
    expect(migrate(doc)).toEqual(doc)
  })

  it('fills in missing sessions and settings rather than failing', () => {
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
    // unreachable. It is reachable now: a v1 document takes the 1 → 2 step.
    const v1 = {
      schemaVersion: 1,
      sessions: [session],
      settings: { blockStart: '2026-07-20' },
    }
    const doc = migrate(v1)
    expect(doc.schemaVersion).toBe(2)
    // v1 → v2 is identity: v1 held only practice sessions, and those are unchanged.
    expect(doc.sessions).toEqual([session])
    expect(doc.settings).toEqual({ blockStart: '2026-07-20' })
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
    // The v1 build deployed today does exactly this when it meets a v2 document: refuses,
    // does not quarantine, and tells the user to update the site. Without the bump it would
    // instead read the document and reject every Trackman session in it as corrupt.
    expect(() => migrate({ schemaVersion: 3, sessions: [], settings: {} })).toThrow(
      FutureSchemaError,
    )
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
