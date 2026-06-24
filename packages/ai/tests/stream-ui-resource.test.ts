/**
 * Tests for the ui-resource CUSTOM event → UIResourcePart reconciliation
 * inside StreamProcessor.handleCustomEvent.
 */
import { describe, expect, it, vi } from 'vitest'
import { EventType } from '../src/types'
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
        meta: { width: 400, height: 300 },
      },
    } as Extract<StreamChunk, { type: 'CUSTOM' }>

    const msg = await runProcessorWithChunks([chunk])

    const part = msg.parts.find(
      (p): p is UIResourcePart => p.type === 'ui-resource',
    )
    expect(part?.meta).toEqual({ width: 400, height: 300 })
  })

  it('does NOT fall through to the generic onCustomEvent callback for ui-resource', async () => {
    const { StreamProcessor } = await import(
      '../src/activities/chat/stream/processor'
    )
    const onCustomEvent = vi.fn()
    const processor = new StreamProcessor({ events: { onCustomEvent } })

    processor.processChunk({
      type: EventType.CUSTOM,
      timestamp: Date.now(),
      name: 'ui-resource',
      value: {
        resource: { uri: 'ui://s/w', mimeType: 'text/html' },
        toolCallId: 'call_4',
      },
    } as Extract<StreamChunk, { type: 'CUSTOM' }>)

    expect(onCustomEvent).not.toHaveBeenCalled()
  })
})
