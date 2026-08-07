import type { Club } from './clubs'
import type { MetricId } from './metrics'

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

/** Every metric except club path, which keeps its own dedicated fields on `ClubPath`. */
export type ExtraMetricId = Exclude<MetricId, 'clubPath'>

/**
 * One club's session aggregate for one metric.
 *
 * **`n` is required here, unlike `ClubPath.n`.** Every reading of this shape is computed from
 * strokes, so a count always exists; hand entry never produces one of these at all.
 *
 * **The count is per metric, and it has to be.** Null rates differ by up to 45 points — on the
 * driver, swing plane is present on 666 strokes where club path is present on 618. A count
 * shared across metrics would let `radiusFor()` draw the sparser reading as confidently as the
 * denser one.
 */
export interface MetricReading {
  /** Session mean for this club and metric. */
  typical: number
  /** Present only where the metric has a target — absent whenever `better` is `none`. */
  best?: number
  /** Measured strokes behind `typical`. */
  n: number
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
  /**
   * The wider measurement set, keyed by metric.
   *
   * **Absent on hand-typed rows and on everything imported before Phase 7.** Club path is
   * deliberately *not* duplicated in here: it keeps the fields above, so no existing reader
   * changes and no migration touches existing data.
   */
  metrics?: Partial<Record<ExtraMetricId, MetricReading>>
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

/**
 * One measured stroke. Stored under `SHOTS#<sessionId>`, **never** alongside the session.
 *
 * Embedding these would force a multi-megabyte download on every page load to draw charts that
 * do not use them (D24). Every metric is optional: absence is the API's own posture — not one
 * of the 75 fields on `Measurement` is non-nullable — and an absent reading is never a zero.
 */
export interface Shot {
  club: Club
  /** UTC instant from the stroke, kept for ordering within a session. */
  time?: string
  metrics: Partial<Record<MetricId, number>>
}

export type Session = PracticeSession | TrackmanSession

export function isTrackman(session: Session): session is TrackmanSession {
  return session.type === 'trackman'
}

export function isPractice(session: Session): session is PracticeSession {
  return session.type === 'practice'
}
