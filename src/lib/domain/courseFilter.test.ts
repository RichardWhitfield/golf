import { describe, expect, it } from 'vitest'
import { COURSES, type Access, type AusState, type Course } from './courses'
import {
  FEE_BANDS,
  MARK_FILTERS,
  STATES_PRESENT,
  activeCount,
  countOptions,
  emptyFilter,
  feeBand,
  filterCourses,
  matchesFilter,
  toggle,
  type CourseFilter,
  type FeeBand,
} from './courseFilter'
import type { DestinationNotes, DestinationStatus } from './types'

function course(slug: string, extra: Partial<Course> = {}): Course {
  return {
    slug,
    rank: 1,
    name: slug,
    suburb: 'Somewhere',
    state: 'VIC',
    lat: -38,
    lon: 145,
    architects: [],
    summary: 'A course.',
    access: 'public',
    ...extra,
  }
}

const fee = (amount: number) => ({ amount, currency: 'AUD' as const })

/** A filter with only the named groups populated. Everything else stays empty — "no constraint". */
function filter(partial: Partial<Record<keyof CourseFilter, string[]>> = {}): CourseFilter {
  const base = emptyFilter()
  for (const [group, values] of Object.entries(partial)) {
    for (const value of values ?? []) {
      ;(base[group as keyof CourseFilter] as Set<string>).add(value)
    }
  }
  return base
}

const marksOf = (entries: Record<string, DestinationStatus>): DestinationNotes =>
  Object.fromEntries(
    Object.entries(entries).map(([slug, status]) => [slug, { status, markedOn: '2026-08-24' }]),
  )

describe('feeBand', () => {
  it('places a fee in its band, inclusive at the lower edge', () => {
    expect(feeBand(course('a', { greenFee: fee(55) }))).toBe('under100')
    expect(feeBand(course('a', { greenFee: fee(99) }))).toBe('under100')
    expect(feeBand(course('a', { greenFee: fee(100) }))).toBe('100to199')
    expect(feeBand(course('a', { greenFee: fee(199) }))).toBe('100to199')
    expect(feeBand(course('a', { greenFee: fee(200) }))).toBe('200to349')
    expect(feeBand(course('a', { greenFee: fee(349) }))).toBe('200to349')
    expect(feeBand(course('a', { greenFee: fee(350) }))).toBe('350plus')
    expect(feeBand(course('a', { greenFee: fee(800) }))).toBe('350plus')
  })

  it('gives an absent fee its own band, never the cheapest one', () => {
    // The rule that keeps `feeLabel` from rendering a dash as "Free". A course with no published
    // rate is not a cheap course, and forty of the hundred are in this state.
    expect(feeBand(course('a'))).toBe('none')
    expect(feeBand(course('a', { greenFee: undefined }))).toBe('none')
  })

  it('does not read a zero as an absent fee, or an absent fee as a zero', () => {
    // `greenFee` is absent, never 0, so a 0 should never reach this. If one ever does it must
    // land in `under100` and not silently become "no fee published" — the two are different
    // findings and rounding either way invents one.
    expect(feeBand(course('a', { greenFee: fee(0) }))).toBe('under100')
  })
})

