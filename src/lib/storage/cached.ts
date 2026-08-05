import type { Session, TrackmanSession } from '../domain/types'
import type { TrackmanMergeResult } from '../ingest/merge'
import type { ImportSummary, Repository, Settings, StoreDocument } from './repository'

/**
 * The remote store, with a `localStorage` read cache in front of it.
 *
 * **Remote is the record; the cache exists so the page paints.** Reads answer from the cache and
 * then `refresh()` replaces it. Writes go to the remote *first* and are mirrored afterwards — a
 * write that reached only the cache would look saved and would not be.
 *
 * A decorator rather than caching baked into `RemoteRepo`, so the network layer stays a thin
 * fake-able HTTP client and this policy is testable on its own.
 */
export class CachedRepo implements Repository {
  readonly #remote: Repository
  readonly #cache: Repository
  #stale = false

  constructor(remote: Repository, cache: Repository) {
    this.#remote = remote
    this.#cache = cache
  }

  /** True when the last refresh could not reach the store, so reads are serving cached data. */
  get stale(): boolean {
    return this.#stale
  }

  /**
   * **Only the remote's fault gates writes.** `LocalStorageRepo` refuses every write once it
   * cannot read its own document — correct when it is the only copy, wrong when it is a cache,
   * because an unreadable cache would then block saves the remote would have accepted.
   */
  get faultMessage(): string | null {
    return this.#remote.faultMessage
  }

  async listSessions(): Promise<Session[]> {
    try {
      return await this.#cache.listSessions()
    } catch {
      return this.#remote.listSessions()
    }
  }

  async getSettings(): Promise<Settings> {
    try {
      return await this.#cache.getSettings()
    } catch {
      return this.#remote.getSettings()
    }
  }

  /**
   * Pull the remote into the cache. Call after mount; never block first paint on it.
   *
   * Seeds the remote from the cache when — and only when — a **successful** read comes back
   * empty. A failed read and an empty store are the same value and very different meanings;
   * treating a network error as "nothing there yet" would re-upload on every load.
   */
  async refresh(): Promise<void> {
    let sessions: Session[]
    let settings: Settings
    try {
      sessions = await this.#remote.listSessions()
      settings = await this.#remote.getSettings()
      this.#stale = false
    } catch {
      this.#stale = true
      return
    }

    if (sessions.length === 0) {
      const local = await this.#cacheSessions()
      if (local.length > 0) {
        for (const session of local) await this.#remote.saveSession(session)
        return
      }
    }

    await this.#replaceCache({ sessions, settings })
  }

  async saveSession(session: Session): Promise<void> {
    await this.#remote.saveSession(session)
    await this.#mirror(() => this.#cache.saveSession(session))
  }

  async deleteSession(id: string): Promise<void> {
    await this.#remote.deleteSession(id)
    await this.#mirror(() => this.#cache.deleteSession(id))
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.#remote.saveSettings(settings)
    await this.#mirror(() => this.#cache.saveSettings(settings))
  }

  async exportDocument(): Promise<StoreDocument> {
    return this.#remote.exportDocument()
  }

  async importDocument(raw: unknown): Promise<ImportSummary> {
    const summary = await this.#remote.importDocument(raw)
    await this.refresh()
    return summary
  }

  async mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult> {
    const result = await this.#remote.mergeTrackman(incoming)
    if (result.changed) await this.refresh()
    return result
  }

  /** The local quarantine is still worth offering — it may hold sessions the seed never saw. */
  async readQuarantine(): Promise<string | null> {
    return this.#cache.readQuarantine()
  }

  async #cacheSessions(): Promise<Session[]> {
    try {
      return await this.#cache.listSessions()
    } catch {
      return []
    }
  }

  /**
   * **Replace, never merge.** Saving the remote's sessions over the cache without first dropping
   * what is no longer there leaves deletions invisible: a session removed on the laptop would
   * survive in the phone's cache indefinitely, and the stale copy would keep reappearing after
   * every refresh.
   *
   * Done entirely through the `Repository` interface rather than by clearing the storage key
   * directly. Reaching past the injected cache to `globalThis.localStorage` would break the seam
   * this whole design rests on — and would be untestable without jsdom.
   */
  async #replaceCache(doc: { sessions: Session[]; settings: Settings }): Promise<void> {
    await this.#mirror(async () => {
      const keep = new Set(doc.sessions.map((s) => s.id))
      for (const session of await this.#cacheSessions()) {
        if (!keep.has(session.id)) await this.#cache.deleteSession(session.id)
      }
      for (const session of doc.sessions) await this.#cache.saveSession(session)
      await this.#cache.saveSettings(doc.settings)
    })
  }

  /**
   * Cache failures are swallowed by design — private browsing, blocked cookies, a full quota.
   * A missing cache is a performance problem, not a data one, because the write already landed
   * remotely. This is the one place in the app where swallowing is correct.
   */
  async #mirror(write: () => Promise<void>): Promise<void> {
    try {
      await write()
    } catch {
      // Deliberately silent — see above.
    }
  }
}
