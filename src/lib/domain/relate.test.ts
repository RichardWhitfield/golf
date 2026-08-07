import { describe, expect, it } from 'vitest'
import { relate } from './relate'
import type { TrackmanSession } from './types'

function tm(id: string, date: string, clubs: TrackmanSession['clubs']): TrackmanSession {
  return { id, type: 'trackman', date, clubs, source: 'api' }
}

const driver = (typical: number, plane?: number) => ({
  club: 'DRIVER' as const,
  typical,
  best: typical,
  n: 10,
  ...(plane === undefined ? {} : { metrics: { swingPlane: { typical: plane, n: 10 } } }),
})

describe('relate', () => {
  it('pairs two metrics from the same session', () => {
    const r = relate(
      [tm('a', '2026-07-01', [driver(-6, 50)]), tm('b', '2026-07-08', [driver(-4, 54)])],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points).toEqual([
      { date: '2026-07-01', x: 50, y: -6, n: 10 },
      { date: '2026-07-08', x: 54, y: -4, n: 10 },
    ])
  })

  it('reports a perfect positive relationship as r = 1', () => {
    const r = relate(
      [
        tm('a', '2026-07-01', [driver(-6, 50)]),
        tm('b', '2026-07-08', [driver(-4, 52)]),
        tm('c', '2026-07-15', [driver(-2, 54)]),
      ],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.r).toBeCloseTo(1, 10)
  })

  it('counts sessions missing either metric instead of quietly dropping them', () => {
    // A thin relation must not be able to present itself as a strong one.
    const r = relate(
      [
        tm('a', '2026-07-01', [driver(-6, 50)]),
        tm('b', '2026-07-08', [driver(-4)]),
      ],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points).toHaveLength(1)
    expect(r.skipped).toBe(1)
  })

  it('has no correlation to report from a single point', () => {
    const r = relate([tm('a', '2026-07-01', [driver(-6, 50)])], 'DRIVER', 'swingPlane', 'clubPath')
    expect(r.r).toBeNull()
  })

  it('never pairs one club with another', () => {
    // OQ-7: club selection alone moves every one of these numbers.
    const sessions = [
      tm('a', '2026-07-01', [
        driver(-6, 50),
        { club: 'IRON7', typical: -2, best: -2, n: 8, metrics: { swingPlane: { typical: 70, n: 8 } } },
      ]),
    ]
    const r = relate(sessions, 'DRIVER', 'swingPlane', 'clubPath')
    expect(r.points).toEqual([{ date: '2026-07-01', x: 50, y: -6, n: 10 }])
  })

  it('ignores practice sessions, which carry no readings', () => {
    const r = relate(
      [{ id: 'p', type: 'practice', date: '2026-07-01', location: 'home', entries: [] }],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points).toHaveLength(0)
    expect(r.r).toBeNull()
  })

  it('orders points by date so the panel reads as a timeline', () => {
    const r = relate(
      [tm('b', '2026-07-08', [driver(-4, 54)]), tm('a', '2026-07-01', [driver(-6, 50)])],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-08'])
  })

  it('counts a pair by its thinner half, never its fatter one', () => {
    // A session with 618 path readings and 12 plane readings is a 12-reading pair. Dot area on
    // the chart encodes this, so taking the larger count would draw a thin pair as a confident one.
    const session = tm('a', '2026-07-01', [
      { club: 'DRIVER', typical: -6, best: -4, n: 618,
        metrics: { swingPlane: { typical: 50, n: 12 } } },
    ])
    expect(relate([session], 'DRIVER', 'swingPlane', 'clubPath').points[0].n).toBe(12)
  })

  it('reports no correlation when a metric never varied, rather than zero', () => {
    // Three real sessions, but the plane never moved. "No relationship can be computed" is a
    // different statement from "the relationship is zero", and only one of them is true here.
    const flat = [
      tm('a', '2026-07-01', [driver(-6, 50)]),
      tm('b', '2026-07-08', [driver(-4, 50)]),
      tm('c', '2026-07-15', [driver(-2, 50)]),
    ]
    const r = relate(flat, 'DRIVER', 'swingPlane', 'clubPath')
    expect(r.points).toHaveLength(3)
    expect(r.r).toBeNull()
  })

  it('leaves the count absent when a hand-typed row has none, never NaN or zero', () => {
    // A hand-typed club-path row carries no count, and `Reading.n` is optional so the compiler
    // says so. A `0` reaching radiusFor would size a dot from a guess.
    const typed = tm('a', '2026-07-01', [
      { club: 'DRIVER', typical: -6, best: -4, metrics: { swingPlane: { typical: 50, n: 12 } } },
    ])
    expect(relate([typed], 'DRIVER', 'swingPlane', 'clubPath').points[0].n).toBeUndefined()
  })
})
