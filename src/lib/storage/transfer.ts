import type { DrillId, ISODate, Location, PracticeSession } from '../domain/types'
import { DRILLS } from '../domain/drills'
import { parseISODate } from '../domain/block'
import type { ImportSummary, StoreDocument } from './repository'
import { SCHEMA_VERSION, migrate } from './migrations'

const DRILL_IDS = new Set<string>(DRILLS.map((d) => d.id))
const LOCATIONS = new Set<string>(['sim', 'home', 'course'] satisfies Location[])

/** The chosen file is not a practice-log export, or one of its records is malformed. */
export class InvalidImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidImportError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reject(reason: string): never {
  throw new InvalidImportError(`That file is not a practice-log export: ${reason}`)
}

function checkSession(raw: unknown, index: number): PracticeSession {
  const where = `session ${index + 1}`
  if (!isRecord(raw)) reject(`${where} is not an object.`)

  if (typeof raw.id !== 'string' || raw.id === '') reject(`${where} has no id.`)
  if (raw.type !== 'practice') reject(`${where} is not a practice session.`)
  if (typeof raw.date !== 'string' || parseISODate(raw.date) === null) {
    reject(`${where} has an invalid date.`)
  }
  if (typeof raw.location !== 'string' || !LOCATIONS.has(raw.location)) {
    reject(`${where} has an unknown location.`)
  }
  if (!Array.isArray(raw.entries)) reject(`${where} has no drill entries.`)
  if (raw.notes !== undefined && typeof raw.notes !== 'string') reject(`${where} has invalid notes.`)

  const entries = raw.entries.map((entry, i) => {
    const what = `${where}, drill entry ${i + 1}`
    if (!isRecord(entry)) reject(`${what} is not an object.`)
    if (typeof entry.drillId !== 'string' || !DRILL_IDS.has(entry.drillId)) {
      reject(`${what} names a drill that does not exist.`)
    }
    if (typeof entry.swings !== 'number' || !Number.isInteger(entry.swings) || entry.swings < 1) {
      reject(`${what} has an invalid swing count.`)
    }
    if (typeof entry.feel !== 'number' || !Number.isInteger(entry.feel) || entry.feel < 1 || entry.feel > 5) {
      reject(`${what} has a feel outside 1-5.`)
    }
    return {
      drillId: entry.drillId as DrillId,
      swings: entry.swings as number,
      feel: entry.feel as PracticeSession['entries'][number]['feel'],
    }
  })

  const session: PracticeSession = {
    id: raw.id as string,
    type: 'practice',
    date: raw.date as ISODate,
    location: raw.location as Location,
    entries,
  }
  if (typeof raw.notes === 'string' && raw.notes !== '') session.notes = raw.notes
  return session
}

/**
 * Validate an imported file. **All or nothing** — one bad record rejects the whole file.
 * A partial import leaves the store in a state nobody chose, with no way to tell afterwards
 * what was dropped.
 */
export function parseDocument(raw: unknown): StoreDocument {
  let migrated: StoreDocument
  try {
    // Reuse the version guards: an export from a newer build must be refused here too.
    migrated = migrate(raw)
  } catch (error) {
    reject(error instanceof Error ? error.message : 'it could not be read.')
  }

  const sessions = migrated.sessions.map(checkSession)

  const ids = new Set<string>()
  for (const s of sessions) {
    if (ids.has(s.id)) reject(`it contains two sessions with the id "${s.id}".`)
    ids.add(s.id)
  }

  return { schemaVersion: SCHEMA_VERSION, sessions, settings: migrated.settings }
}

/**
 * Merge by session id. Adds and updates; **never drops**. `localStorage` is the only copy of
 * this data, so an import that could delete would be a foot-gun aimed at months of logs.
 *
 * Settings are taken from the file only where the store has nothing — importing must not
 * silently move a block start that is already set on this device.
 */
export function mergeDocuments(
  current: StoreDocument,
  incoming: StoreDocument,
): { doc: StoreDocument; summary: ImportSummary } {
  const merged = new Map(current.sessions.map((s) => [s.id, s]))
  let added = 0
  let updated = 0

  for (const session of incoming.sessions) {
    if (merged.has(session.id)) updated++
    else added++
    merged.set(session.id, session)
  }

  return {
    doc: {
      schemaVersion: SCHEMA_VERSION,
      sessions: [...merged.values()],
      settings: {
        ...incoming.settings,
        ...current.settings,
      },
    },
    summary: { added, updated },
  }
}

/** Indented, because the file is a backup a human may one day have to read or repair. */
export function serialiseDocument(doc: StoreDocument): string {
  return JSON.stringify(doc, null, 2)
}

export function exportFilename(today: ISODate): string {
  return `golf-practice-${today}.json`
}
