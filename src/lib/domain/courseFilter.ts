import { COURSES, type Access, type AusState, type Course } from './courses'
import { ACCESS_LABELS } from './destinations'
import type { DestinationNotes, DestinationStatus } from './types'

/**
 * Narrowing the Top 100 by state, access, price and mark.
 *
 * Everything here is pure and takes plain data, because *components render; they never
 * calculate*. The view holds the `CourseFilter` and paints what these functions return; it does
 * not know what a fee band is, and `DestinationFilters.svelte` derives no count of its own.
 *
 * **Two rules govern absence, and both come from elsewhere in this codebase.**
 *
 * An **empty group means "no constraint"**, never "match nothing". Every group starts empty, so
 * the default view is all one hundred. This is the same rule as an absent key in
 * `DestinationNotes` meaning *no opinion*: the absence of a choice is not a choice to exclude
 * everything.
 *
 * An **absent fee is its own band**, never the cheapest one. Forty of the hundred publish no
 * visitor rate, and a course with no published price is not a cheap course — the same rule that
 * makes `feeLabel` render a dash rather than "Free".
 */

/**
 * The price bands, as thresholds rather than as a slider.
 *
 * A slider cannot express the forty courses with no published fee: they are neither under a limit
 * nor over it, so a slider either hides them silently or ignores itself for them. `'none'` is a
 * band, selectable and counted like any other, so nothing disappears without a control saying so.
 */
export type FeeBand = 'under100' | '100to199' | '200to349' | '350plus' | 'none'

/**
 * How a mark filters, with `'unmarked'` as a real option.
 *
 * There is no `'none'` *status* — an absent key is the absence of a mark, not a third state — but
 * "the ones I have not decided about" is a genuine question to ask of a hundred courses, and it
 * is answered here rather than by inventing a stored value for it.
 */
export type MarkFilter = DestinationStatus | 'unmarked'

export interface CourseFilter {
  states: Set<AusState>
  access: Set<Access>
  bands: Set<FeeBand>
  marks: Set<MarkFilter>
}

/** Every group empty: no constraint anywhere, so every course matches. */
export function emptyFilter(): CourseFilter {
  return { states: new Set(), access: new Set(), bands: new Set(), marks: new Set() }
}

/** Lower bound of each priced band, in dollars. Read by `feeBand` and by the labels below. */
const BAND_FLOORS = { under100: 0, '100to199': 100, '200to349': 200, '350plus': 350 } as const

/**
 * Which band a course's fee falls in.
 *
 * **An absent fee is `'none'`, never `'under100'`.** `greenFee` is absent and never `0` (D37), so
 * this reads `undefined` directly rather than defaulting through `?? 0` — a default would file
 * forty researched courses as the cheapest ones on the list, which is wrong in the most expensive
 * possible direction and is exactly what `feeLabel`'s dash rule exists to prevent.
 *
 * A `0` that somehow reached here would land in `under100` and *not* become `'none'`. "Free" and
 * "not published" are different findings, and rounding either into the other invents one.
 */
export function feeBand(course: Course): FeeBand {
  const fee = course.greenFee
  if (fee === undefined) return 'none'
  if (fee.amount >= BAND_FLOORS['350plus']) return '350plus'
  if (fee.amount >= BAND_FLOORS['200to349']) return '200to349'
  if (fee.amount >= BAND_FLOORS['100to199']) return '100to199'
  return 'under100'
}

/** Which mark option a course falls under. Exactly one, always — every course has an answer. */
function markOf(status: DestinationStatus | undefined): MarkFilter {
  return status ?? 'unmarked'
}

/**
 * Whether one course survives the filter.
 *
 * **Union within a group, intersection across groups.** Picking TAS and SA asks for either;
 * picking TAS and *public* asks for both. That is what every faceted filter does, and stating it
 * here is cheaper than deriving it from four near-identical lines.
 *
 * `status` is passed in rather than looked up, so this function never reaches storage and the
 * caller decides what "no marks yet" means. `filterCourses` supplies it from the notes it is
 * given.
 */
export function matchesFilter(
  course: Course,
  status: DestinationStatus | undefined,
  filter: CourseFilter,
): boolean {
  if (filter.states.size > 0 && !filter.states.has(course.state)) return false
  // `unknown` is a value like any other here, so it can only ever match a filter that asked for
  // `unknown`. It never rounds into `members` — that would invent a finding the research could
  // not confirm.
  if (filter.access.size > 0 && !filter.access.has(course.access)) return false
  if (filter.bands.size > 0 && !filter.bands.has(feeBand(course))) return false
  if (filter.marks.size > 0 && !filter.marks.has(markOf(status))) return false
  return true
}

/**
 * The courses that survive, **in the order they arrived**.
 *
 * `COURSES` is authored in rank order and this never sorts, so a filtered list is still a ranked
 * list. Re-ranking the survivors 1..n would be a different and much less useful list.
 *
 * `marks` empty is the first-paint state — `sessions.destinations` resolves after the page
 * renders — so every course reads as `'unmarked'` until the store answers. That is the right way
 * round: the filter starts by matching everything and narrows as data arrives, rather than
 * starting empty and filling in.
 */
export function filterCourses(
  courses: Course[],
  marks: DestinationNotes,
  filter: CourseFilter,
): Course[] {
  return courses.filter((course) => matchesFilter(course, marks[course.slug]?.status, filter))
}

