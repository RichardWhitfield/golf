import { describe, expect, it } from 'vitest'
import { BAND, CHART, DOMAIN, inBand, inRange, radiusFor, xFor, xIn, yFor, yIn } from './scale'

describe('DOMAIN', () => {
  it('is fixed, and wide enough to hold every real reading', () => {
    // The backfill spans -13.76 to +0.89. A derived domain would move between
    // visits and quietly redefine "good" as "better than recent".
    expect(DOMAIN.min).toBe(-14)
    expect(DOMAIN.max).toBe(4)
  })

  it('keeps the overshoot fault region on screen', () => {
    // No reading has ever exceeded +2, but overshooting is a fault and must be
    // visible as one. There is real headroom above the band.
    expect(DOMAIN.max).toBeGreaterThan(BAND.max)
    expect(DOMAIN.min).toBeLessThan(BAND.min)
  })

  it('is a band centred on zero, not a maximum', () => {
    expect(BAND.min).toBe(-2)
    expect(BAND.max).toBe(2)
  })
})

describe('yFor', () => {
  it('maps the domain endpoints exactly onto the plot area', () => {
    expect(yFor(DOMAIN.max)).toBeCloseTo(CHART.padT)
    expect(yFor(DOMAIN.min)).toBeCloseTo(CHART.h - CHART.padB)
  })

  it('puts a larger degree value higher up the chart', () => {
    // SVG y grows downward, so "higher" means a smaller number.
    expect(yFor(0)).toBeLessThan(yFor(-8))
    expect(yFor(-2)).toBeLessThan(yFor(-10))
  })

  it('clamps a reading outside the domain rather than drawing off-panel', () => {
    expect(yFor(-40)).toBeCloseTo(yFor(DOMAIN.min))
    expect(yFor(40)).toBeCloseTo(yFor(DOMAIN.max))
  })

  it('places the whole band inside the plot area', () => {
    expect(yFor(BAND.max)).toBeGreaterThan(CHART.padT)
    expect(yFor(BAND.min)).toBeLessThan(CHART.h - CHART.padB)
  })
})

describe('xFor', () => {
  it('maps the first and last dates onto the plot edges', () => {
    expect(xFor('2025-07-03', '2025-07-03', '2026-07-27')).toBeCloseTo(CHART.padL)
    expect(xFor('2026-07-27', '2025-07-03', '2026-07-27')).toBeCloseTo(CHART.w - CHART.padR)
  })

  it('spaces points by real elapsed time, not by session index', () => {
    // Jan 2026 has no sessions at all. A session-index axis would compress that
    // two-month gap into one step.
    const dec = xFor('2025-12-06', '2025-07-03', '2026-07-27')!
    const feb = xFor('2026-02-02', '2025-07-03', '2026-07-27')!
    const feb16 = xFor('2026-02-16', '2025-07-03', '2026-07-27')!
    expect(feb - dec).toBeGreaterThan(feb16 - feb)
  })

  it('centres a single-date series instead of dividing by zero', () => {
    const x = xFor('2025-07-03', '2025-07-03', '2025-07-03')
    expect(Number.isFinite(x!)).toBe(true)
    expect(x).toBeCloseTo(CHART.padL + (CHART.w - CHART.padL - CHART.padR) / 2)
  })

  it('returns null for a malformed date rather than NaN', () => {
    expect(xFor('nope', '2025-07-03', '2026-07-27')).toBeNull()
    expect(xFor('2025-07-03', 'nope', '2026-07-27')).toBeNull()
    expect(xFor('2025-07-03', '2025-07-03', 'nope')).toBeNull()
  })
})

describe('radiusFor', () => {
  it('returns null when there is no shot count', () => {
    // A hand-typed reading has no n. There is nothing to size it by, and
    // inventing one would weight a guess as though it were measured.
    expect(radiusFor(undefined)).toBeNull()
  })

  it('makes a well-measured reading heavier than a thin one', () => {
    // -11.53 on 2026-07-20 is three shots. It must not shout as loudly as a
    // 73-shot reading.
    expect(radiusFor(73)!).toBeGreaterThan(radiusFor(3)!)
  })

  it('compresses the range so 73 shots is not 24x the area of 3', () => {
    expect(radiusFor(73)! / radiusFor(3)!).toBeLessThan(3)
  })

  it('clamps at both ends so no dot vanishes or swamps the panel', () => {
    expect(radiusFor(1)!).toBeGreaterThanOrEqual(2)
    expect(radiusFor(10_000)!).toBeLessThanOrEqual(6.5)
  })

  it('treats a nonsensical count as absent rather than trusting it', () => {
    expect(radiusFor(0)).toBeNull()
    expect(radiusFor(-5)).toBeNull()
    expect(radiusFor(Number.NaN)).toBeNull()
  })
})

describe('inBand', () => {
  it('includes both edges', () => {
    expect(inBand(-2)).toBe(true)
    expect(inBand(2)).toBe(true)
    expect(inBand(0)).toBe(true)
  })

  it('excludes a fault on either side', () => {
    // Overshooting is a fault, not success. Both of these are outside.
    expect(inBand(-2.01)).toBe(false)
    expect(inBand(2.01)).toBe(false)
    expect(inBand(-8.51)).toBe(false)
  })
})

describe('yIn', () => {
  it('places a value against any authored domain, not just club path', () => {
    const domain = { min: 40, max: 66 }
    expect(yIn(66, domain)).toBeCloseTo(yIn(DOMAIN.max, DOMAIN), 10)
    expect(yIn(40, domain)).toBeCloseTo(yIn(DOMAIN.min, DOMAIN), 10)
  })

  it('clamps rather than drawing off-panel', () => {
    const domain = { min: 40, max: 66 }
    expect(yIn(200, domain)).toBe(yIn(66, domain))
    expect(yIn(0, domain)).toBe(yIn(40, domain))
  })

  it('leaves yFor behaving exactly as it did', () => {
    for (const degrees of [-14, -5.4, 0, 2, 4]) {
      expect(yFor(degrees)).toBe(yIn(degrees, DOMAIN))
    }
  })
})

describe('xIn', () => {
  it('places a value against any authored domain', () => {
    const domain = { min: 40, max: 66 }
    expect(xIn(domain.min, domain)).toBe(CHART.padL)
    expect(xIn(domain.max, domain)).toBeCloseTo(CHART.w - CHART.padR, 10)
    expect(xIn(53, domain)).toBeCloseTo((CHART.padL + (CHART.w - CHART.padR)) / 2, 10)
  })

  it('clamps rather than drawing off-panel', () => {
    const domain = { min: 40, max: 66 }
    expect(xIn(200, domain)).toBe(xIn(66, domain))
    expect(xIn(0, domain)).toBe(xIn(40, domain))
  })

  it('grows the opposite way to yIn, because SVG y grows downward', () => {
    const domain = { min: -4, max: 12 }
    // `domain.min` is the smallest x but the *largest* y.
    expect(xIn(domain.min, domain)).toBeLessThan(xIn(domain.max, domain))
    expect(yIn(domain.min, domain)).toBeGreaterThan(yIn(domain.max, domain))
  })
})

describe('inRange', () => {
  it('is inclusive of both edges', () => {
    expect(inRange(-2, BAND)).toBe(true)
    expect(inRange(2, BAND)).toBe(true)
    expect(inRange(2.01, BAND)).toBe(false)
  })

  it('treats overshooting as a fault, never as better', () => {
    // The target is a band, not a maximum. +5 is outside it exactly as -5 is.
    expect(inRange(5, BAND)).toBe(false)
    expect(inRange(-5, BAND)).toBe(false)
  })
})
