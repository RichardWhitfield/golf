import { describe, expect, it } from 'vitest'
import { CLUBS, KPI_CLUB, clubInfo, compareClubs, isClub, normaliseClub } from './clubs'

describe('normaliseClub', () => {
  /** Every display string observed across 5,877 strokes on 2026-08-04. */
  const VERIFIED: [string, string][] = [
    ['Driver', 'DRIVER'],
    ['3Wood', 'WOOD3'],
    ['5Wood', 'WOOD5'],
    ['4Iron', 'IRON4'],
    ['5Iron', 'IRON5'],
    ['6Iron', 'IRON6'],
    ['7Iron', 'IRON7'],
    ['8Iron', 'IRON8'],
    ['9Iron', 'IRON9'],
    ['PitchingWedge', 'PITCHING_WEDGE'],
    ['50Wedge', 'WEDGE50'],
    ['SandWedge', 'SAND_WEDGE'],
    ['58Wedge', 'WEDGE58'],
    ['60Wedge', 'WEDGE60'],
  ]

  it.each(VERIFIED)('maps %s to %s', (display, id) => {
    expect(normaliseClub(display)).toBe(id)
  })

  it('returns null for an unseen string rather than guessing', () => {
    // Is a hybrid `3Hybrid` or `Hybrid3`? Unknown, so it stays out of the table until seen.
    expect(normaliseClub('3Hybrid')).toBeNull()
    expect(normaliseClub('')).toBeNull()
  })

  it('does not resolve inherited Object properties', () => {
    expect(normaliseClub('toString')).toBeNull()
    expect(normaliseClub('constructor')).toBeNull()
  })

  it('covers every club in CLUBS', () => {
    const mapped = new Set(VERIFIED.map(([, id]) => id))
    expect(CLUBS.map((c) => c.id).sort()).toEqual([...mapped].sort())
  })
})

describe('CLUBS', () => {
  it('is in bag order, longest first', () => {
    expect(CLUBS[0].id).toBe('DRIVER')
    expect(CLUBS.at(-1)?.id).toBe('WEDGE60')
  })

  it('gives every club a monospace-friendly short label', () => {
    expect(clubInfo('DRIVER').short).toBe('DRIVER')
    expect(clubInfo('IRON7').short).toBe('7I')
    expect(clubInfo('WEDGE58').short).toBe('58°')
  })

  it('names the driver as the KPI club', () => {
    expect(KPI_CLUB).toBe('DRIVER')
  })
})

describe('compareClubs', () => {
  it('orders by the bag, not alphabetically', () => {
    expect(compareClubs('DRIVER', 'IRON4')).toBeLessThan(0)
    expect(compareClubs('WEDGE60', 'IRON4')).toBeGreaterThan(0)
    expect(compareClubs('IRON7', 'IRON7')).toBe(0)
  })

  it('sorts a shuffled list back into bag order', () => {
    const shuffled = ['SAND_WEDGE', 'DRIVER', 'IRON7', 'WOOD3'] as const
    expect([...shuffled].sort(compareClubs)).toEqual(['DRIVER', 'WOOD3', 'IRON7', 'SAND_WEDGE'])
  })
})

describe('isClub', () => {
  it('accepts a known id and rejects everything else', () => {
    expect(isClub('DRIVER')).toBe(true)
    expect(isClub('SPOON')).toBe(false)
    expect(isClub(undefined)).toBe(false)
    expect(isClub(7)).toBe(false)
  })
})
