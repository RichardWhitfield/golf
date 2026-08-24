import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COURSES, RANKING_SOURCE, type AusState } from './courses'
import { STATE_BOUNDS, courseBySlug, isWithinState } from './destinations'

const STATES: AusState[] = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']

const publicDir = fileURLToPath(new URL('../../../public/', import.meta.url))

describe('COURSES', () => {
  it('holds all 100 ranks, each exactly once', () => {
    expect(COURSES).toHaveLength(100)
    expect(COURSES.map((c) => c.rank).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    )
  })

  it('is in rank order', () => {
    expect(COURSES.map((c) => c.rank)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
  })

  it('has unique slugs, all in the URL-safe alphabet', () => {
    const slugs = COURSES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(100)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('names a real state on every course', () => {
    for (const c of COURSES) expect(STATES).toContain(c.state)
  })

  it('puts every course inside its own state', () => {
    // THE TEST THAT MATTERS. A course dropped into the wrong state renders as a perfectly
    // plausible marker — the error is invisible to anyone who does not already know where the
    // course is. The boxes are loose on purpose; they catch the research error, not the border.
    const strays = COURSES.filter((c) => !isWithinState(c)).map(
      (c) => `${c.name} (${c.state}) at ${c.lat}, ${c.lon}`,
    )
    expect(strays).toEqual([])
  })

  it('keeps every course in the southern hemisphere', () => {
    // The dropped minus sign, which would otherwise put a Melbourne course in Mongolia.
    for (const c of COURSES) expect(c.lat).toBeLessThan(0)
  })

  it('has a non-empty summary on every course', () => {
    for (const c of COURSES) expect(c.summary.trim().length).toBeGreaterThan(0)
  })

  it('states every URL absolutely, over https', () => {
    for (const c of COURSES) {
      for (const url of [c.site, c.visitorUrl]) {
        if (url !== undefined) expect(url).toMatch(/^https:\/\/\S+$/)
      }
    }
    expect(RANKING_SOURCE).toMatch(/^https:\/\/\S+$/)
  })
})

describe('greenFee', () => {
  it('is absent, never zero', () => {
    // `0` renders as free, and would be wrong in the most expensive possible direction.
    for (const c of COURSES) {
      expect(c.greenFee?.amount).not.toBe(0)
      if (c.greenFee !== undefined) {
        expect(c.greenFee.amount).toBeGreaterThan(0)
        expect(Number.isFinite(c.greenFee.amount)).toBe(true)
        expect(c.greenFee.currency).toBe('AUD')
      }
    }
  })

  it('never carries an optional key set to null, undefined or 0', () => {
    const optional = ['site', 'visitorUrl', 'accessNote', 'greenFee', 'logo', 'checkedOn'] as const
    for (const c of COURSES) {
      for (const key of optional) {
        if (key in c) {
          expect(c[key], `${c.slug}.${key}`).toBeTruthy()
        }
      }
      if (c.greenFee !== undefined && 'note' in c.greenFee) {
        expect(c.greenFee.note).toBeTruthy()
      }
    }
  })
})

describe('access', () => {
  it('uses only the four access values', () => {
    // The `Access` union already guarantees this at compile time. Kept anyway: the data is
    // hand-maintained, and a typo introduced by an editor that does not typecheck is cheap to
    // catch here.
    for (const c of COURSES) {
      expect(['public', 'limited', 'members', 'unknown']).toContain(c.access)
    }
  })

  it('explains every unknown — an unknown with no note is indistinguishable from an oversight', () => {
    // If you cannot say what the access is, you must say why you do not know. A bare `'unknown'`
    // reads exactly like a row somebody started and never finished.
    const unexplained = COURSES.filter(
      (c) => c.access === 'unknown' && (c.accessNote ?? '').trim() === '',
    ).map((c) => c.name)
    expect(unexplained).toEqual([])
  })

  it('hedges every unknown note rather than asserting a policy', () => {
    // A HEURISTIC, NOT A PROOF. It cannot tell an assertion from a hedge; it only checks that the
    // note reaches for one of the phrasings the dataset actually uses. Its job is to trip a
    // future hand-edit of this static file — downgrading `access` to 'unknown' while leaving the
    // note saying "play is as the guest of a member" would otherwise pass silently.
    //
    // A failure here means one of two things, and the message names the course so you can tell
    // which: either you wrote a hedge in wording this list has not seen, in which case add it —
    // 'does not spell out' was added for exactly that reason, for Bougle Run — or you asserted
    // something the research could not confirm, in which case fix the note, not the list.
    const HEDGES = [
      'unverified',
      'could not be',
      'believed',
      'appears',
      'not established',
      'understood to be',
      'does not spell out',
    ]
    const asserting = COURSES.filter((c) => c.access === 'unknown').filter((c) => {
      const note = (c.accessNote ?? '').toLowerCase()
      return !HEDGES.some((h) => note.includes(h))
    })
    expect(asserting.map((c) => `${c.name}: ${c.accessNote}`)).toEqual([])
  })
})

describe('logo', () => {
  it('points at a file that exists', () => {
    // A logo path with no file behind it is a broken marker, which the map cannot report.
    const broken = COURSES.filter((c) => c.logo !== undefined && !existsSync(publicDir + c.logo))
    expect(broken.map((c) => c.logo)).toEqual([])
  })

  it('is relative to the site root', () => {
    for (const c of COURSES) {
      if (c.logo !== undefined) expect(c.logo).toBe(`logos/${c.slug}.png`)
    }
  })
})

describe('courseBySlug', () => {
  it('finds a course by its slug', () => {
    expect(courseBySlug('kingston-heath')?.rank).toBe(3)
  })

  it('returns undefined for an unknown slug rather than a nearest match', () => {
    expect(courseBySlug('kingston-heat')).toBeUndefined()
  })
})

describe('STATE_BOUNDS', () => {
  it('covers all eight states', () => {
    for (const state of STATES) expect(STATE_BOUNDS[state]).toBeDefined()
  })

  it('reaches King Island, the northernmost Tasmanian golf', () => {
    // Cape Wickham sits at -39.59, well north of the Tasmanian mainland. A box drawn around the
    // mainland alone would fail two real courses.
    expect(STATE_BOUNDS.TAS.maxLat).toBeGreaterThan(-39.5)
  })

  it('is drawn in the southern hemisphere throughout', () => {
    for (const state of STATES) {
      expect(STATE_BOUNDS[state].minLat).toBeLessThan(STATE_BOUNDS[state].maxLat)
      expect(STATE_BOUNDS[state].maxLat).toBeLessThan(0)
      expect(STATE_BOUNDS[state].minLon).toBeLessThan(STATE_BOUNDS[state].maxLon)
    }
  })
})