describe('matchesFilter', () => {
  it('matches everything when no group is constrained', () => {
    const empty = emptyFilter()
    expect(COURSES.every((c) => matchesFilter(c, undefined, empty))).toBe(true)
  })

  it('treats an empty group as no constraint, never as "match nothing"', () => {
    // The same rule as an absent destination key meaning "no opinion". The absence of a choice
    // is not a choice to exclude everything.
    const onlyState = filter({ states: ['TAS'] })
    expect(matchesFilter(course('a', { state: 'TAS', access: 'members' }), undefined, onlyState)).toBe(true)
    expect(matchesFilter(course('a', { state: 'VIC', access: 'members' }), undefined, onlyState)).toBe(false)
  })

  it('is a union within a group and an intersection across groups', () => {
    const f = filter({ states: ['TAS', 'SA'], access: ['public'] })
    expect(matchesFilter(course('a', { state: 'TAS', access: 'public' }), undefined, f)).toBe(true)
    expect(matchesFilter(course('a', { state: 'SA', access: 'public' }), undefined, f)).toBe(true)
    // Right state, wrong access.
    expect(matchesFilter(course('a', { state: 'TAS', access: 'limited' }), undefined, f)).toBe(false)
    // Right access, wrong state.
    expect(matchesFilter(course('a', { state: 'VIC', access: 'public' }), undefined, f)).toBe(false)
  })

  it('never lets an unknown access match a members-only filter', () => {
    // Rounding an unconfirmed club up to members-only is inventing a finding — the same rule
    // that gives `unknown` its own label and its own dashed pill.
    const members = filter({ access: ['members'] })
    expect(matchesFilter(course('a', { access: 'unknown' }), undefined, members)).toBe(false)
    const unknown = filter({ access: ['unknown'] })
    expect(matchesFilter(course('a', { access: 'members' }), undefined, unknown)).toBe(false)
  })

  it('filters by mark, with unmarked as a real option', () => {
    const want = filter({ marks: ['want'] })
    expect(matchesFilter(course('a'), 'want', want)).toBe(true)
    expect(matchesFilter(course('a'), 'played', want)).toBe(false)
    expect(matchesFilter(course('a'), undefined, want)).toBe(false)

    const unmarked = filter({ marks: ['unmarked'] })
    expect(matchesFilter(course('a'), undefined, unmarked)).toBe(true)
    expect(matchesFilter(course('a'), 'want', unmarked)).toBe(false)
    expect(matchesFilter(course('a'), 'played', unmarked)).toBe(false)
  })

  it('keeps a no-fee course when its own band is selected', () => {
    const noFee = filter({ bands: ['none'] })
    expect(matchesFilter(course('a'), undefined, noFee)).toBe(true)
    expect(matchesFilter(course('a', { greenFee: fee(80) }), undefined, noFee)).toBe(false)
  })

  it('hides a no-fee course from a priced band, so the count is honest', () => {
    const cheap = filter({ bands: ['under100'] })
    expect(matchesFilter(course('a'), undefined, cheap)).toBe(false)
    expect(matchesFilter(course('a', { greenFee: fee(80) }), undefined, cheap)).toBe(true)
  })
})

describe('filterCourses', () => {
  it('returns every course in rank order when nothing is set', () => {
    const all = filterCourses(COURSES, {}, emptyFilter())
    expect(all).toHaveLength(100)
    expect(all.map((c) => c.rank)).toEqual(COURSES.map((c) => c.rank))
  })

  it('preserves rank order after filtering — it never sorts', () => {
    const tas = filterCourses(COURSES, {}, filter({ states: ['TAS'] }))
    expect(tas.map((c) => c.rank)).toEqual([...tas.map((c) => c.rank)].sort((a, b) => a - b))
    expect(tas.every((c) => c.state === 'TAS')).toBe(true)
  })

  it('reads the mark for each course from the notes it is given', () => {
    const marks = marksOf({ [COURSES[0].slug]: 'played', [COURSES[1].slug]: 'want' })
    expect(filterCourses(COURSES, marks, filter({ marks: ['played'] }))).toEqual([COURSES[0]])
    expect(filterCourses(COURSES, marks, filter({ marks: ['want'] }))).toEqual([COURSES[1]])
    expect(filterCourses(COURSES, marks, filter({ marks: ['unmarked'] }))).toHaveLength(98)
  })

  it('treats absent notes as every course unmarked, which is the first-paint state', () => {
    // `sessions.destinations` is empty until the store resolves. `unmarked` must therefore mean
    // all 100 on first paint and narrow as the marks arrive — not the other way round.
    expect(filterCourses(COURSES, {}, filter({ marks: ['unmarked'] }))).toHaveLength(100)
  })

  it('can return nothing, and says so by returning an empty array', () => {
    // WA has no members-only course. An empty result is a real answer the view must render.
    expect(filterCourses(COURSES, {}, filter({ states: ['WA'], access: ['members'] }))).toEqual([])
  })
})

