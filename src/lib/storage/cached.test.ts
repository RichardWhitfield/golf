import { describe, expect, it } from 'vitest'
import type { Session } from '../domain/types'
import { CachedRepo } from './cached'
import { LocalStorageRepo } from './local'
import type { Repository } from './repository'
import type { DestinationNotes } from '../domain/types'
import { SCHEMA_VERSION } from './migrations'

const CACHED: Session = {
  id: 'c1',
  type: 'practice',
  date: '2026-08-01',
  location: 'home',
  entries: [],
}
const FRESH: Session = {
  id: 'r1',
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [],
}

/** In-memory Storage, so the tests run in Node with no jsdom. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

/**
 * `destinations` models the store's own map; `notesFailing` models the route that does not exist
 * yet, which is what `GET /destinations` does against a function nobody has redeployed.
 */
function fakeRemote(
  sessions: Session[],
  failing = false,
  options: { destinations?: DestinationNotes; notesFailing?: boolean } = {},
): Repository & { saved: Session[]; savedNotes: DestinationNotes[] } {
  const saved: Session[] = []
  const savedNotes: DestinationNotes[] = []
  let destinations: DestinationNotes = options.destinations ?? {}
  return {
    saved,
    savedNotes,
    faultMessage: null,
    listSessions: async () => {
      if (failing) throw new Error('offline')
      return sessions
    },
    saveSession: async (s: Session) => void saved.push(s),
    deleteSession: async () => {},
    getSettings: async () => ({}),
    saveSettings: async () => {},
    getDestinations: async () => {
      if (options.notesFailing) throw new Error('no such route')
      return destinations
    },
    saveDestinations: async (notes: DestinationNotes) => {
      if (options.notesFailing) throw new Error('no such route')
      destinations = notes
      savedNotes.push(notes)
    },
    exportDocument: async () => ({
      schemaVersion: SCHEMA_VERSION,
      sessions,
      settings: {},
      destinations,
    }),
    importDocument: async () => ({ added: 0, updated: 0 }),
    mergeTrackman: async () => ({ sessions, added: 0, updated: 0, skipped: 0, changed: false }),
    readQuarantine: async () => null,
  }
}

