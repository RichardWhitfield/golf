import { describe, expect, it } from 'vitest'
import { FutureSchemaError, SCHEMA_VERSION, UnreadableStoreError, migrate } from './migrations'
import { emptyDocument } from './repository'
import type { PracticeSession } from '../domain/types'

const session: PracticeSession = {
  id: 'a',
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
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
    // Honest about what this covers: the `version < 1` guard, not the loop. While
    // SCHEMA_VERSION is 1 there is NO valid input that enters the loop body at all, so the
    // "no migration for this gap" branch is unreachable and therefore untested. When
    // SCHEMA_VERSION next rises, add a case with a genuine registered gap — a test named for
    // a branch it cannot reach ships false confidence.
    expect(() => migrate({ schemaVersion: -1 })).toThrow(UnreadableStoreError)
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
