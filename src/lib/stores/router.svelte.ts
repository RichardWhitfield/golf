export type Route = 'plan' | 'log' | 'progress'

const PATHS: Record<Route, string> = {
  plan: '/practice',
  log: '/practice/log',
  progress: '/practice/progress',
}

/** Derived from `PATHS` so the two directions cannot drift apart. */
const CANONICAL: Record<string, Route> = Object.fromEntries(
  Object.entries(PATHS).map(([route, path]) => [path, route as Route]),
)

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
  const route = CANONICAL[path] ?? LEGACY[path] ?? 'plan'
  const canonical = PATHS[route]
  return { route, canonical, redirect: pathname !== canonical }
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

  /** Call once, from an `$effect`. Returns the teardown. */
  start(): () => void {
    this.#sync(true)
    const onPop = () => this.#sync(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }

  href(route: Route): string {
    return PATHS[route]
  }

  go(route: Route): void {
    if (this.current !== route) {
      history.pushState({}, '', PATHS[route])
      this.current = route
    }
    window.scrollTo({ top: 0 })
  }

  /**
   * For nav links. They stay real `<a href>` elements — middle-click and open-in-new-tab must
   * keep working, and they only do if the href is genuine and modified clicks fall through.
   */
  onNavClick(event: MouseEvent, route: Route): void {
    if (!isPlainClick(event)) return
    event.preventDefault()
    this.go(route)
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
    const { route, canonical, redirect } = resolvePath(pathname)
    if (redirect && replace) history.replaceState({}, '', canonical + search + hash)
    this.current = route
  }
}

export const router = new Router()
