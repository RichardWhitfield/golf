export type Route = 'plan' | 'log' | 'progress'

const PATHS: Record<Route, string> = { plan: '/', log: '/log', progress: '/progress' }

/** `null` for anything unrecognised — the caller normalises it back to the plan. */
function routeFor(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/index.html') return 'plan'
  if (path === '/log') return 'log'
  if (path === '/progress') return 'progress'
  return null
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

  /** `replace` rewrites an unknown path rather than pushing, so Back doesn't bounce off it. */
  #sync(replace: boolean): void {
    const route = routeFor(window.location.pathname)
    if (route === null) {
      if (replace) history.replaceState({}, '', PATHS.plan)
      this.current = 'plan'
      return
    }
    this.current = route
  }
}

export const router = new Router()
