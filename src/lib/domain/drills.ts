import type { Drill, DrillGroup, DrillId } from './types'

/** The seven core drills. This is the single source of truth for drill content — the Today
 *  panel and the Core drills section both render from here. Never restate drill copy in markup. */
export const DRILLS: Drill[] = [
  {
    id: '01',
    name: 'Step-change',
    tags: ['sim', 'home'],
    description:
      "Your money drill. Feet together, ball forward. Start back, and as you reach the top, step the lead foot toward the target and swing. Your on-course reset whenever the slice creeps back.",
    reps: '10–15',
    feelsLike: 'pressure in the lead foot before the arms move',
  },
  {
    id: '02',
    name: 'Pump-and-go',
    tags: ['sim', 'home'],
    description:
      'Swing to the top. Pump the hands down toward the trail pocket 2–3 times by bumping and rotating the hips — arms passive — then let the last one go and strike.',
    reps: '8–10',
    feelsLike: 'hands dropping while the hips clear',
  },
  {
    id: '03',
    name: 'Pause-at-the-top',
    tags: ['sim', 'home'],
    description:
      'Full backswing, freeze for a genuine one-count, then start down with the lead hip. Kills the rushed upper-body snatch that throws the club out.',
    reps: '10',
    feelsLike: 'an unhurried change of direction',
  },
  {
    id: '04',
    name: 'Outside gate',
    tags: ['sim', 'home'],
    description:
      'Set a headcover (or spare airflow ball) a grip-length outside the ball and slightly behind it, on the line. Over-the-top clips it; an inside path misses it clean.',
    reps: '15–20 balls',
    feelsLike: 'club coming from behind you, not across',
  },
  {
    id: '05',
    name: 'Trail-arm only',
    tags: ['home'],
    description:
      "Trail hand only, choked down, small three-quarter swings at airflow balls. You physically can't come over the top one-handed — the arm has to drop and rotate.",
    reps: '15–20',
    feelsLike: 'the forearm rotating over through impact',
  },
  {
    id: '06',
    name: 'Angled-stick shallow',
    tags: ['sim'],
    description:
      'Push an alignment stick into the ground angled up and away, just outside the trail hip. Swing so the club stays under the stick coming down. A clear visual for the slot.',
    reps: '10 rehearsals + 5 hits',
    feelsLike: 'the club travelling below the shaft line',
  },
  {
    id: '07',
    name: 'Slow-motion & swishes',
    tags: ['home'],
    description:
      'Half-speed full swings, or swishes with a weighted/flexible trainer, focused only on the order: pressure → hips → torso → arms → club. Rushing from the top is what fires the arms first.',
    reps: '20–30 / 2–3 min',
    feelsLike: 'smooth, in no hurry, the club whipping late',
  },
]

const BY_ID = new Map<DrillId, Drill>(DRILLS.map((d) => [d.id, d]))

export function drill(id: DrillId): Drill {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown drill id: ${id}`)
  return found
}

/** How the Core drills section is grouped on the page. */
export const DRILL_GROUPS: DrillGroup[] = [
  { label: 'Sequencing & transition', drills: ['01', '02', '03'] },
  { label: 'Slot & path', drills: ['04', '05', '06'] },
  { label: 'Tempo · the quiet fix', drills: ['07'] },
]
