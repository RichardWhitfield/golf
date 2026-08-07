import { describe, expect, it } from 'vitest'
import { faceOpenToPath, latestTrackman } from './latest'
import type { PracticeSession, Session, TrackmanSession } from './types'

function tm(id: string, date: string, clubs: TrackmanSession['clubs']): TrackmanSession {
  return { id, type: 'trackman', date, clubs, source: 'api' }
}

const driver = (typical: number) => ({ club: 'DRIVER' as const, typical, best: typical, n: 10 })
const seven = (typical: number) => ({ club: 'IRON7' as const, typical, best: typical, n: 10 })

describe('latestTrackman', () => {
  it('takes the most recent date, whatever order the store returned', () => {
    const sessions = [
      tm('a', '2026-07-01', [driver(-6)]),
      tm('c', '2026-07-15', [driver(-2)]),
      tm('b', '2026-07-08', [driver(-4)]),
    ]
    expect(latestTrackman(sessions, 'DRIVER')).toEqual({ date: '2026-07-15', row: driver(-2) })
  })

  it('breaks a tie on id, identically whichever order the input arrives in', () => {
    // 23 dates in the real backfill carry more than one session, so this is routine.
    const early = tm('aaa', '2026-07-15', [driver(-6)])
    const late = tm('zzz', '2026-07-15', [driver(-2)])
    const forwards = latestTrackman([early, late], 'DRIVER')
    const backwards = latestTrackman([late, early], 'DRIVER')
    expect(forwards).toEqual(backwards)
    expect(forwards).toEqual({ date: '2026-07-15', row: driver(-2) })
  })

  it('skips sessions that do not carry the club, rather than returning the wrong one', () => {
    const sessions = [
      tm('a', '2026-07-01', [driver(-6)]),
      tm('b', '2026-07-15', [seven(-3)]),
    ]
    expect(latestTrackman(sessions, 'DRIVER')).toEqual({ date: '2026-07-01', row: driver(-6) })
  })

  it('returns null for a club with no readings at all', () => {
    expect(latestTrackman([tm('a', '2026-07-01', [driver(-6)])], 'IRON7')).toBeNull()
  })

  it('returns null when there is nothing to read', () => {
    expect(latestTrackman([], 'DRIVER')).toBeNull()
  })

  it('ignores practice sessions, which carry no club rows', () => {
    const practice: PracticeSession = {
      id: 'p', type: 'practice', date: '2026-07-20', location: 'home',
      entries: [{ drillId: '01', swings: 20, feel: 4 }],
    }
    const sessions: Session[] = [tm('a', '2026-07-01', [driver(-6)]), practice]
    expect(latestTrackman(sessions, 'DRIVER')).toEqual({ date: '2026-07-01', row: driver(-6) })
  })
})

describe('faceOpenToPath', () => {
  it('reports a face right of the path as open', () => {
    expect(faceOpenToPath({ typical: 4.2, n: 618 })).toBe(true)
  })

  it('reports a face left of the path as closed', () => {
    expect(faceOpenToPath({ typical: -1.3, n: 618 })).toBe(false)
  })

  it('does not treat a square face as open', () => {
    expect(faceOpenToPath({ typical: 0, n: 618 })).toBe(false)
  })

  it('returns null for an absent reading — absent is not "closed"', () => {
    expect(faceOpenToPath(undefined)).toBeNull()
  })
})
