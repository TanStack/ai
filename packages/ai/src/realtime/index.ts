import { raceWithAbort } from '../utilities/activity-abort'
import type {
  RealtimeSessionConfig,
  RealtimeSessionOptions,
  RealtimeToken,
  RealtimeTokenOptions,
} from './types'

export { createRealtimeEventEmitter } from './event-emitter'

// Re-export all types
export type * from './types'

/**
 * Generate a realtime token using the provided adapter.
 *
 * This function is used on the server to generate ephemeral tokens
 * that clients can use to establish realtime connections.
 *
 * @param options - Token generation options including the adapter
 * @returns Promise resolving to a RealtimeToken
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { openaiRealtimeToken } from '@tanstack/ai-openai'
 *
 * // On the server (e.g. inside a server route or framework server
 * // function), mint an ephemeral token for the client:
 * const token = await realtimeToken({
 *   adapter: openaiRealtimeToken({ model: 'gpt-realtime-2.1' }),
 * })
 * ```
 */
export async function realtimeToken(
  options: RealtimeTokenOptions,
): Promise<RealtimeToken> {
  const { adapter, abortSignal } = options
  return raceWithAbort(
    abortSignal
      ? adapter.generateToken({ abortSignal })
      : adapter.generateToken(),
    abortSignal,
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Shallow check only. The adapter reads the config fields it knows. */
function isSessionConfig(value: unknown): value is RealtimeSessionConfig {
  return isPlainObject(value)
}

/**
 * Check the request body from the browser. Keep only `sdp` and `config`.
 */
function parseSessionRequest(request: unknown) {
  if (!isPlainObject(request)) {
    throw new Error('realtimeSession(): the request must be an object.')
  }
  const { sdp, config } = request
  if (typeof sdp !== 'string' || sdp.length === 0) {
    throw new Error(
      'realtimeSession(): the request must have a non-empty `sdp` string.',
    )
  }
  if (!isSessionConfig(config)) {
    throw new Error(
      'realtimeSession(): the request `config` must be an object.',
    )
  }
  return { sdp, config }
}

/**
 * Create a relay session with the provided adapter.
 *
 * Use this on the server. The browser sends its SDP offer and config to your
 * server. This function checks that request, then the adapter creates the
 * provider session with the server API key. Send the answer back to the
 * browser.
 *
 * The request comes from the browser, so it is not trusted. The call rejects
 * when `sdp` is not a non-empty string or `config` is not an object. Other
 * keys are dropped.
 *
 * @param options - The adapter, the request body, and an optional `abortSignal`
 * @returns Promise resolving to a RealtimeSessionAnswer
 *
 * @example
 * ```typescript
 * import { realtimeSession } from '@tanstack/ai'
 * import { openaiLiveSession } from '@tanstack/ai-openai'
 *
 * // Inside a server route that gets the browser request:
 * const answer = await realtimeSession({
 *   adapter: openaiLiveSession(),
 *   request: await request.json(),
 * })
 * return Response.json(answer)
 * ```
 */
export async function realtimeSession(options: RealtimeSessionOptions) {
  const { adapter, abortSignal } = options
  const request = parseSessionRequest(options.request)
  return raceWithAbort(
    abortSignal
      ? adapter.createSession(request, { abortSignal })
      : adapter.createSession(request),
    abortSignal,
  )
}
