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
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -8), stroke('Driver', -6), stroke('7Iron', -2)]),
    )!
    // `metrics` is always present, empty when nothing beyond club path was measured. The figures
    // either side of it are unchanged: they are the observed data, and the shape is not.
    expect(s.clubs).toEqual([
      { club: 'DRIVER', typical: -7, best: -6, n: 2, metrics: {} },
      { club: 'IRON7', typical: -2, best: -2, n: 1, metrics: {} },
    ])
  })

  it('drops strokes with a null clubPath — 976 of 5,877 in the real data', () => {
    // They are not zeros. Letting them through pulls every average toward neutral and fakes
    // progress on the one number this whole app exists to move.
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -8), stroke('Driver', null), stroke('Driver', -6)]),
    )!
    expect(s.clubs[0]).toEqual({ club: 'DRIVER', typical: -7, best: -6, n: 2, metrics: {} })
  })

  it('drops strokes with a null measurement object, though the live data has none', () => {
    // Zero of 5,877 strokes had this. That is an observation about today's data, not a guarantee,
    // so the guard must not depend on it staying true.
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -8), { club: 'Driver', time: '', measurement: null }]),
    )!
    expect(s.clubs[0].n).toBe(1)
  })

  it('drops strokes with a missing measurement key entirely', () => {
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -8), { club: 'Driver', time: '' }]),
    )!
    expect(s.clubs[0].n).toBe(1)
  })

  it('drops strokes with no club — 3 of 5,877 in the real data', () => {
    const { session: s } = aggregateActivity(activity([stroke('Driver', -8), stroke(null, -2)]))!
    expect(s.clubs).toHaveLength(1)
  })

  it('drops a club it cannot map, rather than guessing at the spelling', () => {
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -8), stroke('3Hybrid', -2)]),
    )!
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
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -8)], '2026-07-27T14:30:00Z'),
    )!
    expect(s.date).toBe('2026-07-28')
  })

  it('keeps a same-day session on its own day', () => {
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -8)], '2026-07-27T08:00:51.581Z'),
    )!
    expect(s.date).toBe('2026-07-27')
  })

  it('picks best as the value closest to neutral, on both sides of the band', () => {
    const { session: out } = aggregateActivity(
      activity([stroke('Driver', -8), stroke('Driver', -1.2)]),
    )!
    expect(out.clubs[0].best).toBe(-1.2)

    // Overshooting is a fault: +1 beats +5. A Math.max "best" gets this exactly backwards and
    // would reward the thing the plan's "don't overcook it" watch-out warns against.
    const { session: over } = aggregateActivity(
      activity([stroke('Driver', 5), stroke('Driver', 1)]),
    )!
    expect(over.clubs[0].best).toBe(1)

    const { session: across } = aggregateActivity(
      activity([stroke('Driver', -3), stroke('Driver', 2)]),
    )!
    expect(across.clubs[0].best).toBe(2)
  })

  it('orders clubs by the bag, not by shot count', () => {
    const { session: s } = aggregateActivity(
      activity([stroke('SandWedge', -7), stroke('SandWedge', -7), stroke('Driver', -8)]),
    )!
    expect(s.clubs.map((c) => c.club)).toEqual(['DRIVER', 'SAND_WEDGE'])
  })

  it('rounds to two decimals, so the committed file carries no float noise', () => {
    const { session: s } = aggregateActivity(
      activity([stroke('Driver', -7.005), stroke('Driver', -7.004)]),
    )!
    expect(s.clubs[0].typical).toBe(-7.0)
  })

  it('stamps the activity id and api provenance', () => {
    const { session: s } = aggregateActivity(activity([stroke('Driver', -8)]))!
    expect(s.id).toBe('act-1')
    expect(s.source).toBe('api')
    expect(s.type).toBe('trackman')
  })
})

