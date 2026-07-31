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
