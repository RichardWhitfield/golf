/**
 * The club vocabulary.
 *
 * Two separate things live here because they answer different questions. `CLUBS` is what the UI
 * offers and how it orders things. `TRACKMAN_CLUB_NAMES` is the wire format. Keeping them apart
 * means a club can be pickable before its Trackman spelling is known, and an unknown spelling
 * never has to be guessed at.
 */

export type Club =
  | 'DRIVER'
  | 'WOOD3'
  | 'WOOD5'
  | 'IRON4'
  | 'IRON5'
  | 'IRON6'
  | 'IRON7'
  | 'IRON8'
  | 'IRON9'
  | 'PITCHING_WEDGE'
  | 'WEDGE50'
  | 'SAND_WEDGE'
  | 'WEDGE58'
  | 'WEDGE60'

export interface ClubInfo {
  id: Club
  /** Monospaced UI label. Short, because it sits in a row of numbers. */
  short: string
  /** Prose label. */
  name: string
}

/**
 * The KPI club (OQ-7, issue #14). A blended club-path average tracks club selection as much as
 * swing change: in 2025-11 the blended figure was the best in the series while the driver was the
 * worst to that point, purely because more seven-irons were hit.
 */
export const KPI_CLUB: Club = 'DRIVER'

/** Bag order, longest first. Drives the picker and every display ordering. */
export const CLUBS: ClubInfo[] = [
  { id: 'DRIVER', short: 'DRIVER', name: 'Driver' },
  { id: 'WOOD3', short: '3W', name: '3-wood' },
  { id: 'WOOD5', short: '5W', name: '5-wood' },
  { id: 'IRON4', short: '4I', name: '4-iron' },
  { id: 'IRON5', short: '5I', name: '5-iron' },
  { id: 'IRON6', short: '6I', name: '6-iron' },
  { id: 'IRON7', short: '7I', name: '7-iron' },
  { id: 'IRON8', short: '8I', name: '8-iron' },
  { id: 'IRON9', short: '9I', name: '9-iron' },
  { id: 'PITCHING_WEDGE', short: 'PW', name: 'Pitching wedge' },
  { id: 'WEDGE50', short: '50°', name: '50° wedge' },
  { id: 'SAND_WEDGE', short: 'SW', name: 'Sand wedge' },
  { id: 'WEDGE58', short: '58°', name: '58° wedge' },
  { id: 'WEDGE60', short: '60°', name: '60° wedge' },
]

const BY_ID = new Map<Club, ClubInfo>(CLUBS.map((c) => [c.id, c]))
const ORDER = new Map<Club, number>(CLUBS.map((c, i) => [c.id, i]))

export function clubInfo(id: Club): ClubInfo {
  const info = BY_ID.get(id)
  if (!info) throw new Error(`Unknown club: ${id}`)
  return info
}

export function isClub(value: unknown): value is Club {
  return typeof value === 'string' && BY_ID.has(value as Club)
}

/** Comparator. Pass straight to `sort` — clubs read in bag order, never alphabetically. */
export function compareClubs(a: Club, b: Club): number {
  return (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0)
}

/**
 * Trackman display string → stored id. **Verified against the live API, never guessed.**
 *
 * A `Map`, not an object literal: `{}['toString']` returns a function rather than `undefined`,
 * so an object-literal lookup would happily "normalise" `toString` into something truthy.
 */
const TRACKMAN_CLUB_NAMES = new Map<string, Club>([
  ['Driver', 'DRIVER'],
  ['3Wood', 'WOOD3'],
  ['5Wood', 'WOOD5'],
  ['4Iron', 'IRON4'],
  ['5Iron', 'IRON5'],
  ['6Iron', 'IRON6'],
  ['7Iron', 'IRON7'],
  ['8Iron', 'IRON8'],
  ['9Iron', 'IRON9'],
  ['PitchingWedge', 'PITCHING_WEDGE'],
  ['50Wedge', 'WEDGE50'],
  ['SandWedge', 'SAND_WEDGE'],
  ['58Wedge', 'WEDGE58'],
  ['60Wedge', 'WEDGE60'],
])

/**
 * `null` for anything unrecognised, so the caller can report the exact spelling rather than
 * losing the stroke silently. Inventing an entry for a club nobody has hit would put a wrong
 * mapping in the table that nothing detects — is a hybrid `3Hybrid` or `Hybrid3`?
 */
export function normaliseClub(display: string): Club | null {
  return TRACKMAN_CLUB_NAMES.get(display) ?? null
}

/**
 * Beyond any real swing. A club path this large is a unit error or a typo, not a reading.
 * Stated once here because import validation and form validation must agree on it.
 */
export const MAX_PATH_DEGREES = 20
