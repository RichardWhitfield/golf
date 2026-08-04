import { describe, expect, it } from 'vitest'
import { clubSeries, dateBounds } from './series'
import type { PracticeSession, Session, TrackmanSession } from './types'

function tm(id: string, date: string, clubs: TrackmanSession['clubs']): TrackmanSession {
  return { id, type: 'trackman', date, clubs, source: 'api' }
}

describe('clubSeries', () => {
  it('keeps every club apart and never blends them', () => {
    // OQ-7: a mean spanning clubs tracks club selection, not swing change.
    const series = clubSeries([
      tm('a', '2026-07-13', [
        { club: 'DRIVER', typical: -8.51, best: -5.3, n: 14 },
        { club: 'IRON7', typical: -2.1, best: -0.4, n: 20 },
      ]),
    ])
    expect(series).toHaveLength(2)
    const driver = series.find((s) => s.club === 'DRIVER')!
    const iron = series.find((s) => s.club === 'IRON7')!
    expect(driver.points[0].typical).toBe(-8.51)
    expect(iron.points[0].typical).toBe(-2.1)
  })

  it('orders panels in bag order, never alphabetically', () => {
    const series = clubSeries([
      tm('a', '2026-07-13', [
        { club: 'IRON7', typical: -2, best: -1, n: 5 },
        { club: 'DRIVER', typical: -8, best: -4, n: 5 },
        { club: 'WOOD3', typical: -5, best: -2, n: 5 },
      ]),
    ])
    expect(series.map((s) => s.club)).toEqual(['DRIVER', 'WOOD3', 'IRON7'])
  })

  it('orders each club by date, oldest first', () => {
    const series = clubSeries([
      tm('b', '2026-07-13', [{ club: 'DRIVER', typical: -8.51, best: -5.3, n: 14 }]),
      tm('a', '2025-07-03', [{ club: 'DRIVER', typical: -1.83, best: 0.1, n: 14 }]),
    ])
    expect(series[0].points.map((p) => p.date)).toEqual(['2025-07-03', '2026-07-13'])
  })

  it('gives two sessions on one date distinct, deterministic ordinals', () => {
    // 21 dates in the backfill carry two sessions. Without an ordinal the dots
    // would land on the same x and one would hide under the other.
    const forwards = clubSeries([
      tm('a', '2026-07-22', [{ club: 'DRIVER', typical: -6.3, best: -3.3, n: 4 }]),
      tm('b', '2026-07-22', [{ club: 'DRIVER', typical: -3.18, best: -1.5, n: 5 }]),
    ])
    const backwards = clubSeries([
      tm('b', '2026-07-22', [{ club: 'DRIVER', typical: -3.18, best: -1.5, n: 5 }]),
      tm('a', '2026-07-22', [{ club: 'DRIVER', typical: -6.3, best: -3.3, n: 4 }]),
    ])
    expect(forwards[0].points.map((p) => p.ordinal)).toEqual([0, 1])
    // Same answer regardless of the order they arrived in.
    expect(backwards[0].points).toEqual(forwards[0].points)
  })

  it('passes best through untouched', () => {
    // best is already "closest to neutral" from ingest. Recomputing it with
    // Math.max would report the worst overshoot as the best strike.
    const series = clubSeries([
      tm('a', '2026-07-13', [{ club: 'DRIVER', typical: -8.51, best: -5.3, n: 14 }]),
    ])
    expect(series[0].points[0].best).toBe(-5.3)
  })

  it('omits n entirely when the reading has none', () => {
    const series = clubSeries([tm('a', '2026-07-13', [{ club: 'DRIVER', typical: -6, best: -2 }])])
    expect(series[0].points[0].n).toBeUndefined()
    expect('n' in series[0].points[0]).toBe(false)
  })

  it('ignores practice sessions', () => {
    const practice: PracticeSession = {
      id: 'p',
      type: 'practice',
      date: '2026-07-14',
      location: 'home',
      entries: [{ drillId: '01', swings: 10, feel: 4 }],
    }
    expect(clubSeries([practice])).toEqual([])
  })

  it('produces no series at all for a club with no readings', () => {
    const series = clubSeries([
      tm('a', '2026-07-13', [{ club: 'DRIVER', typical: -8, best: -4, n: 9 }]),
    ])
    expect(series.map((s) => s.club)).toEqual(['DRIVER'])
  })

  it('returns nothing for an empty store', () => {
    expect(clubSeries([])).toEqual([])
  })
})

describe('dateBounds', () => {
  it('spans every club, so all panels share one x axis', () => {
    const sessions: Session[] = [
      tm('a', '2025-07-03', [{ club: 'IRON6', typical: -4.55, best: -1, n: 23 }]),
      tm('b', '2026-07-27', [{ club: 'IRON7', typical: -3, best: -1, n: 8 }]),
    ]
    expect(dateBounds(clubSeries(sessions))).toEqual({
      first: '2025-07-03',
      last: '2026-07-27',
    })
  })

  it('returns null when there is nothing to bound', () => {
    expect(dateBounds([])).toBeNull()
  })
})
