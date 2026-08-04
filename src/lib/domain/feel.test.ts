import { describe, expect, it } from 'vitest'
import { feelByPhase } from './feel'
import type { DrillId, Feel, PracticeSession, TrackmanSession } from './types'

const START = '2026-08-03' // a Monday

function practice(id: string, date: string, drillId: DrillId, feel: Feel): PracticeSession {
  return {
    id,
    type: 'practice',
    date,
    location: 'home',
    entries: [{ drillId, swings: 10, feel }],
  }
}

function find(rows: ReturnType<typeof feelByPhase>, drillId: DrillId) {
  return rows.find((r) => r.drillId === drillId)!
}

describe('feelByPhase', () => {
  it('averages feel per drill within each phase', () => {
    const rows = feelByPhase(
      [
        practice('a', '2026-08-04', '01', 3), // week 1
        practice('b', '2026-08-05', '01', 5), // week 1
        practice('c', '2026-08-12', '01', 4), // week 2
      ],
      START,
    )
    const groove = find(rows, '01').phases[0]
    const transfer = find(rows, '01').phases[1]
    expect(groove).toMatchObject({ week: 1, mean: 4, n: 2 })
    expect(transfer).toMatchObject({ week: 2, mean: 4, n: 1 })
  })

  it('reports an unlogged phase as null, never as zero', () => {
    // Zero would read as "felt terrible" in the drill's own 1-5 units. It has
    // to be absent, and rendered in words.
    const rows = feelByPhase([practice('a', '2026-08-04', '01', 4)], START)
    const [groove, transfer, proof] = find(rows, '01').phases
    expect(groove.mean).toBe(4)
    expect(transfer.mean).toBeNull()
    expect(transfer.n).toBe(0)
    expect(proof.mean).toBeNull()
  })

  it('excludes sessions outside the three-week block entirely', () => {
    const rows = feelByPhase(
      [
        practice('before', '2026-08-02', '01', 5), // the day before the block
        practice('after', '2026-08-24', '01', 5), // day 22
      ],
      START,
    )
    expect(find(rows, '01').phases.every((p) => p.mean === null)).toBe(true)
  })

  it('always returns all seven drills and all three phases, in order', () => {
    const rows = feelByPhase([], START)
    expect(rows.map((r) => r.drillId)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
    expect(rows[0].phases.map((p) => p.week)).toEqual([1, 2, 3])
  })

  it('carries the arc phase so the label is never restated in markup', () => {
    const rows = feelByPhase([], START)
    expect(rows[0].phases[0].phase.title).toBe('Groove the feel')
    expect(rows[0].phases[2].phase.title).toBe('Proof it')
  })

  it('ignores Trackman sessions, which carry no feel', () => {
    const bay: TrackmanSession = {
      id: 't',
      type: 'trackman',
      date: '2026-08-03',
      clubs: [{ club: 'DRIVER', typical: -8, best: -4, n: 12 }],
      drillsWorked: ['04'],
      source: 'api',
    }
    const rows = feelByPhase([bay], START)
    expect(find(rows, '04').phases.every((p) => p.n === 0)).toBe(true)
  })

  it('rounds a mean to one decimal so a label never runs to six figures', () => {
    const rows = feelByPhase(
      [
        practice('a', '2026-08-04', '01', 3),
        practice('b', '2026-08-05', '01', 4),
        practice('c', '2026-08-06', '01', 4),
      ],
      START,
    )
    expect(find(rows, '01').phases[0].mean).toBe(3.7)
  })

  it('returns nothing for a malformed block start', () => {
    expect(feelByPhase([practice('a', '2026-08-04', '01', 4)], 'nope')).toEqual([])
  })
})
