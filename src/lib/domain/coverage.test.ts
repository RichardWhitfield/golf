import { describe, expect, it } from 'vitest'
import { drillCoverage } from './coverage'
import type { PracticeSession, TrackmanSession } from './types'

function practice(id: string, date: string, entries: PracticeSession['entries']): PracticeSession {
  return { id, type: 'practice', date, location: 'home', entries }
}

function find(rows: ReturnType<typeof drillCoverage>, drillId: string) {
  return rows.find((r) => r.drillId === drillId)!
}

describe('drillCoverage', () => {
  it('takes the denominator from the plan, not from the log', () => {
    // Wed schedules 01 and 04. Nothing was logged, so 01 was asked for once
    // and skipped — which is only visible because the plan supplied the 1.
    const rows = drillCoverage([], '2026-08-05', '2026-08-05')
    expect(find(rows, '01').scheduled).toBe(1)
    expect(find(rows, '01').done).toBe(0)
  })

  it('separates "never asked for" from "asked and skipped"', () => {
    // THE POINT OF THIS MODULE. Drill 03 appears in no day's schedule, so it
    // computes to 0 of 0 — exactly like a drill asked for and avoided. Render
    // them alike and 03 becomes the most-avoided drill in the plan, which is
    // false and produced entirely by the chart.
    const rows = drillCoverage([], '2026-08-05', '2026-08-05')
    expect(find(rows, '03').status).toBe('unscheduled')
    expect(find(rows, '03').scheduled).toBe(0)
    expect(find(rows, '01').status).toBe('avoided')
    expect(find(rows, '01').scheduled).toBeGreaterThan(0)
  })

  it('counts a drill as done when it was logged', () => {
    const rows = drillCoverage(
      [practice('p', '2026-08-05', [{ drillId: '01', swings: 12, feel: 4 }])],
      '2026-08-05',
      '2026-08-05',
    )
    expect(find(rows, '01')).toMatchObject({ scheduled: 1, done: 1, swings: 12, status: 'covered' })
  })

  it("counts Monday's bay work, so scheduled bay drills are not reported as avoided", () => {
    // WEEK.mon schedules 04, 06 and 02, and those are worked on the Trackman.
    // Ignoring drillsWorked would mark them permanently avoided.
    const bay: TrackmanSession = {
      id: 't',
      type: 'trackman',
      date: '2026-08-03',
      clubs: [{ club: 'DRIVER', typical: -8, best: -4, n: 12 }],
      drillsWorked: ['04', '06'],
      source: 'manual',
    }
    const rows = drillCoverage([bay], '2026-08-03', '2026-08-03')
    expect(find(rows, '04').done).toBe(1)
    expect(find(rows, '06').done).toBe(1)
    expect(find(rows, '02').status).toBe('avoided')
  })

  it('reports both counts honestly when a drill is done more often than asked', () => {
    // Diligence, not an error. The bar must not overflow, but the numbers stay true.
    const rows = drillCoverage(
      [
        practice('a', '2026-08-05', [{ drillId: '01', swings: 10, feel: 4 }]),
        practice('b', '2026-08-06', [{ drillId: '01', swings: 8, feel: 3 }]),
      ],
      '2026-08-05',
      '2026-08-06',
    )
    // Wed schedules 01; Thu does not.
    expect(find(rows, '01')).toMatchObject({ scheduled: 1, done: 2, swings: 18, status: 'covered' })
  })

  it('marks a partly-done drill as partial', () => {
    const rows = drillCoverage(
      [practice('a', '2026-08-05', [{ drillId: '04', swings: 10, feel: 4 }])],
      '2026-08-05',
      '2026-08-07',
    )
    // Wed and Fri both schedule 04; only Wednesday was logged.
    expect(find(rows, '04').scheduled).toBe(2)
    expect(find(rows, '04').done).toBe(1)
    expect(find(rows, '04').status).toBe('partial')
  })

  it('returns all seven drills in drill order, so rows never reorder', () => {
    const rows = drillCoverage([], '2026-08-05', '2026-08-11')
    expect(rows.map((r) => r.drillId)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
  })

  it('excludes sessions outside the window', () => {
    const rows = drillCoverage(
      [practice('old', '2026-07-01', [{ drillId: '01', swings: 10, feel: 5 }])],
      '2026-08-05',
      '2026-08-05',
    )
    expect(find(rows, '01').done).toBe(0)
    expect(find(rows, '01').swings).toBe(0)
  })

  it('returns nothing for an inverted or malformed window rather than throwing', () => {
    expect(drillCoverage([], '2026-08-11', '2026-08-05')).toEqual([])
    expect(drillCoverage([], 'nope', '2026-08-05')).toEqual([])
    expect(drillCoverage([], '2026-08-05', 'nope')).toEqual([])
  })

  it('still counts swings for a drill the plan never asked for', () => {
    // Doing 03 off-plan is a real thing you did. It must not vanish.
    const rows = drillCoverage(
      [practice('a', '2026-08-05', [{ drillId: '03', swings: 10, feel: 4 }])],
      '2026-08-05',
      '2026-08-05',
    )
    expect(find(rows, '03')).toMatchObject({
      scheduled: 0,
      done: 1,
      swings: 10,
      status: 'unscheduled',
    })
  })
})
