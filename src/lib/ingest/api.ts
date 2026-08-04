import type { ISODate, TrackmanSession } from '../domain/types'
import { aggregateActivities, type RawActivity, type UnknownClubReporter } from './aggregate'
import type { TrackmanSource } from './source'

const TOKEN_URL = 'https://login.trackmangolf.com/connect/token'
const GRAPHQL_URL = 'https://api.trackmangolf.com/graphql'

/**
 * The **public** mobile OAuth client: authorization_code + PKCE, no client secret. The portal's
 * own client is confidential and BFF-backed, so it cannot be driven from CI.
 */
const CLIENT_ID = 'old-golf-app.c686e909-5102-45ac-9860-8d0b789073ae'

/** The API pages at 50. The 13-month backfill needed two pages for its 91 sessions. */
const PAGE_SIZE = 50

/**
 * Monday sessions arrive as `VirtualRangeSessionActivity`.
 *
 * `aggregatedMeasurement` is deliberately **not** requested, even though it would give per-club
 * averages server-side. It cannot report `n`, and #14 requires a shot count on every point —
 * a ten-shot average and a two-hundred-shot average must not look alike.
 */
const QUERY = `
query Sessions($from: DateTime!, $to: DateTime!, $take: Int!, $skip: Int!) {
  me {
    activities(kinds: [VIRTUAL_RANGE], timeFrom: $from, timeTo: $to, take: $take, skip: $skip) {
      totalCount
      pageInfo { hasNextPage }
      items {
        id
        time
        ... on VirtualRangeSessionActivity {
          strokeCount
          strokes { club time measurement { clubPath } }
        }
      }
    }
  }
}`

/** Raised for every failure here. Never carries the credential, or any part of it. */
export class TrackmanApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrackmanApiError'
  }
}

interface ActivitiesPage {
  totalCount: number
  pageInfo: { hasNextPage: boolean }
  items: RawActivity[]
}

/**
 * Reads sessions from TrackMan's undocumented GraphQL API.
 *
 * **Runs in Node, under GitHub Actions — never in the browser.** The refresh token is an Actions
 * secret, and anything in `dist/` is public on `golf.whitfield.life`.
 *
 * Assume this breaks without notice. Every caller must degrade to manual entry.
 */
export class ApiSource implements TrackmanSource {
  readonly name = 'trackman-api'

  readonly #refreshToken: string

  constructor(refreshToken: string) {
    if (!refreshToken) throw new TrackmanApiError('No refresh token was supplied.')
    this.#refreshToken = refreshToken
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.#accessToken()
      return true
    } catch {
      return false
    }
  }

  async fetchSince(date: ISODate, onUnknownClub?: UnknownClubReporter): Promise<TrackmanSession[]> {
    const token = await this.#accessToken()
    const from = `${date}T00:00:00Z`
    // Open-ended on purpose: "now" would race a session still being written as the job runs.
    const to = '2100-01-01T00:00:00Z'

    const items: RawActivity[] = []
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const page = await this.#query(token, from, to, skip)
      items.push(...page.items)
      if (!page.pageInfo.hasNextPage) break
      // A server that always claims another page would otherwise loop until the runner dies.
      if (items.length >= page.totalCount) break
    }

    return aggregateActivities(items, onUnknownClub)
  }

  /**
   * Refresh-token grant. The token is **non-rotating and reusable**, so nothing is written back
   * and there is no rotation failure mode. Access tokens last 14 days.
   */
  async #accessToken(): Promise<string> {
    let res: Response
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: this.#refreshToken,
        }),
      })
    } catch (error) {
      throw new TrackmanApiError(
        `Could not reach the token endpoint: ${error instanceof Error ? error.message : 'unknown'}`,
      )
    }

    if (!res.ok) {
      // Status only. The response body of a failed token exchange can echo the grant back, and
      // this message ends up in a public workflow log.
      throw new TrackmanApiError(
        `The token exchange failed with HTTP ${res.status}. The refresh token may have expired — ` +
          'repeat the one-time browser login and reset the TRACKMAN_REFRESH_TOKEN secret.',
      )
    }

    const body = (await res.json()) as { access_token?: unknown }
    if (typeof body.access_token !== 'string' || body.access_token === '') {
      throw new TrackmanApiError('The token endpoint returned no access token.')
    }
    return body.access_token
  }

  async #query(token: string, from: string, to: string, skip: number): Promise<ActivitiesPage> {
    let res: Response
    try {
      res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: QUERY, variables: { from, to, take: PAGE_SIZE, skip } }),
      })
    } catch (error) {
      throw new TrackmanApiError(
        `Could not reach the API: ${error instanceof Error ? error.message : 'unknown'}`,
      )
    }

    if (!res.ok) throw new TrackmanApiError(`The API returned HTTP ${res.status}.`)

    const body = (await res.json()) as {
      data?: { me?: { activities?: ActivitiesPage } }
      errors?: { message?: string }[]
    }

    // GraphQL reports failures inside a 200. Ignoring `errors` would treat a partial or empty
    // response as "no sessions this week", which is indistinguishable from a quiet week.
    if (body.errors?.length) {
      const messages = body.errors.map((e) => e.message ?? 'unknown').join('; ')
      throw new TrackmanApiError(`The API reported errors: ${messages}`)
    }

    const page = body.data?.me?.activities
    if (!page || !Array.isArray(page.items)) {
      throw new TrackmanApiError('The API returned no activities node.')
    }
    return page
  }
}
