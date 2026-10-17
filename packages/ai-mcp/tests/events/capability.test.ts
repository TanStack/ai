import { describe, expect, it } from 'vitest'
import type { Transport } from '@modelcontextprotocol/client'
import {
  MCP_EVENTS_EXTENSION,
  SEP_REVISION,
  attachHandshakeCapture,
  mergeHandshakeCapabilities,
  serverSupportsEvents,
  withEventsClientCapability,
} from '../../src/events/capability'

describe('serverSupportsEvents', () => {
  it('is true for the SEP extensions key', () => {
    expect(
      serverSupportsEvents({
        extensions: { [MCP_EVENTS_EXTENSION]: {} },
      }),
    ).toBe(true)
  })

  it('is true for experimental.events as a fallback', () => {
    expect(serverSupportsEvents({ experimental: { events: {} } })).toBe(true)
  })

  it('is true for a top-level events capability', () => {
    // OpenAI ChatGPT and the WG sketch advertise `capabilities.events`.
    // SDK 2.1.0 strips that key from getServerCapabilities(); this helper
    // still accepts it when the caller passes the raw handshake body.
    expect(serverSupportsEvents({ events: {} })).toBe(true)
  })

  it('is false for undefined', () => {
    expect(serverSupportsEvents(undefined)).toBe(false)
  })
})

describe('mergeHandshakeCapabilities', () => {
  it('copies events from the raw handshake when the parsed caps dropped it', () => {
    expect(
      mergeHandshakeCapabilities({ tools: {} }, { tools: {}, events: {} }),
    ).toEqual({ tools: {}, events: {} })
  })

  it('does not overwrite parsed events', () => {
    expect(
      mergeHandshakeCapabilities({ events: { keep: true } }, { events: {} }),
    ).toEqual({ events: { keep: true } })
  })
})

describe('attachHandshakeCapture', () => {
  it('reads capabilities from a raw initialize result', async () => {
    let delivered: unknown
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message) => {
        const id =
          typeof message === 'object' && message !== null && 'id' in message
            ? message.id
            : undefined
        transport.onmessage?.({
          jsonrpc: '2.0',
          id,
          result: { capabilities: { events: {} } },
        } as never)
      },
    }
    const raw = attachHandshakeCapture(transport)
    transport.onmessage = (message) => {
      delivered = message
    }
    await transport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    } as never)
    expect(raw()).toEqual({ events: {} })
    expect(delivered).toMatchObject({
      result: { capabilities: { events: {} } },
    })
  })

  it('detaches so a later onmessage wrapper does not recurse', () => {
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async () => {},
    }
    const take = attachHandshakeCapture(transport)
    let fromProtocol = 0
    transport.onmessage = () => {
      fromProtocol += 1
    }
    take()
    const previous = transport.onmessage
    let fromTap = 0
    transport.onmessage = (message, extra) => {
      fromTap += 1
      previous?.(message, extra)
    }
    transport.onmessage?.({
      jsonrpc: '2.0',
      method: 'notifications/x',
    } as never)
    expect(fromTap).toBe(1)
    expect(fromProtocol).toBe(1)
  })
})

describe('withEventsClientCapability', () => {
  it('keeps existing extensions', () => {
    const caps = withEventsClientCapability({ extensions: { x: {} } })
    expect(caps.extensions).toEqual({
      x: {},
      [MCP_EVENTS_EXTENSION]: {},
    })
  })

  it('pins SEP_REVISION', () => {
    expect(SEP_REVISION).toBe('2ec39b9')
  })
})
