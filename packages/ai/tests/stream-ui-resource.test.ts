/**
 * Tests for the ui-resource CUSTOM event → UIResourcePart reconciliation
 * inside StreamProcessor.handleCustomEvent.
 */
import { describe, expect, it, vi } from 'vitest'
import { EventType } from '../src/types'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { runProcessorWithChunks } from './helpers/processor-harness'
import type { StreamChunk, UIResourcePart } from '../src/types'

describe('StreamProcessor — ui-resource CUSTOM event', () => {
  it('reconciles a ui-resource CUSTOM event into a UIResourcePart on the assistant message', async () => {
    const chunk: StreamChunk = {
      type: EventType.CUSTOM,
      timestamp: Date.now(),
      name: 'ui-resource',
      value: {
        resource: { uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' },
        serverId: 'weather',
        toolCallId: 'call_1',
        toolName: 'show_widget',
      },
    } as Extract<StreamChunk, { type: 'CUSTOM' }>

    const msg = await runProcessorWithChunks([chunk])

    const part = msg.parts.find(
      (p): p is UIResourcePart => p.type === 'ui-resource',
    )
    expect(part).toBeDefined()
    expect(part).toMatchObject({
      type: 'ui-resource',
      toolCallId: 'call_1',
      toolName: 'show_widget',
      serverId: 'weather',
      resource: { uri: 'ui://s/w', mimeType: 'text/html', text: '<b>x</b>' },
    })
  })

  it('ui-resource event without serverId still produces a UIResourcePart', async () => {
    const chunk: StreamChunk = {
      type: EventType.CUSTOM,
      timestamp: Date.now(),
      name: 'ui-resource',
      value: {
        resource: { uri: 'ui://tool/output', mimeType: 'text/html' },
        toolCallId: 'call_2',
        toolName: 'tool_output',
      },
    } as Extract<StreamChunk, { type: 'CUSTOM' }>

    const msg = await runProcessorWithChunks([chunk])

    const part = msg.parts.find(
      (p): p is UIResourcePart => p.type === 'ui-resource',
    )
    expect(part).toBeDefined()
    expect(part).toMatchObject({
      type: 'ui-resource',
      toolCallId: 'call_2',
      toolName: 'tool_output',
      resource: { uri: 'ui://tool/output', mimeType: 'text/html' },
    })
    expect(part?.serverId).toBeUndefined()
  })

  it('ui-resource event with meta forwards meta to the part', async () => {
    const chunk: StreamChunk = {
      type: EventType.CUSTOM,
      timestamp: Date.now(),
      name: 'ui-resource',
      value: {
        resource: { uri: 'ui://s/w', mimeType: 'text/html' },
        toolCallId: 'call_3',
        toolName: 'show_widget',
        meta: { width: 400, height: 300 },
      },
    } as Extract<StreamChunk, { type: 'CUSTOM' }>

    const msg = await runProcessorWithChunks([chunk])

    const part = msg.parts.find(
      (p): p is UIResourcePart => p.type === 'ui-resource',
    )
    expect(part?.meta).toEqual({ width: 400, height: 300 })
  })

  it('does NOT fall through to the generic onCustomEvent callback for ui-resource', () => {
    const onCustomEvent = vi.fn()
    const processor = new StreamProcessor({ events: { onCustomEvent } })

    // Establish an active assistant message FIRST so the ui-resource branch
    // actually executes its reconcile path (resolves a target message and
    // appends a UIResourcePart) rather than returning early — otherwise this
    // test would pass vacuously.
    processor.processChunk({
      type: EventType.RUN_STARTED,
      timestamp: Date.now(),
      runId: 'run-1',
      threadId: 'thread-1',
    } as Extract<StreamChunk, { type: 'RUN_STARTED' }>)
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      timestamp: Date.now(),
      messageId: 'msg-1',
      role: 'assistant',
    } as Extract<StreamChunk, { type: 'TEXT_MESSAGE_START' }>)

    processor.processChunk({
      type: EventType.CUSTOM,
      timestamp: Date.now(),
      name: 'ui-resource',
      value: {
        resource: { uri: 'ui://s/w', mimeType: 'text/html' },
        toolCallId: 'call_4',
        toolName: 'show_widget',
      },
    } as Extract<StreamChunk, { type: 'CUSTOM' }>)

    // The branch ran: the widget was attached to the active assistant message.
    const part = processor
      .getMessages()
      .find((m) => m.id === 'msg-1')
      ?.parts.find((p): p is UIResourcePart => p.type === 'ui-resource')
    expect(part).toBeDefined()
    expect(part).toMatchObject({ toolCallId: 'call_4', toolName: 'show_widget' })

    // ...and it did NOT fall through to the generic onCustomEvent callback.
    expect(onCustomEvent).not.toHaveBeenCalled()
  })
})
