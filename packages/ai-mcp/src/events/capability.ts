import type {
  ClientCapabilities,
  Transport,
} from '@modelcontextprotocol/client'
import { isRecord } from './value'

/**
 * MCP Events extension id from SEP-3415.
 *
 * @experimental
 */
export const MCP_EVENTS_EXTENSION = 'io.modelcontextprotocol/events'

/**
 * SEP-3415 draft revision this package implements
 * (`modelcontextprotocol/modelcontextprotocol@2ec39b9`).
 *
 * @experimental
 */
export const SEP_REVISION = '2ec39b9'

/**
 * True when the server advertised Events support.
 *
 * Order: SEP `extensions["io.modelcontextprotocol/events"]`, then
 * `experimental.events`, then top-level `events` (OpenAI ChatGPT / WG sketch).
 * SDK 2.1.0 `getServerCapabilities()` strips the top-level key, so callers
 * must pass the raw initialize/discover capabilities when they have them.
 *
 * @experimental
 */
export function serverSupportsEvents(
  caps: Record<string, unknown> | undefined,
): boolean {
  if (caps === undefined) return false
  const extensions = caps.extensions
  if (isRecord(extensions) && MCP_EVENTS_EXTENSION in extensions) return true
  const experimental = caps.experimental
  if (isRecord(experimental) && 'events' in experimental) return true
  return isRecord(caps.events)
}

/**
 * Copy `events` from the raw handshake when the parsed SDK capabilities
 * dropped it (`ServerCapabilitiesSchema` strips unknown keys).
 */
export function mergeHandshakeCapabilities(
  parsed: Record<string, unknown>,
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (raw === undefined || 'events' in parsed || !('events' in raw)) {
    return parsed
  }
  return { ...parsed, events: raw.events }
}

/**
 * Capture `result.capabilities` from initialize / server/discover before the
 * SDK parses them with `ServerCapabilitiesSchema`.
 *
 * ProbeWindow and Protocol both assign `transport.onmessage`. The getter
 * always returns a stable wrapper so both paths are visible.
 */
export function attachHandshakeCapture(
  transport: Transport,
): () => Record<string, unknown> | undefined {
  const pending = new Set<string | number>()
  let captured: Record<string, unknown> | undefined
  let userHandler: Transport['onmessage']
  let attached = true

  const wrapped = (message: unknown, extra?: unknown) => {
    captureHandshake(message, pending, (caps) => {
      captured = caps
    })
    userHandler?.(message as never, extra as never)
  }

  const send = transport.send.bind(transport)
  transport.send = (message, options) => {
    rememberHandshakeId(message, pending)
    return send(message, options)
  }

  Object.defineProperty(transport, 'onmessage', {
    configurable: true,
    enumerable: true,
    get() {
      return userHandler === undefined ? undefined : wrapped
    },
    set(handler: Transport['onmessage']) {
      userHandler = handler === wrapped ? userHandler : handler
    },
  })

  return () => {
    if (attached) {
      attached = false
      transport.send = send
      Object.defineProperty(transport, 'onmessage', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: userHandler,
      })
    }
    return captured
  }
}

function rememberHandshakeId(message: unknown, pending: Set<string | number>) {
  if (!isRecord(message)) return
  if (message.method !== 'initialize' && message.method !== 'server/discover') {
    return
  }
  const id = message.id
  if (typeof id === 'string' || typeof id === 'number') pending.add(id)
}

function captureHandshake(
  message: unknown,
  pending: Set<string | number>,
  sink: (caps: Record<string, unknown>) => void,
) {
  if (!isRecord(message)) return
  const id = message.id
  if (typeof id !== 'string' && typeof id !== 'number') return
  if (!pending.has(id)) return
  pending.delete(id)
  if (!isRecord(message.result)) return
  const caps = message.result.capabilities
  if (isRecord(caps)) sink(caps)
}

/**
 * Merge the Events client capability into `capabilities.extensions`.
 *
 * @experimental
 */
export function withEventsClientCapability(
  caps?: ClientCapabilities,
): ClientCapabilities {
  return {
    ...caps,
    extensions: {
      ...caps?.extensions,
      [MCP_EVENTS_EXTENSION]: {},
    },
  }
}
