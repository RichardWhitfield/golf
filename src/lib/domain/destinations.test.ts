import { describe, expect, it } from 'vitest'
import { COURSES, type Access, type Course } from './courses'
import {
  ACCESS_LABELS,
  checkedLabel,
  clusterProjected,
  feeLabel,
  spreadCoincident,
  type MapPin,
  type ProjectedPin,
} from './destinations'

/** Only the fields the map maths reads. The rest of `Course` is irrelevant to these functions. */
function course(slug: string, lat: number, lon: number, extra: Partial<Course> = {}): Course {
  return {
    slug,
    rank: 1,
    name: slug,
    suburb: 'Somewhere',
    state: 'VIC',
    lat,
    lon,
    architects: [],
    summary: 'A course.',
    access: 'public',
    ...extra,
  }
}

/** Equirectangular, which is exact enough at 40 m and needs no dependency. */
function metresApart(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const mPerDegLat = 111_320
  const dy = (a.lat - b.lat) * mPerDegLat
  const dx = (a.lon - b.lon) * mPerDegLat * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

const projected = (pin: MapPin, x: number, y: number): ProjectedPin => ({ pin, x, y })

describe('spreadCoincident', () => {
  it('returns a lone course on its researched coordinates, untouched', () => {
    // The point of the function is separating the seven that overlap. The other 93 must come
    // through bit-identical, or every marker on the map is standing somewhere slightly invented.
    const one = course('barnbougle-dunes', -40.9128, 147.6142)
    expect(spreadCoincident([one])).toEqual([{ course: one, lat: -40.9128, lon: 147.6142 }])
  })

  it('never edits the course it was given', () => {
    // `courses.ts` is the researched record. The nudge is a display position derived from it.
    const one = course('a', -37.9703, 145.0301)
    const two = course('b', -37.9703, 145.0301)
    spreadCoincident([one, two])
    expect(one.lat).toBe(-37.9703)
    expect(one.lon).toBe(145.0301)
  })

  it('returns exactly one pin per course, in the order given', () => {
    const pins = spreadCoincident(COURSES)
    expect(pins).toHaveLength(COURSES.length)
    expect(pins.map((p) => p.course.slug)).toEqual(COURSES.map((c) => c.slug))
  })

  it('separates the three groups that share a coordinate in the real dataset', () => {
    // Royal Melbourne West + East, The National's Gunnamatta + Moonah + Old, and 13th Beach's
    // two. Seven courses on three points: at full zoom the chips underneath cannot be clicked.
    const pins = spreadCoincident(COURSES)
    const positions = pins.map((p) => `${p.lat},${p.lon}`)
    expect(new Set(positions).size).toBe(COURSES.length)
  })

  it('keeps every nudged pin within ~50 m of its true point', () => {
    // The nudge exists to make a chip clickable, not to move a course. Anything that drifts
    // further than the length of a clubhouse is a bug in the metres-to-degrees conversion.
    for (const pin of spreadCoincident(COURSES)) {
      expect(metresApart(pin, pin.course), pin.course.slug).toBeLessThan(50)
    }
  })

  it('puts the first member of a group due north of the true point', () => {
    const [first, second] = spreadCoincident([
      course('a', -38.4602, 144.8815),
      course('b', -38.4602, 144.8815),
    ])
    expect(first.lat).toBeGreaterThan(-38.4602)
    expect(first.lon).toBeCloseTo(144.8815, 10)
    expect(second.lat).toBeLessThan(-38.4602)
  })

  it('draws a circle, not an ellipse, by dividing longitude by cos(latitude)', () => {
    // A degree of longitude is ~79% of a degree of latitude at -38°. Without the correction the
    // east/west members of a group land 21% short and the group reads as a squashed oval.
    const pins = spreadCoincident([
      course('n', -38, 145),
      course('e', -38, 145),
      course('s', -38, 145),
      course('w', -38, 145),
    ])
    for (const pin of pins) expect(metresApart(pin, pin.course)).toBeCloseTo(40, 6)
  })

  it('spaces a group of three evenly', () => {
    const pins = spreadCoincident([
      course('a', -38.3, 144.8),
      course('b', -38.3, 144.8),
      course('c', -38.3, 144.8),
    ])
    // Millimetre tolerance. The residual is the helper's own flat-earth approximation, which
    // scales longitude by each pair's own latitude; the function under test is exact.
    expect(metresApart(pins[0], pins[1])).toBeCloseTo(metresApart(pins[1], pins[2]), 2)
    expect(metresApart(pins[0], pins[2])).toBeCloseTo(metresApart(pins[1], pins[2]), 2)
  })
})

describe('clusterProjected', () => {
  const pin = (slug: string): MapPin => ({ course: course(slug, -38, 145), lat: -38, lon: 145 })

  it('merges points that fall inside one cell', () => {
    const clusters = clusterProjected(
      [projected(pin('a'), 10, 10), projected(pin('b'), 40, 30)],
      64,
    )
    expect(clusters).toHaveLength(1)
    expect(clusters[0].pins.map((p) => p.course.slug)).toEqual(['a', 'b'])
  })

  it('separates points that fall in different cells', () => {
    const clusters = clusterProjected(
      [projected(pin('a'), 10, 10), projected(pin('b'), 200, 10)],
      64,
    )
    expect(clusters).toHaveLength(2)
  })

  it('returns a lone pin as a cluster of one rather than a different shape', () => {
    // The component decides whether to draw a logo or a count. Two return types would push that
    // decision back into the maths, where it is not a maths question.
    const clusters = clusterProjected([projected(pin('a'), 10, 10)], 64)
    expect(clusters).toEqual([{ pins: [expect.objectContaining({})], x: 10, y: 10 }])
    expect(clusters[0].pins).toHaveLength(1)
  })

  it('positions a cluster at the mean of its members', () => {
    const clusters = clusterProjected(
      [projected(pin('a'), 10, 20), projected(pin('b'), 30, 60), projected(pin('c'), 50, 10)],
      256,
    )
    expect(clusters).toHaveLength(1)
    expect(clusters[0].x).toBeCloseTo(30, 10)
    expect(clusters[0].y).toBeCloseTo(30, 10)
  })

  it('is deterministic — same input, same output order', () => {
    // Leaflet redraws on every pan. An output whose order followed `Map` insertion would reshuffle
    // the marker list each time and make Svelte tear down and rebuild the whole DOM.
    const input = [
      projected(pin('a'), 500, 500),
      projected(pin('b'), 10, 10),
      projected(pin('c'), 500, 10),
      projected(pin('d'), 10, 500),
    ]
    const first = clusterProjected(input, 64)
    expect(clusterProjected([...input], 64)).toEqual(first)
    expect(clusterProjected([...input].reverse(), 64).map((c) => [c.x, c.y])).toEqual(
      first.map((c) => [c.x, c.y]),
    )
  })

  it('orders cells top-to-bottom then left-to-right', () => {
    const clusters = clusterProjected(
      [
        projected(pin('bottom-right'), 500, 500),
        projected(pin('top-right'), 500, 10),
        projected(pin('top-left'), 10, 10),
      ],
      64,
    )
    expect(clusters.map((c) => c.pins[0].course.slug)).toEqual([
      'top-left',
      'top-right',
      'bottom-right',
    ])
  })

  it('handles negative pixel coordinates, which a panned map produces', () => {
    // Leaflet's container point is negative for anything off the top or left edge. `Math.floor`
    // is used rather than truncation for exactly this reason: -1/64 truncates to cell 0.
    const clusters = clusterProjected(
      [projected(pin('a'), -10, -10), projected(pin('b'), 10, 10)],
      64,
    )
    expect(clusters).toHaveLength(2)
  })

  it('loses no pins', () => {
    const pins = spreadCoincident(COURSES).map((p, i) => projected(p, i * 7, i * 13))
    const total = clusterProjected(pins, 64).reduce((n, c) => n + c.pins.length, 0)
    expect(total).toBe(COURSES.length)
  })

  it('throws on a cell size that cannot form a grid', () => {
    const one = [projected(pin('a'), 0, 0)]
    expect(() => clusterProjected(one, 0)).toThrow(/positive cell size/)
    expect(() => clusterProjected(one, -64)).toThrow(/positive cell size/)
    expect(() => clusterProjected(one, Number.NaN)).toThrow(/positive cell size/)
  })
})

describe('feeLabel', () => {
  it('dates the figure, so a snapshot cannot read as current', () => {
    expect(
      feeLabel(
        course('x', -38, 145, {
          greenFee: { amount: 395, currency: 'AUD' },
          checkedOn: '2026-08-24',
        }),
      ),
    ).toBe('$395 · checked Aug 2026')
  })

  it('renders an absent fee as a dash — never "Free", never "$0"', () => {
    // Forty of the hundred publish no visitor rate. A `0` would be wrong in the most expensive
    // possible direction, and "Free" would be a finding the research never made.
    const label = feeLabel(course('x', -38, 145, { checkedOn: '2026-08-24' }))
    expect(label).toBe('—')
    expect(label).not.toMatch(/free|\$0/i)
  })

  it('groups thousands', () => {
    expect(
      feeLabel(
        course('x', -38, 145, {
          greenFee: { amount: 1250, currency: 'AUD' },
          checkedOn: '2026-08-24',
        }),
      ),
    ).toBe('$1,250 · checked Aug 2026')
  })

  it('dates every fee in the real dataset', () => {
    for (const c of COURSES) {
      if (c.greenFee !== undefined) expect(feeLabel(c), c.slug).toMatch(/· checked \w+ \d{4}$/)
    }
  })
})

describe('checkedLabel', () => {
  it('reads the ISO date as UTC, so a local timezone cannot roll it back a day', () => {
    // Parsed locally, `2026-09-01` west of Greenwich is 31 August — and the label would say Aug.
    // `Sept`, not `Sep`: that is the Australian and British abbreviation, and the site is en-GB.
    expect(checkedLabel('2026-09-01')).toBe('Sept 2026')
    expect(checkedLabel('2026-08-24')).toBe('Aug 2026')
  })
})

describe('ACCESS_LABELS', () => {
  it('words all four values', () => {
    const values: Access[] = ['public', 'limited', 'members', 'unknown']
    for (const value of values) expect(ACCESS_LABELS[value]).toBeTruthy()
  })

  it('says unknown rather than rounding it to public or members-only', () => {
    // Eight courses are `unknown`. Rendering one of them as members-only invents a finding.
    expect(ACCESS_LABELS.unknown.toLowerCase()).toContain('unknown')
    expect(ACCESS_LABELS.unknown).not.toBe(ACCESS_LABELS.members)
    expect(ACCESS_LABELS.unknown).not.toBe(ACCESS_LABELS.public)
  })
})
