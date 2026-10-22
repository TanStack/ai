import { describe, expect, it } from 'vitest'
import {
  MCP_EVENTS_EXTENSION,
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

  it('is false for non-SEP shapes', () => {
    expect(serverSupportsEvents({ experimental: { events: {} } })).toBe(false)
    expect(serverSupportsEvents({ events: {} })).toBe(false)
  })

  it('is false for undefined', () => {
    expect(serverSupportsEvents(undefined)).toBe(false)
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
})
