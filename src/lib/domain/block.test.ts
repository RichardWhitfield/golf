import { describe, expect, it } from 'vitest'
import { blockPosition, dayKeyFor, daysBetween, parseISODate } from './block'
import { ARC } from './plan'

describe('parseISODate', () => {
  it('parses a valid date to UTC midnight', () => {
    expect(parseISODate('2026-08-03')).toBe(Date.UTC(2026, 7, 3))
  })

  it('rejects malformed input', () => {
    expect(parseISODate('3 August 2026')).toBeNull()
    expect(parseISODate('2026-8-3')).toBeNull()
    expect(parseISODate('')).toBeNull()
  })

  it('rejects dates that do not exist rather than rolling them over', () => {
    // Date.UTC(2026, 1, 30) silently becomes 2 March. That must not pass.
    expect(parseISODate('2026-02-30')).toBeNull()
    expect(parseISODate('2026-13-01')).toBeNull()
  })
})

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-08-03', '2026-08-10')).toBe(7)
  })

  it('counts backward as a negative', () => {
    expect(daysBetween('2026-08-10', '2026-08-03')).toBe(-7)
  })

  it('is unaffected by a Sydney daylight-saving change', () => {
    // NSW moves to AEDT on Sunday 4 October 2026. Local-midnight arithmetic
    // would return 6.958… days here and floor to 6.
    expect(daysBetween('2026-09-28', '2026-10-05')).toBe(7)
  })

  it('returns null when either date is malformed', () => {
    expect(daysBetween('nope', '2026-08-03')).toBeNull()
    expect(daysBetween('2026-08-03', 'nope')).toBeNull()
  })
})

describe('dayKeyFor', () => {
  it('names the weekday a date falls on', () => {
    expect(dayKeyFor('2026-08-03')).toBe('mon') // a Monday
    expect(dayKeyFor('2026-08-09')).toBe('sun')
  })

  it('covers a whole week', () => {
    const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    keys.forEach((key, i) => {
      expect(dayKeyFor(`2026-08-${String(3 + i).padStart(2, '0')}`)).toBe(key)
    })
  })

  it('returns null for a malformed date', () => {
    expect(dayKeyFor('3 August')).toBeNull()
  })
})

describe('blockPosition', () => {
  const START = '2026-08-03' // a Monday

  it('puts the first day in week one', () => {
    expect(blockPosition(START, START)).toEqual({ week: 1, dayOfBlock: 1, phase: ARC[0] })
  })

  it('keeps day seven in week one', () => {
    expect(blockPosition(START, '2026-08-09')?.week).toBe(1)
  })

  it('starts week two on day eight', () => {
    expect(blockPosition(START, '2026-08-10')).toEqual({ week: 2, dayOfBlock: 8, phase: ARC[1] })
  })

  it('starts week three on day fifteen', () => {
    expect(blockPosition(START, '2026-08-17')).toEqual({ week: 3, dayOfBlock: 15, phase: ARC[2] })
  })

  it('includes the final day of week three', () => {
    expect(blockPosition(START, '2026-08-23')?.week).toBe(3)
  })

  it('returns null the day after the block ends', () => {
    expect(blockPosition(START, '2026-08-24')).toBeNull()
  })

  it('returns null before the block starts', () => {
    expect(blockPosition(START, '2026-08-02')).toBeNull()
  })

  it('returns null when either date is malformed', () => {
    expect(blockPosition('nope', START)).toBeNull()
    expect(blockPosition(START, 'nope')).toBeNull()
  })

  it('spans a daylight-saving change without losing a day', () => {
    // Block starting Monday 28 September 2026 crosses the AEDT switch on 4 October.
    expect(blockPosition('2026-09-28', '2026-10-05')?.week).toBe(2)
    expect(blockPosition('2026-09-28', '2026-10-18')?.week).toBe(3)
    expect(blockPosition('2026-09-28', '2026-10-19')).toBeNull()
  })
})
