import { describe, expect, it } from 'vitest'
import { pathFor, resolvePath, router, type Route } from './router.svelte'

/** Every route served at a fixed path. `course` is excluded — its path carries a slug. */
const ROUTES: Route[] = ['plan', 'log', 'progress', 'destinations']

describe('resolvePath', () => {
  it('serves the three views under /practice', () => {
    expect(resolvePath('/practice')).toEqual({
      route: 'plan',
      canonical: '/practice',
      redirect: false,
    })
    expect(resolvePath('/practice/log')).toEqual({
      route: 'log',
      canonical: '/practice/log',
      redirect: false,
    })
    expect(resolvePath('/practice/progress')).toEqual({
      route: 'progress',
      canonical: '/practice/progress',
      redirect: false,
    })
  })

  it('redirects the paths the site used to serve', () => {
    // THE POINT OF THIS MODULE. The daily entry point is a bookmark pointing at `/`, and these
    // three were live URLs on a real domain before the views moved under /practice.
    expect(resolvePath('/')).toEqual({ route: 'plan', canonical: '/practice', redirect: true })
    expect(resolvePath('/log')).toEqual({
      route: 'log',
      canonical: '/practice/log',
      redirect: true,
    })
    expect(resolvePath('/progress')).toEqual({
      route: 'progress',
      canonical: '/practice/progress',
      redirect: true,
    })
  })

  it('treats /index.html as the plan page', () => {
    // Pages serves the shell for it, so it is a real address someone can land on.
    expect(resolvePath('/index.html')).toEqual({
      route: 'plan',
      canonical: '/practice',
      redirect: true,
    })
  })

  it('resolves a trailing slash to the route, and rewrites it', () => {
    expect(resolvePath('/practice/')).toEqual({
      route: 'plan',
      canonical: '/practice',
      redirect: true,
    })
    expect(resolvePath('/practice/log/')).toEqual({
      route: 'log',
      canonical: '/practice/log',
      redirect: true,
    })
    expect(resolvePath('/log/')).toEqual({
      route: 'log',
      canonical: '/practice/log',
      redirect: true,
    })
    expect(resolvePath('//')).toEqual({ route: 'plan', canonical: '/practice', redirect: true })
  })

  it('folds case, so a hand-typed path lands where it was aimed', () => {
    expect(resolvePath('/Log')).toEqual({
      route: 'log',
      canonical: '/practice/log',
      redirect: true,
    })
    expect(resolvePath('/PRACTICE/PROGRESS')).toEqual({
      route: 'progress',
      canonical: '/practice/progress',
      redirect: true,
    })
  })

  it('falls back to the plan for anything unrecognised', () => {
    // Including a path that only looks nested: /practice/nope is no more a route than /nope.
    for (const unknown of ['/nope', '/practice/nope', '/log/extra', '/destination']) {
      expect(resolvePath(unknown)).toEqual({
        route: 'plan',
        canonical: '/practice',
        redirect: true,
      })
    }
  })

  it('serves the destinations index', () => {
    expect(resolvePath('/destinations')).toEqual({
      route: 'destinations',
      canonical: '/destinations',
      redirect: false,
    })
  })

  it('resolves a course to its slug', () => {
    expect(resolvePath('/destinations/kingston-heath')).toEqual({
      route: 'course',
      slug: 'kingston-heath',
      canonical: '/destinations/kingston-heath',
      redirect: false,
    })
  })

  it('resolves a slug it has never heard of, because it resolves shape and not existence', () => {
    // Deliberate. This module does not import `courses.ts`: a router holding the hundred slugs
    // would need editing every time the registry moved, and a retired course would land silently
    // on the plan page instead of being told what happened to it. CourseView answers that.
    expect(resolvePath('/destinations/not-a-real-course')).toEqual({
      route: 'course',
      slug: 'not-a-real-course',
      canonical: '/destinations/not-a-real-course',
      redirect: false,
    })
  })

  it('rejects a slug that is really a path', () => {
    // `/destinations/a/b` is no more a course than `/nope` is. The slash fails the shape test
    // rather than being swallowed into a slug that could never match anything.
    for (const nested of ['/destinations/a/b', '/destinations/a/b/c']) {
      expect(resolvePath(nested)).toEqual({
        route: 'plan',
        canonical: '/practice',
        redirect: true,
      })
    }
  })

  it('rejects a slug outside the URL-safe alphabet', () => {
    for (const bad of ['/destinations/kingston heath', '/destinations/kingston_heath']) {
      expect(resolvePath(bad).route).toBe('plan')
    }
  })

  it('strips a trailing slash from a course path and rewrites it', () => {
    expect(resolvePath('/destinations/kingston-heath/')).toEqual({
      route: 'course',
      slug: 'kingston-heath',
      canonical: '/destinations/kingston-heath',
      redirect: true,
    })
    expect(resolvePath('/destinations/')).toEqual({
      route: 'destinations',
      canonical: '/destinations',
      redirect: true,
    })
  })

  it('folds a hand-typed course path to its lowercase slug', () => {
    expect(resolvePath('/Destinations/Kingston-Heath')).toEqual({
      route: 'course',
      slug: 'kingston-heath',
      canonical: '/destinations/kingston-heath',
      redirect: true,
    })
  })

  it('carries no slug on any route but course', () => {
    // `slug` is absent rather than undefined, so a view cannot read one off the plan page.
    for (const route of ROUTES) expect('slug' in resolvePath(router.href(route))).toBe(false)
  })

  it('reports no redirect for the path each nav link points at', () => {
    // A link whose href resolved with `redirect: true` would rewrite the URL on arrival — the
    // nav and the resolver disagreeing about where a view lives.
    for (const route of ROUTES) {
      expect(resolvePath(router.href(route))).toEqual({
        route,
        canonical: router.href(route),
        redirect: false,
      })
    }
  })

  it('round-trips the href of a course link', () => {
    const href = router.href('course', 'royal-melbourne-gc-west-course')
    expect(href).toBe('/destinations/royal-melbourne-gc-west-course')
    expect(resolvePath(href).redirect).toBe(false)
    expect(resolvePath(href).slug).toBe('royal-melbourne-gc-west-course')
  })
})

describe('pathFor', () => {
  it('sends a course with no slug to the index rather than to /destinations/undefined', () => {
    // The one URL a template typo would otherwise produce, and it would 404 on Pages.
    expect(pathFor('course')).toBe('/destinations')
    expect(resolvePath(pathFor('course')).route).toBe('destinations')
  })
})