/** One count per option in every group. */
export interface FilterCounts {
  states: Record<AusState, number>
  access: Record<Access, number>
  bands: Record<FeeBand, number>
  marks: Record<MarkFilter, number>
}

const GROUPS = ['states', 'access', 'bands', 'marks'] as const
type Group = (typeof GROUPS)[number]

/** Which option of a given group a course belongs to. One answer per group, always. */
function valueIn(group: Group, course: Course, status: DestinationStatus | undefined): string {
  if (group === 'states') return course.state
  if (group === 'access') return course.access
  if (group === 'bands') return feeBand(course)
  return markOf(status)
}

/**
 * Live counts for every option, **with each group blind to its own constraint**.
 *
 * Selecting TAS must not drop every other state to `0`. A group counted against its own selection
 * answers "how many are already showing", which the result line says better; counted with its own
 * selection *lifted*, it answers "how many would I get if I picked this too", which is the only
 * reason to put a number on a control you have not pressed yet.
 *
 * The other groups still narrow it, so with *public* selected the state counts are public-only
 * and sum to the number of public courses.
 */
export function countOptions(
  courses: Course[],
  marks: DestinationNotes,
  filter: CourseFilter,
): FilterCounts {
  const counts = {
    states: {} as Record<string, number>,
    access: {} as Record<string, number>,
    bands: {} as Record<string, number>,
    marks: {} as Record<string, number>,
  }

  for (const group of GROUPS) {
    // The same filter with this one group cleared. Cheap, and it keeps the counting loop below
    // identical for all four groups rather than four hand-written variants.
    const others: CourseFilter = { ...filter, [group]: new Set() }
    for (const course of courses) {
      const status = marks[course.slug]?.status
      if (!matchesFilter(course, status, others)) continue
      const value = valueIn(group, course, status)
      counts[group][value] = (counts[group][value] ?? 0) + 1
    }
  }

  // Every option gets a number, including `0`. An option with no count would render blank and
  // read as "loading" rather than as "none of these".
  const zeroed = <T extends string>(options: readonly T[], tally: Record<string, number>) =>
    Object.fromEntries(options.map((o) => [o, tally[o] ?? 0])) as Record<T, number>

  return {
    states: zeroed(STATES_PRESENT, counts.states),
    access: zeroed(
      ACCESS_OPTIONS.map((o) => o.value),
      counts.access,
    ),
    bands: zeroed(
      FEE_BANDS.map((o) => o.value),
      counts.bands,
    ),
    marks: zeroed(
      MARK_FILTERS.map((o) => o.value),
      counts.marks,
    ),
  }
}

/**
 * A filter with one value flipped, as a **new object**.
 *
 * Svelte 5 tracks the assignment, not the `Set`'s internals: `filter.states.add('TAS')` would
 * filter correctly and never re-render, which is the worst of both. Returning a fresh object with
 * a fresh `Set` makes the reassignment the only way to use this.
 */
export function toggle<G extends Group>(
  filter: CourseFilter,
  group: G,
  value: CourseFilter[G] extends Set<infer V> ? V : never,
): CourseFilter {
  const next = new Set(filter[group] as Set<unknown>)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return { ...filter, [group]: next }
}

/** How many values are selected in total — the number on the mobile disclosure. */
export function activeCount(filter: CourseFilter): number {
  return GROUPS.reduce((sum, group) => sum + filter[group].size, 0)
}

/** An option, with the wording it renders under. Wording lives here, never in markup. */
export interface FilterOption<T extends string> {
  value: T
  label: string
}

/**
 * The states that actually hold a course, in the order the ranking's own vocabulary lists them.
 *
 * Derived rather than authored, so a control can never offer NT — a chip that always returns
 * nothing teaches the reader that the list is broken rather than that the state is empty.
 */
const STATE_ORDER: AusState[] = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']

export const STATES_PRESENT: AusState[] = STATE_ORDER.filter((state) =>
  COURSES.some((course) => course.state === state),
)

/**
 * Access options, worded by `ACCESS_LABELS` so the filter and the row's pill can never disagree.
 *
 * All four, `'unknown'` included. Eight courses could not be confirmed, and a filter that omitted
 * them would make those eight unreachable — the interface equivalent of rounding them up to
 * members-only.
 */
export const ACCESS_OPTIONS: FilterOption<Access>[] = (
  ['public', 'limited', 'members', 'unknown'] as const
).map((value) => ({ value, label: ACCESS_LABELS[value] }))

/**
 * Fee bands, cheapest first, with "no fee published" last.
 *
 * Last rather than first on purpose: it is the largest group at forty, and leading with it would
 * put the absence of a price at the head of a price control.
 */
export const FEE_BANDS: FilterOption<FeeBand>[] = [
  { value: 'under100', label: 'Under $100' },
  { value: '100to199', label: '$100–199' },
  { value: '200to349', label: '$200–349' },
  { value: '350plus', label: '$350+' },
  { value: 'none', label: 'No fee published' },
]

/** Mark options. `'unmarked'` is a question about the list, not a third stored status. */
export const MARK_FILTERS: FilterOption<MarkFilter>[] = [
  { value: 'want', label: 'Want to play' },
  { value: 'played', label: 'Played' },
  { value: 'unmarked', label: 'Not marked' },
]
