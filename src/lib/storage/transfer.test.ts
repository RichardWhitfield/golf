import { describe, expect, it } from 'vitest'
import {
  InvalidImportError,
  exportFilename,
  mergeDocuments,
  parseDocument,
  serialiseDocument,
} from './transfer'
import { SCHEMA_VERSION } from './migrations'
import { emptyDocument } from './repository'
import type { PracticeSession } from '../domain/types'

const session = (id: string, over: Partial<PracticeSession> = {}): PracticeSession => ({
  id,
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
  ...over,
})

const doc = (sessions: PracticeSession[], settings = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  sessions,
  settings,
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
    expect(merged.sessions[0].location).toBe('course')
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
