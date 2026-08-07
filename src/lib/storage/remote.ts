import type { Session, Shot, TrackmanSession } from '../domain/types'
import { mergeTrackmanSessions, type TrackmanMergeResult } from '../ingest/merge'
import { SCHEMA_VERSION, migrate } from './migrations'
import type { ImportSummary, Repository, Settings, StoreDocument } from './repository'
import { mergeDocuments, parseDocument } from './transfer'

/** Every failure to reach or read the store. Carries a message meant for the user. */
export class RemoteStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemoteStoreError'
  }
}

const UNREADABLE =
  'The practice store returned something this build cannot read. Nothing has been changed.'

/**
 * The `Repository` implementation over the Lambda Function URL.
 *
 * **Thin on purpose.** Caching, cold-start rendering and the seed all live in `CachedRepo`, so
 * this class is a plain HTTP client that a fake `fetch` can exercise completely.
 *
 * `fetch` is injected for the tests, and because this class also runs in Node under the ingest
 * workflow, where the global is present but worth being explicit about.
 */
export class RemoteRepo implements Repository {
  readonly #base: string
  readonly #fetch: typeof fetch
  #fault: string | null = null

  constructor(baseUrl: string, fetcher: typeof fetch = globalThis.fetch) {
    // A trailing slash would produce `//sessions`, which the route table does not match.
    this.#base = baseUrl.replace(/\/+$/, '')
    // **Bound, and it must be.** Held as a field, `this.#fetch(...)` is a *method* call, so the
    // receiver is this repo — and a browser rejects `window.fetch` invoked on anything but the
    // window: "Failed to execute 'fetch' on 'Window': Illegal invocation".
    //
    // Node's fetch tolerates a foreign receiver, so the ingest script, the seed and every test
    // passed while the browser threw on the first request. `CachedRepo` then caught it and
    // served cached data exactly as designed, so the site looked fine and simply never synced.
    // The since-deleted `ingest/published.ts` escaped this only because it called its fetcher as
    // a bare function, where the receiver is `undefined` and the browser allows it.
    this.#fetch = fetcher.bind(globalThis)
  }

  get faultMessage(): string | null {
    return this.#fault
  }

