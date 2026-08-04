import type { Club } from './clubs'

/** Stable identifiers. The weekly schedule references drills by digit — never renumber. */
export type DrillId = '01' | '02' | '03' | '04' | '05' | '06' | '07'

/** Where a drill can be done. `sim` is the Trackman bay, `home` is outdoors with airflow balls. */
export type DrillTag = 'sim' | 'home'

export interface Drill {
  id: DrillId
  name: string
  tags: DrillTag[]
  description: string
  /** Free text rather than a number — ranges ("10–15", "10 rehearsals + 5 hits") carry intent. */
  reps: string
  /** A number the log form can pre-fill. `reps` stays prose — "10 rehearsals + 5 hits" has no
   *  single number in it, and parsing it would be guesswork. Authored, not derived. */
  defaultSwings: number
  /** The cue. The most valuable field in the model — every drill keeps one. */
  feelsLike: string
}

export interface DrillGroup {
  label: string
  drills: DrillId[]
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface DayPlan {
  title: string
  sub: string
  drills: DrillId[]
  /** Short form for the Tue–Sun menu in the weekly structure. */
  menuLabel: string
  moreText?: string
  moreHref?: string
}

export interface TimelineItem {
  time: string
  title: string
  detail: string
}

export interface ArcPhase {
  n: string
  week: string
  title: string
  body: string
  /** Trailing italicised clause, kept as text rather than HTML in the data. */
  emphasis?: string
}

/** Calendar date, `YYYY-MM-DD`. Always the Sydney date — see `today.ts`. */
export type ISODate = string

/** `sim` is the Trackman bay, `home` is outdoors with airflow balls, `course` is on the course. */
export type Location = 'sim' | 'home' | 'course'

/** How close the swing came to the drill's "feels like" cue. */
export type Feel = 1 | 2 | 3 | 4 | 5

export interface DrillEntry {
  drillId: DrillId
  swings: number
  /** Per entry, never per session — two drills in one session can go very differently. */
  feel: Feel
}

/** Tue–Sun: short outdoor sessions, manually logged. */
export interface PracticeSession {
  id: string
  type: 'practice'
  date: ISODate
  location: Location
  entries: DrillEntry[]
  notes?: string
}

/**
 * One club's club path for one session.
 *
 * **Never blend these.** A mean across clubs tracks club selection, not swing change (OQ-7,
 * issue #14): in 2025-11 the blended figure was the best in the series while the driver was the
 * worst to that point, purely because more seven-irons were hit.
 */
export interface ClubPath {
  club: Club
  /** Signed degrees, the session mean for this club. Negative is out-to-in. */
  typical: number
  /**
   * Signed degrees: the single stroke closest to neutral, i.e. the smallest `|path|`.
   * The target is a band centred on zero, so `+5°` is worse than `+1°` — overshooting is a
   * fault. Never `Math.max`.
   */
  best: number
  /** Measured strokes behind `typical`. Absent on hand-typed entries, which have no count. */
  n?: number
}

/** The Trackman session. The numbers live here. */
export interface TrackmanSession {
  id: string
  type: 'trackman'
  /** The Sydney date. 11% of real sessions fall on a different UTC date — see the Phase 3 spec. */
  date: ISODate
  /** At least one, in bag order. */
  clubs: ClubPath[]
  drillsWorked?: DrillId[]
  notes?: string
  /**
   * Provenance, always recorded — when a number looks wrong six weeks later, the first question
   * is whether it was typed or fetched. Editing an imported session flips it to `manual`, which
   * is what stops the next sync from overwriting the correction.
   */
  source: 'manual' | 'api'
}

export type Session = PracticeSession | TrackmanSession

export function isTrackman(session: Session): session is TrackmanSession {
  return session.type === 'trackman'
}

export function isPractice(session: Session): session is PracticeSession {
  return session.type === 'practice'
}
