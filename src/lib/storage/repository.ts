import type { DestinationNotes, ISODate, Session, TrackmanSession } from '../domain/types'
import type { TrackmanMergeResult } from '../ingest/merge'
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
  /** schemaVersion 5. Required on the document; `{}` is the empty answer, never `undefined`. */
  destinations: DestinationNotes
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
  /**
   * The whole map, read whole and written whole — the same singleton-document shape as
   * `settings`, and on this interface rather than on `RemoteRepo` alone. D28 keeps shots off it
   * because they are megabytes; a hundred short marks are not.
   *
   * **A failed read degrades to an empty map**, and that is honoured by `CachedRepo` — the
   * implementation the app actually holds. The route is younger than the deployed function, so
   * `GET /destinations` 404s until `infra/` is redeployed by hand, which is the normal state
   * between merge and deploy. An empty map is the right answer to "which courses are marked"
   * when the store cannot say; a throw would reach a render.
   *
   * `RemoteRepo` still throws, deliberately. It is a thin HTTP client, and the difference
   * between "the store says nothing is marked" and "the store could not be asked" is exactly
   * what stops `CachedRepo` overwriting cached marks with an empty map it never received.
   */
  getDestinations(): Promise<DestinationNotes>
  /** **A failed write throws**, always. Silently losing a mark is the failure mode
   *  `localStorage` never had, and the whole reason writes go remote-first. */
  saveDestinations(notes: DestinationNotes): Promise<void>
  exportDocument(): Promise<StoreDocument>
  /** Merges by session id. Adds and updates; never drops. */
  importDocument(raw: unknown): Promise<ImportSummary>
  /**
   * Fold in Trackman sessions fetched by the scheduled workflow. Adds and updates; never drops,
   * and **never overwrites a session marked `manual`**. Writes only when something changed, so
   * the sync that runs on every page load is free when there is nothing new.
   */
  mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult>
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
  return { schemaVersion: SCHEMA_VERSION, sessions: [], settings: {}, destinations: {} }
}