describe('aggregateActivities', () => {
  it('drops unmeasured sessions and sorts oldest first', () => {
    const { sessions } = aggregateActivities([
      activity([stroke('Driver', -8)], '2026-07-27T08:00:00Z'),
      activity([stroke('Driver', null)], '2026-07-20T08:00:00Z'),
      { ...activity([stroke('Driver', -4)], '2026-07-13T08:00:00Z'), id: 'act-3' },
    ])
    expect(sessions.map((s) => s.date)).toEqual(['2026-07-13', '2026-07-27'])
  })

  it('keeps two sessions on one date — 23 real dates carry more than one', () => {
    const { sessions } = aggregateActivities([
      { ...activity([stroke('Driver', -8)], '2026-07-22T09:12:48Z'), id: 'b' },
      { ...activity([stroke('Driver', -6)], '2026-07-22T08:03:56Z'), id: 'a' },
    ])
    expect(sessions).toHaveLength(2)
    expect(sessions.map((s) => s.id)).toEqual(['a', 'b'])
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

const rich = (club: string, m: Record<string, number | null>, time = '2026-07-27T08:00:00Z') =>
  ({ club, time, measurement: m })

describe('aggregateActivity · the wider metric set', () => {
  it('counts each metric separately, because their null rates differ', () => {
    // The finding that forced this: on the driver, swing plane is present on 666 strokes where
    // club path is present on 618. One shared count would overstate the sparser metric.
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, swingPlane: 50 }),
        rich('Driver', { clubPath: -4, swingPlane: 52 }),
        rich('Driver', { clubPath: null, swingPlane: 54 }),
      ]),
    )!
    expect(session.clubs[0].n).toBe(2)
    expect(session.clubs[0].metrics?.swingPlane).toEqual({ typical: 52, n: 3 })
  })

  it('keeps a stroke that measured a plane but no path', () => {
    // Filtering the whole stroke on a null clubPath would throw away a good plane reading.
    const { session } = aggregateActivity(
      activity([rich('Driver', { clubPath: -6 }), rich('Driver', { swingPlane: 60 })]),
    )!
    expect(session.clubs[0].metrics?.swingPlane).toEqual({ typical: 60, n: 1 })
  })

  it('stores no best where the metric has no target', () => {
    // swingPlane is `better: 'none'` — a driver and an iron want different numbers, so there is
    // no shared target and inventing one would be worse than admitting it.
    const { session } = aggregateActivity(
      activity([rich('Driver', { clubPath: -6, swingPlane: 50, faceToPath: 4 })]),
    )!
    expect(session.clubs[0].metrics?.swingPlane).not.toHaveProperty('best')
    expect(session.clubs[0].metrics?.faceToPath).toEqual({ typical: 4, best: 4, n: 1 })
  })

  it('picks the face-to-path closest to neutral, never the largest', () => {
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, faceToPath: 8 }),
        rich('Driver', { clubPath: -6, faceToPath: 2 }),
      ]),
    )!
    expect(session.clubs[0].metrics?.faceToPath?.best).toBe(2)
  })

  it('takes the largest carry, where larger genuinely is better', () => {
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, carry: 150 }),
        rich('Driver', { clubPath: -6, carry: 172 }),
      ]),
    )!
    expect(session.clubs[0].metrics?.carry?.best).toBe(172)
  })

  it('omits a metric entirely when nothing measured it', () => {
    const { session } = aggregateActivity(activity([rich('Driver', { clubPath: -6 })]))!
    expect(session.clubs[0].metrics).toEqual({})
  })

  it('still requires a club path for the club to appear at all', () => {
    // Club path is the KPI and the reason this session type exists. A club row without one
    // would be a row with no KPI in it.
    expect(aggregateActivity(activity([rich('Driver', { swingPlane: 50 })]))).toBeNull()
  })

  it('never blends a metric across clubs', () => {
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, swingPlane: 50 }),
        rich('7Iron', { clubPath: -2, swingPlane: 70 }),
      ]),
    )!
    expect(session.clubs.find((c) => c.club === 'DRIVER')!.metrics?.swingPlane?.typical).toBe(50)
    expect(session.clubs.find((c) => c.club === 'IRON7')!.metrics?.swingPlane?.typical).toBe(70)
  })
})

describe('aggregateActivity · shots', () => {
  it('returns one shot per measured stroke, keyed to the session', () => {
    const { shots } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, swingPlane: 50 }),
        rich('7Iron', { clubPath: -2 }),
      ]),
    )!
    expect(shots).toEqual([
      { club: 'DRIVER', time: '2026-07-27T08:00:00Z', metrics: { clubPath: -6, swingPlane: 50 } },
      { club: 'IRON7', time: '2026-07-27T08:00:00Z', metrics: { clubPath: -2 } },
    ])
  })

  it('omits an absent metric rather than writing a zero', () => {
    const { shots } = aggregateActivity(activity([rich('Driver', { clubPath: -6, curve: null })]))!
    expect(shots[0].metrics).not.toHaveProperty('curve')
  })

  it('drops a stroke whose club cannot be mapped, matching the aggregates', () => {
    const { shots } = aggregateActivity(
      activity([rich('Driver', { clubPath: -6 }), rich('3Hybrid', { clubPath: -2 })]),
    )!
    expect(shots).toHaveLength(1)
  })
})
