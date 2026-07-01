import { describe, expect, it } from 'vitest'
import {
  createAIDevtoolsEventEnvelope,
  getAIDevtoolsDedupeKey,
  getAIDevtoolsRuntimeId,
} from '../src/envelope'

describe('AI devtools event envelope', () => {
  it('creates a provenance-aware envelope with encoded identity parts', () => {
    const event = createAIDevtoolsEventEnvelope({
      eventType: 'hook:registered',
      source: 'client',
      visibility: 'client-state',
      clientId: 'client-1',
      requestId: 'request-1',
      streamId: 'stream-1',
      hookId: 'hook-1',
      threadId: 'thread-1',
      runId: 'run-1',
      messageId: 'msg-1',
      toolCallId: 'tool-1',
      sequence: 2,
      correlationId: 'correlation-1',
      relatedEventId: 'event-parent',
      timestamp: 1234,
    })

    expect(event).toMatchObject({
      eventType: 'hook:registered',
      source: 'client',
      visibility: 'client-state',
      clientId: 'client-1',
      requestId: 'request-1',
      streamId: 'stream-1',
      hookId: 'hook-1',
      threadId: 'thread-1',
      runId: 'run-1',
      messageId: 'msg-1',
      toolCallId: 'tool-1',
      sequence: 2,
      correlationId: 'correlation-1',
      relatedEventId: 'event-parent',
      timestamp: 1234,
    })
    expect(event.eventId).toContain('client:hook:registered')
    expect(event.eventId).toContain('value-client-1')
    expect(event.eventId).toContain('value-hook-1')
    expect(event.eventId).toContain('value-thread-1')
    expect(event.eventId).toContain('value-run-1')
    expect(event.eventId).toContain(
      `value-${encodeURIComponent(getAIDevtoolsRuntimeId())}`,
    )
    expect(event.runtimeId).toBe(getAIDevtoolsRuntimeId())
  })

  it('does not overwrite an explicit event id', () => {
    const event = createAIDevtoolsEventEnvelope({
      eventId: 'event-explicit',
      eventType: 'run:started',
      source: 'server',
      visibility: 'server-internal',
      timestamp: 1,
    })

    expect(event.eventId).toBe('event-explicit')
  })

  it('generates an event id when explicit event id is empty', () => {
    const event = createAIDevtoolsEventEnvelope({
      eventId: '',
      eventType: 'run:started',
      source: 'server',
      visibility: 'server-internal',
      timestamp: 1,
    })

    expect(event.eventId).not.toBe('')
    expect(event.eventId).toContain('server:run:started')
  })

  it('uses eventId as the primary dedupe key', () => {
    const key = getAIDevtoolsDedupeKey({
      eventId: 'event-1',
      eventType: 'hook:registered',
      source: 'client',
      visibility: 'client-state',
      timestamp: 1,
    })

    expect(key).toBe('event:event-1')
  })

  it('falls back to a composite dedupe key when eventId is missing', () => {
    const key = getAIDevtoolsDedupeKey({
      eventType: 'tools:call:completed',
      source: 'client',
      visibility: 'user-visible',
      clientId: 'client-1',
      requestId: 'request-1',
      streamId: 'stream-1',
      hookId: 'hook-1',
      threadId: 'thread-1',
      runId: 'run-1',
      messageId: 'msg-1',
      toolCallId: 'tool-1',
      sequence: 2,
      timestamp: 12345,
    })

    expect(key).toBe(
      'fallback:client:tools:call:completed:user-visible:value-client-1:value-request-1:value-stream-1:value-hook-1:value-thread-1:value-run-1:value-msg-1:value-tool-1:value-2:12000',
    )
  })

  it('encodes separators and URL-sensitive characters in generated ids', () => {
    const event = createAIDevtoolsEventEnvelope({
      eventType: 'hook:registered',
      source: 'client',
      visibility: 'client-state',
      hookId: 'hook:with/slash and space',
      timestamp: 1,
    })

    expect(event.eventId).toContain('value-hook%3Awith%2Fslash%20and%20space')
  })
})
