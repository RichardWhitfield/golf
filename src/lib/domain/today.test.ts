import { describe, expect, it } from 'vitest'
import { dayKeyFromLocalTime, formatDayLabel, resolveDayKey } from './today'
import { DAY_ORDER, OUTDOOR_DAYS, WEEK } from './plan'
import { DRILLS, DRILL_GROUPS } from './drills'

describe('resolveDayKey', () => {
  it('resolves the Sydney day when UTC is still on the previous day', () => {
    // 2026-08-02 23:00 UTC is Monday 3 August, 09:00 in Sydney (AEST, +10).
    expect(resolveDayKey(new Date('2026-08-02T23:00:00Z'))).toBe('mon')
  })

  it('honours Sydney daylight saving', () => {
    // 2026-01-04 13:30 UTC is Monday 5 January, 00:30 in Sydney (AEDT, +11).
    // Under +10 this instant would still be Sunday, so this pins the DST offset.
    expect(resolveDayKey(new Date('2026-01-04T13:30:00Z'))).toBe('mon')
  })

  it('resolves every day of the week', () => {
    // 05:00 UTC is mid-afternoon in Sydney on the same date, well clear of any boundary.
    const monday = 3 // 2026-08-03 is a Monday
    DAY_ORDER.forEach((key, i) => {
      const date = new Date(`2026-08-${String(monday + i).padStart(2, '0')}T05:00:00Z`)
      expect(resolveDayKey(date)).toBe(key)
    })
  })
})

describe('dayKeyFromLocalTime', () => {
  it('maps the JS week (Sunday = 0) onto a Monday-first week', () => {
    // Constructed in local time deliberately — this is the fallback path.
    expect(dayKeyFromLocalTime(new Date(2026, 7, 3))).toBe('mon')
    expect(dayKeyFromLocalTime(new Date(2026, 7, 9))).toBe('sun')
  })
})

describe('formatDayLabel', () => {
  it('formats the Sydney date in British/Australian style', () => {
    expect(formatDayLabel(new Date('2026-08-02T23:00:00Z'))).toBe('3 August')
  })
})

describe('plan integrity', () => {
  it('has a plan for every day', () => {
    for (const key of DAY_ORDER) expect(WEEK[key]).toBeDefined()
  })

  it('only references drills that exist', () => {
    const ids = new Set(DRILLS.map((d) => d.id))
    for (const key of DAY_ORDER) {
      for (const id of WEEK[key].drills) expect(ids).toContain(id)
    }
  })

  it('gives every outdoor day a menu label', () => {
    for (const key of OUTDOOR_DAYS) expect(WEEK[key].menuLabel).toBeTruthy()
  })

  it('groups all seven drills exactly once', () => {
    const grouped = DRILL_GROUPS.flatMap((g) => g.drills)
    expect(grouped).toHaveLength(DRILLS.length)
    expect(new Set(grouped).size).toBe(DRILLS.length)
  })

  it('keeps drill ids 01-07 stable and gives every drill a feel cue', () => {
    expect(DRILLS.map((d) => d.id)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
    for (const d of DRILLS) expect(d.feelsLike).toBeTruthy()
  })
})
