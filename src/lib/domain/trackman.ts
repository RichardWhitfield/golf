import { CLUBS, KPI_CLUB, MAX_PATH_DEGREES, clubInfo, compareClubs, type Club } from './clubs'
import { parseISODate } from './block'
import { WEEK } from './plan'
import { newSessionId } from './session'
import type { ClubPath, DrillId, ISODate, TrackmanSession } from './types'

/**
 * Form state for one club's row.
 *
 * The numbers are **strings**, deliberately. A `<input type="number">` bound to a numeric rune
 * turns a half-typed `-` into `NaN` and clears the box under the user's fingers — and the sign
 * is the one thing this app must never lose.
 */
export interface ClubRowDraft {
  club: Club
  best: string
  typical: string
  /** Optional. Blank means "no count", which is the honest answer for a hand-typed entry. */
  shots: string
}

export interface TrackmanDraft {
  id: string
  date: ISODate
  rows: ClubRowDraft[]
  drills: DrillId[]
  notes: string
}

/** Blank, never a fabricated default — a number nobody typed is not a reading. */
function blankRow(club: Club): ClubRowDraft {
  return { club, best: '', typical: '', shots: '' }
}

/** The first club with no row yet, so adding a row never lands on a duplicate. */
export function emptyRow(taken: Club[]): ClubRowDraft {
  const used = new Set(taken)
  const next = CLUBS.find((c) => !used.has(c.id)) ?? CLUBS[CLUBS.length - 1]
  return blankRow(next.id)
}

/**
 * A fresh draft, opening on the KPI club.
 *
 * Drills default to **Monday's**, because Monday is the bay day the plan is written around —
 * not to the drills for whatever weekday the date happens to be. Trackman sessions land on every
 * day of the week in practice, but the bay session is the Monday session.
 */
export function trackmanDraft(date: ISODate, id: string = newSessionId()): TrackmanDraft {
  return { id, date, rows: [blankRow(KPI_CLUB)], drills: [...WEEK.mon.drills], notes: '' }
}

/** Load a stored session back into the form. */
export function draftFromTrackman(session: TrackmanSession): TrackmanDraft {
  return {
    id: session.id,
    date: session.date,
    rows: session.clubs.map((c) => ({
      club: c.club,
      best: String(c.best),
      typical: String(c.typical),
      // A count that came off the bay survives an edit. Only a count nobody has is blank.
      shots: c.n === undefined ? '' : String(c.n),
    })),
    drills: [...(session.drillsWorked ?? [])],
    notes: session.notes ?? '',
  }
}

/**
 * Accepts a leading `+` and a leading `-`, rejects everything else including a lone sign.
 * `Number.parseFloat` is too permissive on its own — it reads `"7 iron"` as `7`.
 */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/

function parsePath(raw: string): number | null {
  const text = raw.trim()
  if (!NUMBER.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/**
 * **Always `source: 'manual'`.** A session that has been through this form was typed or corrected
 * by hand, whatever it started as. That is what stops the next sync from overwriting the change:
 * the merge rules refuse to touch anything marked manual.
 */
export function toTrackmanSession(draft: TrackmanDraft): TrackmanSession {
  const clubs: ClubPath[] = draft.rows
    .map((row) => {
      const path: ClubPath = {
        club: row.club,
        typical: parsePath(row.typical) ?? 0,
        best: parsePath(row.best) ?? 0,
      }
      const shots = row.shots.trim()
      if (shots !== '') path.n = Number(shots)
      return path
    })
    .sort((a, b) => compareClubs(a.club, b.club))

  const session: TrackmanSession = {
    id: draft.id,
    type: 'trackman',
    date: draft.date,
    clubs,
    source: 'manual',
  }
  if (draft.drills.length > 0) session.drillsWorked = [...draft.drills]
  const notes = draft.notes.trim()
  if (notes !== '') session.notes = notes
  return session
}

/**
 * Returns the problems in the order they appear in the form. Empty means it can be saved.
 * The client is the only guard — there is no server-side validation.
 */
export function validateTrackmanDraft(draft: TrackmanDraft): string[] {
  const problems: string[] = []
  if (parseISODate(draft.date) === null) problems.push('Pick a valid date.')
  if (draft.rows.length === 0) problems.push('Add at least one club.')

  const seen = new Set<Club>()
  for (const row of draft.rows) {
    const name = clubInfo(row.club).name
    if (seen.has(row.club)) {
      problems.push(`${name} is listed twice.`)
      continue
    }
    seen.add(row.club)

    for (const [key, label] of [
      ['typical', 'typical'],
      ['best', 'best'],
    ] as const) {
      const value = parsePath(row[key])
      if (value === null) {
        problems.push(`${name} needs a ${label} path in degrees.`)
      } else if (value < -MAX_PATH_DEGREES || value > MAX_PATH_DEGREES) {
        // Two-sided, not `Math.abs`: a range check that folds the sign away would accept a
        // reading whose sign is wrong, which is the one error that matters most here.
        problems.push(`${name}'s ${label} path is outside ±${MAX_PATH_DEGREES}°.`)
      }
    }

    const shots = row.shots.trim()
    if (shots !== '') {
      const n = Number(shots)
      if (!/^\d+$/.test(shots) || !Number.isInteger(n) || n < 1) {
        problems.push(`${name}'s shot count must be a whole number, or left blank.`)
      }
    }
  }
  return problems
}
