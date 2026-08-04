import { describe, expect, it } from 'vitest'
import { aggregateActivities, aggregateActivity, type RawActivity } from './aggregate'

const stroke = (club: string | null, clubPath: number | null, time = '2026-07-27T08:00:00Z') => ({
  club,
  time,
  measurement: { clubPath },
})

const activity = (strokes: unknown[] | null, time = '2026-07-27T08:00:51.581Z'): RawActivity =>
  ({ id: 'act-1', time, strokes }) as RawActivity

describe('aggregateActivity', () => {
  it('averages per club and never across clubs', () => {
    const s = aggregateActivity(
      activity([stroke('Driver', -8), stroke('Driver', -6), stroke('7Iron', -2)]),
    )!
    expect(s.clubs).toEqual([
      { club: 'DRIVER', typical: -7, best: -6, n: 2 },
      { club: 'IRON7', typical: -2, best: -2, n: 1 },
    ])
  })

  it('drops strokes with a null clubPath — 976 of 5,877 in the real data', () => {
    // They are not zeros. Letting them through pulls every average toward neutral and fakes
    // progress on the one number this whole app exists to move.
    const s = aggregateActivity(
      activity([stroke('Driver', -8), stroke('Driver', null), stroke('Driver', -6)]),
    )!
    expect(s.clubs[0]).toEqual({ club: 'DRIVER', typical: -7, best: -6, n: 2 })
  })

  it('drops strokes with a null measurement object, though the live data has none', () => {
    // Zero of 5,877 strokes had this. That is an observation about today's data, not a guarantee,
    // so the guard must not depend on it staying true.
    const s = aggregateActivity(
      activity([stroke('Driver', -8), { club: 'Driver', time: '', measurement: null }]),
    )!
    expect(s.clubs[0].n).toBe(1)
  })

  it('drops strokes with a missing measurement key entirely', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8), { club: 'Driver', time: '' }]))!
    expect(s.clubs[0].n).toBe(1)
  })

  it('drops strokes with no club — 3 of 5,877 in the real data', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8), stroke(null, -2)]))!
    expect(s.clubs).toHaveLength(1)
  })

  it('drops a club it cannot map, rather than guessing at the spelling', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8), stroke('3Hybrid', -2)]))!
    expect(s.clubs).toHaveLength(1)
  })

  it('reports an unmapped club by its exact spelling instead of losing it silently', () => {
    const seen: string[] = []
    aggregateActivity(activity([stroke('Driver', -8), stroke('3Hybrid', -2)]), (n) => seen.push(n))
    expect(seen).toEqual(['3Hybrid'])
  })

  it('returns null when nothing was measured', () => {
    expect(aggregateActivity(activity([stroke('Driver', null)]))).toBeNull()
    expect(aggregateActivity(activity([]))).toBeNull()
    expect(aggregateActivity(activity(null))).toBeNull()
  })

  it('takes the Sydney date, not the UTC one', () => {
    // 2026-07-27T14:30Z is 00:30 on the 28th in Sydney. 10 of 91 real sessions cross this line,
    // so reading the date off the timestamp would misfile one session in ten.
    const s = aggregateActivity(activity([stroke('Driver', -8)], '2026-07-27T14:30:00Z'))!
    expect(s.date).toBe('2026-07-28')
  })

  it('keeps a same-day session on its own day', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8)], '2026-07-27T08:00:51.581Z'))!
    expect(s.date).toBe('2026-07-27')
  })

  it('picks best as the value closest to neutral, on both sides of the band', () => {
    const out = aggregateActivity(activity([stroke('Driver', -8), stroke('Driver', -1.2)]))!
    expect(out.clubs[0].best).toBe(-1.2)

    // Overshooting is a fault: +1 beats +5. A Math.max "best" gets this exactly backwards and
    // would reward the thing the plan's "don't overcook it" watch-out warns against.
    const over = aggregateActivity(activity([stroke('Driver', 5), stroke('Driver', 1)]))!
    expect(over.clubs[0].best).toBe(1)

    const across = aggregateActivity(activity([stroke('Driver', -3), stroke('Driver', 2)]))!
    expect(across.clubs[0].best).toBe(2)
  })

  it('orders clubs by the bag, not by shot count', () => {
    const s = aggregateActivity(
      activity([stroke('SandWedge', -7), stroke('SandWedge', -7), stroke('Driver', -8)]),
    )!
    expect(s.clubs.map((c) => c.club)).toEqual(['DRIVER', 'SAND_WEDGE'])
  })

  it('rounds to two decimals, so the committed file carries no float noise', () => {
    const s = aggregateActivity(activity([stroke('Driver', -7.005), stroke('Driver', -7.004)]))!
    expect(s.clubs[0].typical).toBe(-7.0)
  })

  it('stamps the activity id and api provenance', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8)]))!
    expect(s.id).toBe('act-1')
    expect(s.source).toBe('api')
    expect(s.type).toBe('trackman')
  })
})

describe('aggregateActivities', () => {
  it('drops unmeasured sessions and sorts oldest first', () => {
    const out = aggregateActivities([
      activity([stroke('Driver', -8)], '2026-07-27T08:00:00Z'),
      activity([stroke('Driver', null)], '2026-07-20T08:00:00Z'),
      { ...activity([stroke('Driver', -4)], '2026-07-13T08:00:00Z'), id: 'act-3' },
    ])
    expect(out.map((s) => s.date)).toEqual(['2026-07-13', '2026-07-27'])
  })

  it('keeps two sessions on one date — 23 real dates carry more than one', () => {
    const out = aggregateActivities([
      { ...activity([stroke('Driver', -8)], '2026-07-22T09:12:48Z'), id: 'b' },
      { ...activity([stroke('Driver', -6)], '2026-07-22T08:03:56Z'), id: 'a' },
    ])
    expect(out).toHaveLength(2)
    expect(out.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('collects every unmapped club name across the whole batch', () => {
    const seen: string[] = []
    aggregateActivities(
      [activity([stroke('3Hybrid', -2)]), activity([stroke('Driver', -8), stroke('4Hybrid', -2)])],
      (n) => seen.push(n),
    )
    expect(seen).toEqual(['3Hybrid', '4Hybrid'])
  })
})
