import { describe, expect, it } from 'vitest'
import {
  defaultLocation,
  draftForDay,
  draftFromSession,
  newSessionId,
  seedEntries,
  toSession,
  validateDraft,
} from './session'
import type { PracticeSession } from './types'
import { DRILLS, drill } from './drills'
import { WEEK } from './plan'

describe('newSessionId', () => {
  it('produces distinct non-empty ids', () => {
    const ids = new Set(Array.from({ length: 50 }, newSessionId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id.length).toBeGreaterThan(0)
  })
})

describe('defaultLocation', () => {
  it('sends Monday to the simulator', () => {
    expect(defaultLocation('mon')).toBe('sim')
  })

  it('sends every other day outdoors', () => {
    for (const day of ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
      expect(defaultLocation(day)).toBe('home')
    }
  })
})

describe('seedEntries', () => {
  it('offers all seven drills in drill order', () => {
    expect(seedEntries('wed').map((e) => e.drillId)).toEqual(DRILLS.map((d) => d.id))
  })

  it("pre-selects exactly the day's scheduled drills", () => {
    const selected = seedEntries('wed').filter((e) => e.selected).map((e) => e.drillId)
    expect(selected).toEqual(['01', '04'])
  })

  it('pre-selects the right drills for every day of the week', () => {
    // Compared as sets, deliberately. `WEEK[day].drills` is authored in the order the drills
    // are *worked* — Monday is ['04','06','02'] — while the form lists all seven in stable
    // 01-07 order so the rows never reshuffle as you tick them. The selection must match; the
    // sequence must not be asserted, or the form would be forced to reorder itself.
    for (const [day, plan] of Object.entries(WEEK)) {
      const selected = seedEntries(day as keyof typeof WEEK)
        .filter((e) => e.selected)
        .map((e) => e.drillId)
      expect(new Set(selected)).toEqual(new Set(plan.drills))
      expect(selected).toHaveLength(plan.drills.length)
    }
  })

  it('lists the selected drills in stable drill order, not the plan\'s working order', () => {
    // Monday's plan order is ['04','06','02']; the form must still read 02, 04, 06.
    const selected = seedEntries('mon').filter((e) => e.selected).map((e) => e.drillId)
    expect(selected).toEqual(['02', '04', '06'])
  })

  it("seeds each entry's swings from the drill's authored default", () => {
    for (const entry of seedEntries('wed')) {
      expect(entry.swings).toBe(drill(entry.drillId).defaultSwings)
    }
  })

  it('starts feel at a neutral, untouched 3', () => {
    for (const entry of seedEntries('wed')) {
      expect(entry.feel).toBe(3)
      expect(entry.feelTouched).toBe(false)
    }
  })
})

describe('draftForDay', () => {
  it('carries the date and the day-appropriate location', () => {
    const draft = draftForDay('mon', '2026-08-03')
    expect(draft.date).toBe('2026-08-03')
    expect(draft.location).toBe('sim')
    expect(draft.notes).toBe('')
  })
})

describe('toSession', () => {
  const draft = draftForDay('wed', '2026-08-05', 'fixed-id')

  it('keeps only the selected drills', () => {
    expect(toSession(draft).entries.map((e) => e.drillId)).toEqual(['01', '04'])
  })

  it('drops the draft-only fields from each entry', () => {
    const [entry] = toSession(draft).entries
    expect(entry).toEqual({ drillId: '01', swings: drill('01').defaultSwings, feel: 3 })
  })

  it('preserves the id so a save is an update rather than an insert', () => {
    expect(toSession(draft).id).toBe('fixed-id')
  })

  it('stamps the session type', () => {
    expect(toSession(draft).type).toBe('practice')
  })

  it('omits empty notes entirely rather than storing a blank string', () => {
    expect(toSession(draft).notes).toBeUndefined()
  })

  it('trims notes that were written', () => {
    expect(toSession({ ...draft, notes: '  felt rushed  ' }).notes).toBe('felt rushed')
  })
})

describe('draftFromSession', () => {
  const session: PracticeSession = {
    id: 'abc',
    type: 'practice',
    date: '2026-08-05',
    location: 'course',
    entries: [{ drillId: '04', swings: 30, feel: 5 }],
    notes: 'good one',
  }

  it('round-trips through toSession unchanged', () => {
    expect(toSession(draftFromSession(session))).toEqual(session)
  })

  it('offers all seven drills so others can be added while editing', () => {
    expect(draftFromSession(session).entries).toHaveLength(DRILLS.length)
  })

  it('marks stored feel values as already judged', () => {
    const entry = draftFromSession(session).entries.find((e) => e.drillId === '04')
    expect(entry?.feelTouched).toBe(true)
    expect(entry?.selected).toBe(true)
  })

  it('leaves unselected drills at their authored default', () => {
    const entry = draftFromSession(session).entries.find((e) => e.drillId === '01')
    expect(entry?.selected).toBe(false)
    expect(entry?.swings).toBe(drill('01').defaultSwings)
  })
})

describe('validateDraft', () => {
  const valid = draftForDay('wed', '2026-08-05')

  it('accepts a seeded draft as-is', () => {
    expect(validateDraft(valid)).toEqual([])
  })

  it('rejects a malformed date', () => {
    expect(validateDraft({ ...valid, date: '5 August' })).toContain('Pick a valid date.')
  })

  it('rejects a session with nothing ticked', () => {
    const empty = { ...valid, entries: valid.entries.map((e) => ({ ...e, selected: false })) }
    expect(validateDraft(empty)).toContain('Tick at least one drill.')
  })

  it('rejects a non-positive swing count on a ticked drill', () => {
    const entries = valid.entries.map((e) => (e.selected ? { ...e, swings: 0 } : e))
    expect(validateDraft({ ...valid, entries })).toContain('Drill 01 needs at least one swing.')
  })

  it('rejects a fractional swing count', () => {
    const entries = valid.entries.map((e) => (e.selected ? { ...e, swings: 7.5 } : e))
    expect(validateDraft({ ...valid, entries }).length).toBeGreaterThan(0)
  })

  it('ignores swing counts on drills that are not ticked', () => {
    const entries = valid.entries.map((e) => (e.selected ? e : { ...e, swings: 0 }))
    expect(validateDraft({ ...valid, entries })).toEqual([])
  })
})
