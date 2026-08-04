import type { DayKey, DrillId, Feel, ISODate, Location, PracticeSession } from './types'
import { DRILLS } from './drills'
import { WEEK } from './plan'
import { parseISODate } from './block'

/** Neutral. The form renders an untouched 3 dimmed, so a value you never judged is visible
 *  as such without changing what gets stored. */
const NEUTRAL_FEEL: Feel = 3

/** Form state. Deliberately not `PracticeSession`: it holds all seven drills whether ticked or
 *  not, and whether feel was actually tapped. Neither belongs in the stored record. */
export interface DraftEntry {
  drillId: DrillId
  selected: boolean
  swings: number
  feel: Feel
  feelTouched: boolean
}

export interface SessionDraft {
  id: string
  date: ISODate
  location: Location
  /** All seven, in drill order, so the list never reorders as you tick things. */
  entries: DraftEntry[]
  notes: string
}

export function newSessionId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // `crypto.randomUUID` needs a secure context. Uniqueness for one user's own log is all
  // that's required here — this is not a security boundary.
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Monday is the Trackman bay; every other day is outdoors with airflow balls. */
export function defaultLocation(day: DayKey): Location {
  return day === 'mon' ? 'sim' : 'home'
}

/** All seven drills, with the day's scheduled ones pre-ticked. This is what makes a normal
 *  session two taps and save. */
export function seedEntries(day: DayKey): DraftEntry[] {
  const scheduled = new Set<DrillId>(WEEK[day].drills)
  return DRILLS.map((d) => ({
    drillId: d.id,
    selected: scheduled.has(d.id),
    swings: d.defaultSwings,
    feel: NEUTRAL_FEEL,
    feelTouched: false,
  }))
}

export function draftForDay(day: DayKey, date: ISODate, id: string = newSessionId()): SessionDraft {
  return { id, date, location: defaultLocation(day), entries: seedEntries(day), notes: '' }
}

/** Load a stored session back into the form. Unticked drills keep their authored defaults so
 *  adding one mid-edit behaves exactly as it does on a new session. */
export function draftFromSession(session: PracticeSession): SessionDraft {
  const stored = new Map(session.entries.map((e) => [e.drillId, e]))
  return {
    id: session.id,
    date: session.date,
    location: session.location,
    notes: session.notes ?? '',
    entries: DRILLS.map((d) => {
      const entry = stored.get(d.id)
      return {
        drillId: d.id,
        selected: entry !== undefined,
        swings: entry?.swings ?? d.defaultSwings,
        feel: entry?.feel ?? NEUTRAL_FEEL,
        // A stored value was judged by definition — it came off a real session.
        feelTouched: entry !== undefined,
      }
    }),
  }
}

export function toSession(draft: SessionDraft): PracticeSession {
  const notes = draft.notes.trim()
  const session: PracticeSession = {
    id: draft.id,
    type: 'practice',
    date: draft.date,
    location: draft.location,
    entries: draft.entries
      .filter((e) => e.selected)
      .map((e) => ({ drillId: e.drillId, swings: e.swings, feel: e.feel })),
  }
  if (notes) session.notes = notes
  return session
}

/** Returns the problems, in the order they appear in the form. Empty means it can be saved.
 *  The client is the only guard — there is no server-side validation. */
export function validateDraft(draft: SessionDraft): string[] {
  const problems: string[] = []
  if (parseISODate(draft.date) === null) problems.push('Pick a valid date.')

  const selected = draft.entries.filter((e) => e.selected)
  if (selected.length === 0) problems.push('Tick at least one drill.')

  for (const entry of selected) {
    if (!Number.isInteger(entry.swings) || entry.swings < 1) {
      problems.push(`Drill ${entry.drillId} needs at least one swing.`)
    }
  }
  return problems
}
