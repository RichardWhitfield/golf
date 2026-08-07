import type { ISODate, Shot, TrackmanSession } from '../domain/types'

/**
 * The ingest seam, as specified in `docs/architecture.md` §4. `ApiSource` implements it.
 *
 * Manual entry deliberately does **not** get a `ManualSource`. It is a form in the browser;
 * `ApiSource` runs in Node under GitHub Actions. The two are never polymorphically substituted,
 * so an interface spanning them would be indirection that does nothing. The seam still earns its
 * place: this API is undocumented and assumed breakable, so a replacement implementation is a
 * realistic prospect.
 */
export interface TrackmanSource {
  name: string
  /** Cheap liveness check. Must never throw, and must never include the credential in a result. */
  isAvailable(): Promise<boolean>
  /**
   * Inclusive of `date`. Returns sessions already aggregated per club, and the per-shot record
   * keyed by session id — the ingest writes the two to different places (D24).
   */
  fetchSince(date: ISODate): Promise<{ sessions: TrackmanSession[]; shots: Map<string, Shot[]> }>
}
