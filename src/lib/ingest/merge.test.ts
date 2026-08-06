import { describe, expect, it } from 'vitest'
import type { Session, Shot, TrackmanSession } from '../domain/types'
import { mergeTrackmanSessions, shotsToWrite } from './merge'

const api = (id: string, date: string, typical = -7): TrackmanSession => ({
  id,
  type: 'trackman',
  date,
  source: 'api',
  clubs: [{ club: 'DRIVER', typical, best: -1, n: 10 }],
})

const manual = (id: string, date: string): TrackmanSession => ({
  ...api(id, date),
  source: 'manual',
  clubs: [{ club: 'DRIVER', typical: -5, best: -2 }],
})

const practice: Session = {
  id: 'p1',
  type: 'practice',
  date: '2026-07-27',
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
}

describe('mergeTrackmanSessions', () => {
  it('adds new sessions and reports the count', () => {
    const r = mergeTrackmanSessions([], [api('a', '2026-07-27')])
    expect(r).toMatchObject({ added: 1, updated: 0, skipped: 0, changed: true })
  })

  it('is idempotent — re-running changes nothing', () => {
    const first = mergeTrackmanSessions([], [api('a', '2026-07-27')])
    const second = mergeTrackmanSessions(first.sessions, [api('a', '2026-07-27')])
    expect(second).toMatchObject({ added: 0, updated: 0, skipped: 0, changed: false })
    expect(second.sessions).toEqual(first.sessions)
  })

  it('updates an imported session whose numbers changed', () => {
    const first = mergeTrackmanSessions([], [api('a', '2026-07-27', -7)])
    const second = mergeTrackmanSessions(first.sessions, [api('a', '2026-07-27', -6)])
    expect(second).toMatchObject({ updated: 1, changed: true })
    expect((second.sessions[0] as TrackmanSession).clubs[0].typical).toBe(-6)
  })

  it('never overwrites a session marked manual, even on the same id', () => {
    // Editing an imported session flips it to `manual`, so this is what protects a correction
    // typed by hand from being undone by the next sync.
    const stored = [manual('a', '2026-07-27')]
    const r = mergeTrackmanSessions(stored, [api('a', '2026-07-27')])
    expect(r).toMatchObject({ added: 0, updated: 0, skipped: 1, changed: false })
    expect(r.sessions).toEqual(stored)
  })

  it('skips an import for a date already logged by hand', () => {
    // Otherwise every Phase 4 chart counts that day twice. Reversible: delete the manual record
    // and the next load brings in the richer imported one.
    const stored = [manual('typed', '2026-07-27')]
    const r = mergeTrackmanSessions(stored, [api('fetched', '2026-07-27')])
    expect(r).toMatchObject({ added: 0, skipped: 1, changed: false })
    expect(r.sessions).toEqual(stored)
  })

  it('does not let an imported session block another on the same date', () => {
    const stored = [api('first', '2026-07-22')]
    const r = mergeTrackmanSessions(stored, [api('second', '2026-07-22')])
    expect(r).toMatchObject({ added: 1, skipped: 0 })
  })

  it('allows two imported sessions on one date — 23 real dates have more than one', () => {
    const r = mergeTrackmanSessions([], [api('a', '2026-07-22'), api('b', '2026-07-22')])
    expect(r.added).toBe(2)
  })

  it('leaves practice sessions untouched, including on a colliding date', () => {
    // A practice session is a different kind of thing; it never blocks a Trackman import.
    const r = mergeTrackmanSessions([practice], [api('a', '2026-07-27')])
    expect(r.added).toBe(1)
    expect(r.sessions).toContainEqual(practice)
  })

  it('reports no change when there is nothing to do', () => {
    expect(mergeTrackmanSessions([practice], [])).toMatchObject({ changed: false, skipped: 0 })
  })

  it('never drops a stored session the incoming batch does not mention', () => {
    const stored = [practice, api('old', '2026-01-05')]
    const r = mergeTrackmanSessions(stored, [api('new', '2026-07-27')])
    expect(r.sessions.map((s) => s.id).sort()).toEqual(['new', 'old', 'p1'])
  })

  it('does not mutate the array it was handed', () => {
    const stored: Session[] = [practice]
    mergeTrackmanSessions(stored, [api('a', '2026-07-27')])
    expect(stored).toEqual([practice])
  })
})

describe('shotsToWrite', () => {
  const shots: Shot[] = [{ club: 'DRIVER', metrics: { clubPath: -6 } }]

  it('never gives machine shots to a hand-typed session', () => {
    // The guarantee this function exists for. `ifNotManual` guards the SESSION partition only;
    // the SHOTS# key space inherits nothing, so if this rule is not kept here it is kept nowhere.
    expect(shotsToWrite([manual('a', '2026-07-27')], new Map([['a', shots]]))).toEqual([])
  })

  it('writes shots for an imported session', () => {
    expect(shotsToWrite([api('a', '2026-07-27')], new Map([['a', shots]]))).toEqual([
      { id: 'a', shots },
    ])
  })

  it('skips a session outside the pull window', () => {
    expect(shotsToWrite([api('a', '2026-07-27')], new Map())).toEqual([])
  })

  it('writes no item for a session whose shots list is empty', () => {
    expect(shotsToWrite([api('a', '2026-07-27')], new Map([['a', []]]))).toEqual([])
  })

  it('ignores practice sessions, which have no source and no shots', () => {
    expect(shotsToWrite([practice], new Map([['p1', shots]]))).toEqual([])
  })
})
