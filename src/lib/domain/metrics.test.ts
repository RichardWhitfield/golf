import { describe, expect, it } from 'vitest'
import { METRICS, METRIC_FIELDS, bestOf, isMetricId, metricInfo, readingFor } from './metrics'
import { BAND, DOMAIN } from './scale'
import type { ClubPath } from './types'

describe('the registry', () => {
  it('covers exactly the twelve metrics the spec chose', () => {
    expect(METRICS).toHaveLength(12)
    expect(METRICS.map((m) => m.id)).toEqual([
      'clubPath', 'faceAngle', 'faceToPath', 'swingPlane', 'attackAngle', 'curve',
      'clubSpeed', 'carry', 'lowPointDistance', 'lowPointSide', 'dynamicLoft', 'spinLoft',
    ])
  })

  it('excludes the fields that hold no data at all', () => {
    // 100% null across 5,877 real strokes. Charting them would draw an empty panel.
    for (const dead of ['strokeLength', 'backswingTime', 'forwardswingTime', 'tempo']) {
      expect(METRIC_FIELDS).not.toContain(dead)
    }
  })

  it('excludes swingDirection as near-collinear with the KPI', () => {
    // r = 0.819 with clubPath on the driver — a second panel saying the same thing (OQ-8).
    expect(METRIC_FIELDS).not.toContain('swingDirection')
  })

  it('gives every metric a fixed domain wide enough to hold its band', () => {
    for (const m of METRICS) {
      expect(m.domain.max).toBeGreaterThan(m.domain.min)
      if (m.band) {
        expect(m.band.min).toBeGreaterThanOrEqual(m.domain.min)
        expect(m.band.max).toBeLessThanOrEqual(m.domain.max)
      }
    }
  })

  it('reuses the club-path domain rather than restating it', () => {
    // One value, one home. A second copy would drift from scale.ts silently.
    expect(metricInfo('clubPath').domain).toEqual(DOMAIN)
    expect(metricInfo('clubPath').band).toEqual(BAND)
  })

  it('gives a band only to metrics that have a real target', () => {
    // attackAngle wants positive on a driver and negative on an iron. There is no shared
    // target, and inventing one would be worse than admitting it.
    for (const m of METRICS) {
      if (m.better === 'none') expect(m.band).toBeUndefined()
    }
    expect(metricInfo('attackAngle').better).toBe('none')
    expect(metricInfo('swingPlane').better).toBe('none')
  })
})

describe('bestOf', () => {
  it('prefers the reading closest to neutral, never the largest', () => {
    // +5 is a worse fault than +1: overshooting the band counts against you.
    expect(bestOf([-5, 1, 5], 'neutral')).toBe(1)
    expect(bestOf([-8, -6], 'neutral')).toBe(-6)
  })

  it('keeps the sign when picking the closest to neutral', () => {
    // Never Math.abs on a signed value — that would accept a sign flip.
    expect(bestOf([-1, 3], 'neutral')).toBe(-1)
  })

  it('takes the largest where larger genuinely is better', () => {
    expect(bestOf([120, 155, 140], 'higher')).toBe(155)
  })

  it('has no answer where the metric has no target', () => {
    expect(bestOf([50, 60], 'none')).toBeUndefined()
  })

  it('has no answer with nothing to reduce', () => {
    expect(bestOf([], 'neutral')).toBeUndefined()
  })
})

describe('isMetricId', () => {
  it('rejects a value that is not a metric, including inherited object keys', () => {
    expect(isMetricId('clubPath')).toBe(true)
    expect(isMetricId('toString')).toBe(false)
    expect(isMetricId('swingDirection')).toBe(false)
  })
})

describe('readingFor', () => {
  const row: ClubPath = {
    club: 'DRIVER',
    typical: -5.4,
    best: -0.19,
    n: 618,
    metrics: { swingPlane: { typical: 49.75, n: 666 } },
  }

  it('reads club path from its own dedicated fields, never from the metrics map', () => {
    // Club path is NOT duplicated into `metrics`. One value, one home.
    expect(readingFor(row, 'clubPath')).toEqual({ typical: -5.4, best: -0.19, n: 618 })
    expect(row.metrics).not.toHaveProperty('clubPath')
  })

  it('reads every other metric from the map', () => {
    expect(readingFor(row, 'swingPlane')).toEqual({ typical: 49.75, n: 666 })
  })

  it('reports an absent metric as absent, never as a zero reading', () => {
    expect(readingFor(row, 'curve')).toBeUndefined()
  })

  it('reports a hand-typed row as having no wider metrics and no club-path count', () => {
    // A hand-typed row has no `metrics` at all and no `n` — the form takes neither.
    const typed: ClubPath = { club: 'DRIVER', typical: -6, best: -4 }
    expect(readingFor(typed, 'swingPlane')).toBeUndefined()
    expect(readingFor(typed, 'clubPath')?.n).toBeUndefined()
  })
})
