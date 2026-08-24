export type Route = 'plan' | 'log' | 'progress' | 'destinations' | 'course'

const DESTINATIONS = '/destinations'

/**
 * The routes served at a fixed path. `course` is deliberately absent: its path carries a slug, so
 * it has no single address and cannot take part in the reverse lookup below.
 */
const PATHS: Record<Exclude<Route, 'course'>, string> = {
  plan: '/practice',
  log: '/practice/log',
  progress: '/practice/progress',
  destinations: DESTINATIONS,
}

/** Derived from `PATHS` so the two directions cannot drift apart. */
const CANONICAL: Record<string, Route> = Object.fromEntries(
  Object.entries(PATHS).map(([route, path]) => [path, route as Route]),
)

/**
 * The shape a course slug has to have — **not** the list of slugs that exist.
 *
 * This module deliberately does not import `courses.ts`. It resolves *shape*, not existence: a
 * router that knew the hundred slugs would have to be edited every time the registry moved, and a
 * retired course would 404 into the plan page instead of saying what happened to it. An unknown
 * slug is the view's problem, and `CourseView` answers it honestly.
 *
 * It is also why `slug` is typed `string` here rather than `CourseSlug`. A type-only import is
 * erased at build, but it would still say this file knows about the registry, and it does not.
 */
const SLUG = /^[a-z0-9-]+$/

/**
 * The paths the site served before the practice views moved under `/practice`. The daily entry
 * point is a bookmark on a phone, so these resolve rather than 404.
 */
const LEGACY: Record<string, Route> = {
  '/': 'plan',
  '/index.html': 'plan',
  '/log': 'log',
  '/progress': 'progress',
}

export interface Resolved {
  route: Route
  /** Set only on `course`. Validated for shape; nothing here knows whether it names a course. */
  slug?: string
  /** The path this route is served at. */
  canonical: string
  /** The address bar disagrees with `canonical` and should be rewritten — never pushed. */
  redirect: boolean
}

/**
 * Pure: no `window`, no `history`. This is the part of the router that a bookmark depends on, so
 * it is testable on its own rather than only through a live `location`.
 *
 * Lookups are case-folded because a hand-typed `/Log` is a legacy path with a shift key held, and
 * dropping it on the plan page would be a worse answer than the redirect it asked for.
 */
export function resolvePath(pathname: string): Resolved {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/'

  const fixed = CANONICAL[path] ?? LEGACY[path]
  if (fixed !== undefined) return resolved(fixed, undefined, pathname)

  // `/destinations/a/b` is not a course: the slash fails the shape test rather than being
  // swallowed, so a mistyped nested path lands on the plan page like any other unknown address.
  if (path.startsWith(`${DESTINATIONS}/`)) {
    const slug = path.slice(DESTINATIONS.length + 1)
    if (SLUG.test(slug)) return resolved('course', slug, pathname)
  }

  return resolved('plan', undefined, pathname)
}

function resolved(route: Route, slug: string | undefined, pathname: string): Resolved {
  const canonical = pathFor(route, slug)
  return slug === undefined
    ? { route, canonical, redirect: pathname !== canonical }
    : { route, slug, canonical, redirect: pathname !== canonical }
}

/**
 * The address a route is served at. A `course` with no slug is the index it belongs to rather
 * than a broken `/destinations/undefined` — the one URL a template typo would otherwise produce.
 */
export function pathFor(route: Route, slug?: string): string {
  if (route === 'course') return slug ? `${DESTINATIONS}/${slug}` : DESTINATIONS
  return PATHS[route]
}

/** A modified click means the user wants a new tab or window. Leave those to the browser. */
function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  )
}

class Router {
  current = $state<Route>('plan')
  /** The course slug when `current` is `'course'`, and `undefined` on every other route. */
  slug = $state<string | undefined>(undefined)

  /** Call once, from an `$effect`. Returns the teardown. */
  start(): () => void {
    this.#sync(true)
    const onPop = () => this.#sync(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }

  href(route: Route, slug?: string): string {
    return pathFor(route, slug)
  }

  go(route: Route, slug?: string): void {
    if (this.current !== route || this.slug !== slug) {
      history.pushState({}, '', pathFor(route, slug))
      this.current = route
      this.slug = slug
    }
    window.scrollTo({ top: 0 })
  }

  /**
   * For nav links. They stay real `<a href>` elements — middle-click and open-in-new-tab must
   * keep working, and they only do if the href is genuine and modified clicks fall through.
   */
  onNavClick(event: MouseEvent, route: Route, slug?: string): void {
    if (!isPlainClick(event)) return
    event.preventDefault()
    this.go(route, slug)
  }

  /**
   * Rewrites a legacy or unrecognised path rather than pushing: a push would leave the old URL
   * one Back away, where it would redirect forward again — a trap on the exact path the phone
   * bookmark uses. `replace` is false while handling a `popstate`, where the entry belongs to
   * the browser's history rather than to this navigation.
   *
   * The query and fragment are carried across because `replaceState` takes a whole URL, and a
   * bare pathname would drop them: `/progress#coverage` was a shareable address before the
   * views moved, and rewriting it to `/practice/progress` would strip the anchor it was sent
   * for. `resolvePath` stays pathname-only — the rest of the URL belongs to the caller that
   * owns `window`.
   */
  #sync(replace: boolean): void {
    const { search, hash, pathname } = window.location
    const { route, slug, canonical, redirect } = resolvePath(pathname)
    if (redirect && replace) history.replaceState({}, '', canonical + search + hash)
    this.current = route
    this.slug = slug
  }
}

export const router = new Router()