describe('countOptions', () => {
  it('counts every course against every option when nothing is set', () => {
    const counts = countOptions(COURSES, {}, emptyFilter())
    const total = Object.values(counts.states).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
    expect(Object.values(counts.access).reduce((a, b) => a + b, 0)).toBe(100)
    expect(Object.values(counts.bands).reduce((a, b) => a + b, 0)).toBe(100)
    expect(counts.bands.none).toBe(40)
    expect(counts.access.members).toBe(1)
  })

  it('ignores a group’s own constraint when counting that group', () => {
    // Otherwise every unselected state would read 0 the moment one state was picked, and the
    // control would tell you nothing about where you could go next.
    const counts = countOptions(COURSES, {}, filter({ states: ['TAS'] }))
    expect(counts.states.TAS).toBe(8)
    expect(counts.states.VIC).toBe(39)
  })

  it('narrows a group’s counts by the other groups', () => {
    const all = countOptions(COURSES, {}, emptyFilter())
    const publicOnly = countOptions(COURSES, {}, filter({ access: ['public'] }))
    expect(publicOnly.states.VIC).toBeLessThan(all.states.VIC)
    // And the narrowed state counts must still sum to the number of public courses.
    const sum = Object.values(publicOnly.states).reduce((a, b) => a + b, 0)
    expect(sum).toBe(COURSES.filter((c) => c.access === 'public').length)
  })

  it('counts a marked course under exactly one mark option', () => {
    const marks = marksOf({ [COURSES[0].slug]: 'played' })
    const counts = countOptions(COURSES, marks, emptyFilter())
    expect(counts.marks.played).toBe(1)
    expect(counts.marks.want).toBe(0)
    expect(counts.marks.unmarked).toBe(99)
  })
})

describe('toggle', () => {
  it('adds a value that is absent and removes one that is present', () => {
    const f = emptyFilter()
    const on = toggle(f, 'states', 'TAS')
    expect([...on.states]).toEqual(['TAS'])
    expect([...toggle(on, 'states', 'TAS').states]).toEqual([])
  })

  it('returns a new filter rather than mutating the one it was given', () => {
    // Svelte 5 tracks the assignment, not the Set's internals. A mutated Set would filter
    // correctly and never re-render, which is the worst of both.
    const f = emptyFilter()
    const on = toggle(f, 'states', 'TAS')
    expect(f.states.size).toBe(0)
    expect(on).not.toBe(f)
    expect(on.states).not.toBe(f.states)
  })
})

describe('activeCount', () => {
  it('counts selected values across every group, not groups touched', () => {
    expect(activeCount(emptyFilter())).toBe(0)
    expect(activeCount(filter({ states: ['TAS'] }))).toBe(1)
    expect(activeCount(filter({ states: ['TAS', 'SA'], access: ['public'] }))).toBe(3)
  })
})

describe('the option registries', () => {
  it('lists only states that actually have a course', () => {
    // A control offering NT would return nothing and teach the reader that the list is broken.
    expect(STATES_PRESENT).not.toContain('NT')
    const inData = new Set<AusState>(COURSES.map((c) => c.state))
    expect([...STATES_PRESENT].sort()).toEqual([...inData].sort())
  })

  it('covers every fee band and every mark exactly once', () => {
    const bands = FEE_BANDS.map((b) => b.value)
    expect(new Set(bands).size).toBe(bands.length)
    const every: FeeBand[] = ['under100', '100to199', '200to349', '350plus', 'none']
    expect([...bands].sort()).toEqual([...every].sort())
    expect(MARK_FILTERS.map((m) => m.value)).toEqual(['want', 'played', 'unmarked'])
  })

  it('offers every access value, unknown included', () => {
    const every: Access[] = ['public', 'limited', 'members', 'unknown']
    const counts = countOptions(COURSES, {}, emptyFilter())
    for (const access of every) expect(counts.access[access]).toBeGreaterThan(0)
  })
})
