import { describe, expect, it } from 'vitest'
import { resolvePath, router, type Route } from './router.svelte'

const ROUTES: Route[] = ['plan', 'log', 'progress']

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
    for (const unknown of ['/nope', '/practice/nope', '/log/extra', '/destinations']) {
      expect(resolvePath(unknown)).toEqual({
        route: 'plan',
        canonical: '/practice',
        redirect: true,
      })
    }
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
})