  /**
   * **Migrations still run, and still operate on a whole document.** The store reports the lowest
   * `schemaVersion` among its items, and that assembled document goes through the same `migrate()`
   * chain the local store uses — so "bump the version and write a migration" keeps working now
   * that the data lives remotely. Settings are migrated by `exportDocument()`, which is the only
   * path that has them to hand; a future migration that touches `settings` must therefore be
   * written to tolerate an absent one here.
   */
  async listSessions(): Promise<Session[]> {
    const body = await this.#request<{ sessions: Session[]; schemaVersion?: number }>(
      'GET',
      '/sessions',
    )
    const doc = migrate({
      schemaVersion: body.schemaVersion ?? SCHEMA_VERSION,
      sessions: body.sessions,
      settings: {},
    })
    // The handler already sorts, but the contract is this method's to keep, not the server's.
    return doc.sessions.slice().sort((a, b) => b.date.localeCompare(a.date))
  }

  async saveSession(session: Session): Promise<void> {
    await this.#write(`/sessions/${encodeURIComponent(session.id)}`, session)
  }

  async deleteSession(id: string): Promise<void> {
    this.#guard()
    await this.#request('DELETE', `/sessions/${encodeURIComponent(id)}`)
  }

  /**
   * Per-shot metrics for one session, in their own item (D24).
   *
   * **Deliberately not on the `Repository` interface.** Components reach storage through that
   * interface; putting shots on it would invite a component to download thousands of rows to
   * draw charts that do not use them, which is the whole reason the key space is separate. The
   * ingest is the only writer, and `CachedRepo` never sees these.
   */
  async saveShots(sessionId: string, shots: Shot[]): Promise<void> {
    await this.#write(`/shots/${encodeURIComponent(sessionId)}`, { shots })
  }

  async getShots(sessionId: string): Promise<Shot[]> {
    const body = await this.#request<{ shots: Shot[] }>(
      'GET',
      `/shots/${encodeURIComponent(sessionId)}`,
    )
    return body.shots ?? []
  }

  async getSettings(): Promise<Settings> {
    const body = await this.#request<{ settings: Settings }>('GET', '/settings')
    return { ...body.settings }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.#write('/settings', settings)
  }

  /**
   * Assembled into the same `StoreDocument` the local store exports, so **existing exports stay
   * importable and existing imports keep working**.
   */
  async exportDocument(): Promise<StoreDocument> {
    // Both reads happen FIRST — they are what *detect* a fault. Checking beforehand only sees one
    // left by an earlier call, so a fresh instance over a broken store would hand back an empty
    // document as though it were a successful backup. `LocalStorageRepo.exportDocument` carries
    // the same ordering, and for the same reason.
    const sessions = await this.listSessions()
    const settings = await this.getSettings()
    if (this.#fault) throw new RemoteStoreError(this.#fault)
    return { schemaVersion: SCHEMA_VERSION, sessions, settings }
  }

  async importDocument(raw: unknown): Promise<ImportSummary> {
    const incoming = parseDocument(raw)
    const current = await this.exportDocument()
    const { doc, summary } = mergeDocuments(current, incoming)
    // Only what changed. Rewriting untouched sessions would burn write units and churn
    // `updatedAt` on records nobody edited.
    const before = new Map(current.sessions.map((s) => [s.id, JSON.stringify(s)]))
    for (const session of doc.sessions) {
      if (before.get(session.id) !== JSON.stringify(session)) await this.saveSession(session)
    }
    if (JSON.stringify(current.settings) !== JSON.stringify(doc.settings)) {
      await this.saveSettings(doc.settings)
    }
    return summary
  }

  /**
   * The same pure merge the local store uses — one implementation of "never overwrite a manual
   * record", covered by one set of tests.
   *
   * `?ifNotManual=1` makes the database enforce it too. The merge below is a read-then-write, so
   * a browser save landing between the read and the write would otherwise slip past it.
   */
  async mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult> {
    const current = await this.listSessions()
    const result = mergeTrackmanSessions(current, incoming)
    if (!result.changed) return result

    const before = new Map(current.map((s) => [s.id, JSON.stringify(s)]))
    for (const session of result.sessions) {
      if (before.get(session.id) === JSON.stringify(session)) continue
      await this.#write(`/sessions/${encodeURIComponent(session.id)}?ifNotManual=1`, session)
    }
    return result
  }

  /** Nothing is quarantined remotely — an unreadable response is not a stored document. */
  async readQuarantine(): Promise<string | null> {
    return null
  }

  #guard(): void {
    if (this.#fault) throw new RemoteStoreError(`Refusing to write: ${this.#fault}`)
  }

  async #write(path: string, value: unknown): Promise<void> {
    this.#guard()
    await this.#request('PUT', path, value)
  }

  async #request<T>(method: string, path: string, value?: unknown): Promise<T> {
    let res: Response
    try {
      res = await this.#fetch(`${this.#base}${path}`, {
        method,
        ...(value === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }),
      })
    } catch (error) {
      throw new RemoteStoreError(
        `Could not reach the practice store: ${error instanceof Error ? error.message : 'unknown'}`,
      )
    }

    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      // A gateway error page, a redirect, a truncated response. Treated as a fault so writes
      // stop, rather than as an empty store — the same instinct as the local quarantine.
      this.#fault = UNREADABLE
      throw new RemoteStoreError(UNREADABLE)
    }

    if (!res.ok) {
      const message =
        typeof (body as { message?: unknown })?.message === 'string'
          ? (body as { message: string }).message
          : `The practice store returned HTTP ${res.status}.`
      throw new RemoteStoreError(message)
    }

    this.#fault = null
    return body as T
  }
}
