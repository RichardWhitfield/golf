import { describe, expect, it } from 'vitest'
import { InvalidImportError } from '../storage/transfer'
import { fetchPublished, parsePublished } from './published'

const FILE = {
  version: 1,
  sessions: [
    {
      id: 'a',
      type: 'trackman',
      date: '2026-07-27',
      source: 'api',
      clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }],
    },
  ],
}

const respond = (body: string, init: ResponseInit = {}) =>
  (async () =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
      ...init,
    })) as unknown as typeof fetch

describe('parsePublished', () => {
  it('parses a published file', () => {
    expect(parsePublished(FILE)).toHaveLength(1)
  })

  it('stamps api provenance regardless of what the file claims', () => {
    // Trusting the file's own claim would let it mark itself hand-typed and so become
    // permanently unoverwritable by the merge rules.
    const spoofed = { ...FILE, sessions: [{ ...FILE.sessions[0], source: 'manual' }] }
    expect(parsePublished(spoofed)[0].source).toBe('api')
  })

  it('rejects a file from a newer format', () => {
    expect(() => parsePublished({ ...FILE, version: 2 })).toThrow(InvalidImportError)
  })

  it('rejects a file with no sessions array', () => {
    expect(() => parsePublished({ version: 1 })).toThrow(InvalidImportError)
    expect(() => parsePublished(null)).toThrow(InvalidImportError)
    expect(() => parsePublished([])).toThrow(InvalidImportError)
  })

  it('accepts a file with an empty session list', () => {
    expect(parsePublished({ version: 1, sessions: [] })).toEqual([])
  })

  it('rejects a malformed record rather than importing the rest', () => {
    const bad = { ...FILE, sessions: [FILE.sessions[0], { id: 'b', type: 'trackman' }] }
    expect(() => parsePublished(bad)).toThrow(InvalidImportError)
  })

  it('rejects a practice session smuggled into the Trackman file', () => {
    const bad = { ...FILE, sessions: [{ id: 'p', type: 'practice', date: '2026-07-27' }] }
    expect(() => parsePublished(bad)).toThrow(InvalidImportError)
  })
})

describe('fetchPublished', () => {
  it('treats a missing file as nothing published', async () => {
    expect(await fetchPublished(respond('', { status: 404 }))).toBeNull()
  })

  it('treats the SPA 404 shim as nothing published, not as corruption', async () => {
    // Pages serves 404.html for an absent path, so a missing file arrives as HTML with a 404
    // status. Checking res.ok alone would hand JSON.parse a page of markup.
    const shim = respond('<!doctype html><div id="app"></div>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    })
    expect(await fetchPublished(shim)).toBeNull()
  })

  it('treats an HTML body with a 200 status as nothing published too', async () => {
    const html = respond('<!doctype html>', { headers: { 'content-type': 'text/html' } })
    expect(await fetchPublished(html)).toBeNull()
  })

  it('returns null when the network is unavailable', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchPublished(offline)).toBeNull()
  })

  it('returns null rather than throwing when the file is corrupt', async () => {
    // The site must load with this integration broken. It is undocumented and assumed breakable.
    expect(await fetchPublished(respond('{"version":1,"sessions":[{}]}'))).toBeNull()
  })

  it('returns null rather than throwing when the body is not JSON at all', async () => {
    expect(await fetchPublished(respond('not json'))).toBeNull()
  })

  it('returns the sessions when the file is good', async () => {
    expect(await fetchPublished(respond(JSON.stringify(FILE)))).toHaveLength(1)
  })

  it('does not throw when fetch itself is absent', async () => {
    expect(await fetchPublished(undefined as unknown as typeof fetch)).toBeNull()
  })
})
