import type { ISODate, Session } from '../domain/types'
import { SCHEMA_VERSION } from './migrations'

export interface Settings {
  /** The Monday the current 3-week block began. Unset until the user says. */
  blockStart?: ISODate
}

/** One JSON document in one key. At a few sessions a week this is simpler and safer than
 *  key-per-record, and it makes export trivial. */
export interface StoreDocument {
  schemaVersion: number
  sessions: Session[]
  settings: Settings
}

export interface ImportSummary {
  added: number
  updated: number
}

/**
 * The seam. **Every method is `async`, deliberately**, even though `localStorage` is
 * synchronous — if they were synchronous now, adding a backend later would change every call
 * site. Paying the `await` cost up front is the entire point.
 *
 * No component may call `localStorage`. Components go through `lib/stores/`, which owns the
 * single instance of this.
 */
export interface Repository {
  /** Newest first. */
  listSessions(): Promise<Session[]>
  /** Upsert by id: an existing id updates, a new one inserts. */
  saveSession(session: Session): Promise<void>
  deleteSession(id: string): Promise<void>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  exportDocument(): Promise<StoreDocument>
  /** Merges by session id. Adds and updates; never drops. */
  importDocument(raw: unknown): Promise<ImportSummary>
  /**
   * Non-null when the stored data could not be read and writing is therefore refused.
   * Part of the interface, not an implementation detail: a future remote repo has the same
   * "I can see something is wrong, don't let the user overwrite it" state.
   */
  readonly faultMessage: string | null
  /** The quarantined raw text, if a fault put one aside. Lets the UI offer it as a download. */
  readQuarantine(): Promise<string | null>
}

export function emptyDocument(): StoreDocument {
  return { schemaVersion: SCHEMA_VERSION, sessions: [], settings: {} }
}
