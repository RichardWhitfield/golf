import { isTrackman, type Session, type TrackmanSession } from '../domain/types'

export interface TrackmanMergeResult {
  sessions: Session[]
  added: number
  updated: number
  /** Left alone because a hand-typed record already covers it. */
  skipped: number
  /** False means nothing needs writing. The caller must not touch storage in that case. */
  changed: boolean
}

/**
 * Merge fetched Trackman sessions into the stored list.
 *
 * Three rules, in order:
 *
 * 1. **Keyed on the Trackman activity id**, so re-running is idempotent. Never on the date —
 *    23 dates in the 13-month backfill carry more than one session.
 * 2. **A stored session marked `manual` is never overwritten.** Editing an imported session in
 *    the form flips it to `manual`, which is what gives this rule teeth; without that it would
 *    only protect records nobody had touched.
 * 3. **A date already carrying a manual Trackman session takes no import at all.** Without this,
 *    a day logged by hand and then fetched would be counted twice by every progress chart. It is
 *    reversible: delete the manual record and the next load brings in the richer one.
 *
 * Never drops anything, in keeping with `mergeDocuments`. `localStorage` is the only copy.
 */
export function mergeTrackmanSessions(
  current: Session[],
  incoming: TrackmanSession[],
): TrackmanMergeResult {
  const byId = new Map(current.map((s) => [s.id, s]))
  const manualDates = new Set(
    current.filter((s) => isTrackman(s) && s.source === 'manual').map((s) => s.date),
  )

  let added = 0
  let updated = 0
  let skipped = 0

  for (const session of incoming) {
    const existing = byId.get(session.id)

    if (existing && isTrackman(existing) && existing.source === 'manual') {
      skipped++
      continue
    }
    if (!existing && manualDates.has(session.date)) {
      skipped++
      continue
    }
    if (!existing) {
      byId.set(session.id, session)
      added++
      continue
    }
    // Only counted as an update when something actually differs, so a routine sync over unchanged
    // data reports no change and the caller writes nothing.
    if (JSON.stringify(existing) !== JSON.stringify(session)) {
      byId.set(session.id, session)
      updated++
    }
  }

  return {
    sessions: [...byId.values()],
    added,
    updated,
    skipped,
    changed: added > 0 || updated > 0,
  }
}