describe('CachedRepo', () => {
  it('returns the cache immediately, then the remote after a refresh', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const repo = new CachedRepo(fakeRemote([FRESH]), cache)

    expect(await repo.listSessions()).toEqual([CACHED])
    await repo.refresh()
    expect(await repo.listSessions()).toEqual([FRESH])
  })

  it('drops from the cache what the remote no longer has', async () => {
    // A session deleted on the laptop must not survive in the phone's cache. Saving the remote
    // over the cache without dropping the difference leaves the stale copy reappearing after
    // every refresh, which reads as a deletion that would not stick.
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    await cache.saveSession(FRESH)
    await new CachedRepo(fakeRemote([FRESH]), cache).refresh()
    expect(await cache.listSessions()).toEqual([FRESH])
  })

  it('writes to the remote first, then mirrors into the cache', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    const remote = fakeRemote([])
    const repo = new CachedRepo(remote, cache)

    await repo.saveSession(FRESH)
    expect(remote.saved).toEqual([FRESH])
    expect(await cache.listSessions()).toEqual([FRESH])
  })

  it('serves the cache and reports staleness when the remote read fails', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const repo = new CachedRepo(fakeRemote([], true), cache)

    await repo.refresh()
    expect(await repo.listSessions()).toEqual([CACHED])
    expect(repo.stale).toBe(true)
  })

  it('seeds the remote from the cache when a successful read finds it empty', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const remote = fakeRemote([])
    await new CachedRepo(remote, cache).refresh()
    expect(remote.saved).toEqual([CACHED])
  })

  it('never seeds after a failed read, however empty the result looks', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const remote = fakeRemote([], true)
    await new CachedRepo(remote, cache).refresh()
    expect(remote.saved).toEqual([])
  })

  it('answers with an empty map when the destinations route does not exist', async () => {
    // The normal state between merging this phase and redeploying `infra/` by hand: `GET
    // /destinations` is a 404. A hundred courses still render; they simply have no ticks.
    const cache = new LocalStorageRepo(fakeStorage())
    const repo = new CachedRepo(fakeRemote([], false, { notesFailing: true }), cache)
    await expect(repo.getDestinations()).resolves.toEqual({})
  })

  it('reaches the store for marks when the cache itself cannot answer', async () => {
    // `LocalStorageRepo` answers `{}` rather than throwing even over corrupt text, so the cache
    // here is a stub that does throw — the same shape as the fallthrough `listSessions` and
    // `getSettings` already carry for any cache that is not that class.
    const remote = fakeRemote([], false, { destinations: { 'kingston-heath': { status: 'want' } } })
    const repo = new CachedRepo(remote, fakeRemote([], false, { notesFailing: true }))
    expect(await repo.getDestinations()).toEqual({ 'kingston-heath': { status: 'want' } })
  })

  it('writes marks to the store first, then mirrors them into the cache', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    const remote = fakeRemote([])
    const repo = new CachedRepo(remote, cache)

    await repo.saveDestinations({ 'royal-melbourne-gc-west-course': { status: 'played' } })
    expect(remote.savedNotes).toEqual([
      { 'royal-melbourne-gc-west-course': { status: 'played' } },
    ])
    expect(await cache.getDestinations()).toEqual({
      'royal-melbourne-gc-west-course': { status: 'played' },
    })
  })

  it('throws when the store refuses a mark, rather than mirroring it and looking saved', async () => {
    // The asymmetry with the read above, and the whole point of it. A mark that reached only the
    // cache would look saved on this device and be absent on the other one.
    const cache = new LocalStorageRepo(fakeStorage())
    const repo = new CachedRepo(fakeRemote([], false, { notesFailing: true }), cache)

    await expect(repo.saveDestinations({ 'kingston-heath': { status: 'want' } })).rejects.toThrow()
    expect(await cache.getDestinations()).toEqual({})
  })

  it('replaces the cached marks from a successful read, deletions included', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveDestinations({ 'kingston-heath': { status: 'want' }, gone: { status: 'want' } })
    const remote = fakeRemote([FRESH], false, {
      destinations: { 'kingston-heath': { status: 'played' } },
    })

    await new CachedRepo(remote, cache).refresh()
    expect(await cache.getDestinations()).toEqual({ 'kingston-heath': { status: 'played' } })
  })

  it('leaves the cached marks alone when the destinations route 404s', async () => {
    // Writing `{}` over the cache on the strength of a failed read would delete every mark on
    // the device each time the route was unreachable.
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveDestinations({ 'kingston-heath': { status: 'want' } })
    const remote = fakeRemote([FRESH], false, { notesFailing: true })

    await new CachedRepo(remote, cache).refresh()
    expect(await cache.getDestinations()).toEqual({ 'kingston-heath': { status: 'want' } })
  })

  it('keeps refreshing sessions when only the destinations route is missing', async () => {
    // Folding the destinations read into the sessions block would abort the whole refresh, so
    // the practice history would stop syncing over a route that has nothing to do with it.
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const repo = new CachedRepo(fakeRemote([FRESH], false, { notesFailing: true }), cache)

    await repo.refresh()
    expect(await repo.listSessions()).toEqual([FRESH])
    // And it is **not** staleness: `StaleNotice` says nothing you log will save, which would be
    // untrue — sessions are saving perfectly well.
    expect(repo.stale).toBe(false)
  })

  it('does not let an unreadable cache block a write', async () => {
    const storage = fakeStorage()
    storage.setItem('golf:store', '{ not json')
    const remote = fakeRemote([])
    const repo = new CachedRepo(remote, new LocalStorageRepo(storage))

    await repo.saveSession(FRESH)
    expect(remote.saved).toEqual([FRESH])
    expect(repo.faultMessage).toBeNull()
  })
})
