import type { ISODate, PracticeSession } from '../domain/types'
import { resolveISODate } from '../domain/today'
import type { ImportSummary, Repository, Settings } from '../storage/repository'
import { LocalStorageRepo } from '../storage/local'
import { InvalidImportError, exportFilename, serialiseDocument } from '../storage/transfer'

/**
 * The single point where the app touches storage. **No component may import a repository or
 * call `localStorage`** — see `CLAUDE.md`. Everything goes through this object.
 *
 * The repository is injectable so a future `RemoteRepo` is a one-line change here and nowhere
 * else, which is the entire justification for the async interface.
 */
class SessionStore {
  /** Newest first, mirroring the repository's ordering. */
  list = $state<PracticeSession[]>([])
  settings = $state<Settings>({})
  /** False until the first load resolves, so the UI can avoid flashing "no sessions yet". */
  ready = $state(false)
  /** Surfaced by the Data panel. Non-null means writes are being refused. */
  warning = $state<string | null>(null)

  #repo: Repository

  constructor(repo: Repository = new LocalStorageRepo()) {
    this.#repo = repo
  }

  async load(): Promise<void> {
    this.list = await this.#repo.listSessions()
    this.settings = await this.#repo.getSettings()
    this.warning = this.#repo.faultMessage
    this.ready = true
  }

  async save(session: PracticeSession): Promise<void> {
    await this.#repo.saveSession(session)
    await this.load()
  }

  async remove(id: string): Promise<void> {
    await this.#repo.deleteSession(id)
    await this.load()
  }

  async setBlockStart(date: ISODate): Promise<void> {
    await this.#repo.saveSettings({ ...this.settings, blockStart: date })
    await this.load()
  }

  async exportText(): Promise<string> {
    return serialiseDocument(await this.#repo.exportDocument())
  }

  exportName(): string {
    return exportFilename(resolveISODate())
  }

  /**
   * Throws `InvalidImportError` with a readable reason, and the caller shows `error.message`
   * as-is.
   *
   * The bare `JSON.parse` is wrapped deliberately. Left unguarded it throws a `SyntaxError`
   * worded by the browser — "Unexpected token < in JSON at position 0" — which is not a stated
   * reason in this app's voice, and it would give the import UI a second error type to
   * special-case. One type, one voice, every rejection path.
   */
  async importText(text: string): Promise<ImportSummary> {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new InvalidImportError('That file is not a practice-log export: it is not valid JSON.')
    }
    const summary = await this.#repo.importDocument(parsed)
    await this.load()
    return summary
  }

  async quarantinedText(): Promise<string | null> {
    return this.#repo.readQuarantine()
  }
}

export const sessions = new SessionStore()
