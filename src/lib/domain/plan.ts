import type { ArcPhase, DayKey, DayPlan, TimelineItem } from './types'

export const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_NAMES: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

export const WEEKEND: DayKey[] = ['sat', 'sun']

const OUTDOOR =
  '5–10 minutes outdoors with airflow balls. Two drills — slow and correct beats fast and many.'

/** The weekly schedule. `drills` holds IDs resolved against `drills.ts`. */
export const WEEK: Record<DayKey, DayPlan> = {
  mon: {
    title: 'Trackman session',
    sub: 'Two hours. Warm up, then block work watching the path number, then transfer to normal swings, then play holes. Finish by logging your best and typical path.',
    drills: ['04', '06', '02'],
    menuLabel: '2 hours on Trackman',
    moreText: 'Full Monday plan ↓',
    moreHref: '#week',
  },
  tue: {
    title: 'Trail-arm and tempo',
    sub: OUTDOOR,
    drills: ['05', '07'],
    menuLabel: 'Trail-arm (05) + tempo (07)',
  },
  wed: {
    title: 'Step and gate',
    sub: OUTDOOR,
    drills: ['01', '04'],
    menuLabel: 'Step (01) + gate (04)',
  },
  thu: {
    title: 'Pump and tempo',
    sub: OUTDOOR,
    drills: ['02', '07'],
    menuLabel: 'Pump (02) + tempo (07)',
  },
  fri: {
    title: 'Trail-arm and gate',
    sub: OUTDOOR,
    drills: ['05', '04'],
    menuLabel: 'Trail-arm (05) + gate (04)',
  },
  sat: {
    title: 'Patch the weak spot',
    sub: 'Whatever felt worst this week, plus a few step drills to reset.',
    drills: ['01'],
    menuLabel: 'Whatever felt worst + a few steps to reset',
  },
  sun: {
    title: 'Free choice',
    sub: 'Anything you fancy — finish on a good one.',
    drills: ['01'],
    menuLabel: 'Free choice, finish on a good one',
  },
}

/** Days shown in the Tue–Sun menu of the weekly structure. Monday has its own timeline. */
export const OUTDOOR_DAYS: DayKey[] = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const OUTDOOR_BLOCK = {
  title: 'Tue–Sun',
  sub: '5–10 min · outdoors · airflow',
  note: 'Two drills a session. Slow and correct beats fast and many.',
}

export const MONDAY_TIMELINE: TimelineItem[] = [
  {
    time: '10 min',
    title: 'Warm-up',
    detail: 'Easy wedges and tempo swishes. No swing thoughts.',
  },
  {
    time: '40 min',
    title: 'Block + data',
    detail: 'Drills 4 & 6, then Drill 2. Hit, check the path number, repeat.',
  },
  {
    time: '40 min',
    title: 'Transfer',
    detail: 'Alternate one drill-swing, one normal swing holding the same path. Where it sticks.',
  },
  {
    time: '25 min',
    title: 'Play holes',
    detail: 'Different clubs and targets, full routine each ball. Score how many stay left of a slice.',
  },
  {
    time: '5 min',
    title: 'Log it',
    detail: 'Note your best and typical path for the session.',
  },
]

export const ARC: ArcPhase[] = [
  {
    n: '01',
    week: 'Week one',
    title: 'Groove the feel',
    body: "Block-heavy. Lots of Drills 1, 2, 5. Make the lower-body-led move feel normal and pull the path into the −2° to −4° range. Don't worry yet how it holds up on random shots.",
  },
  {
    n: '02',
    week: 'Week two',
    title: 'Transfer',
    body: 'Mix drill-swings with normal swings. Trust the path number without the exaggeration. Add a simple trigger — one look at the target and the thought ',
    emphasis: '"lower body first."',
  },
  {
    n: '03',
    week: 'Week three',
    title: 'Proof it',
    body: "Random practice only — never the same club twice, always a full routine. The swing needs to hold when you're not thinking mechanics. Step drill stays as your on-course reset.",
  },
]

/**
 * The single KPI: **driver** club path, signed. Negative is out-to-in. The target is a band, not
 * a maximum.
 *
 * The club is named deliberately (OQ-7, issue #14). A blended average across clubs tracks club
 * selection as much as swing change — see `docs/content.md`.
 */
export const KPI = {
  label: 'Headline number · driver club path',
  now: '−6° / −10°',
  goal: '−2° / +2°',
  note: "This is your one KPI on the Trackman, measured with the driver — a figure blended across clubs just tracks what was in your hand. You don't need a big draw; you need the path to come back toward neutral with the face just left of it. Watch the number trend across a session, not any single shot.",
}
