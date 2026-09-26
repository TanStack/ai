import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, harnessText } from '../src'
import { messageTexts, mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

describe('harnessText', () => {
  it('runs a harness as the model of chat() and keeps its own transcript', async () => {
    const inner = mockAdapter([
      () => text('inner answer'),
      () => text('second answer'),
    ])
    const studio = defineHarness({ name: 'test/inner', adapter: inner.adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })

    const collect = async (content: string) => {
      const chunks: Array<StreamChunk> = []
      for await (const chunk of chat({
        adapter: harnessText(studio, { host }),
        messages: [{ role: 'user', content }],
        threadId: 'outer-1',
      })) {
        chunks.push(chunk)
      }
      return chunks
    }

    const first = await collect('hello')
    const deltas = first
      .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((chunk) =>
        chunk.type === EventType.TEXT_MESSAGE_CONTENT ? chunk.delta : '',
      )
    expect(deltas.join('')).toBe('inner answer')
    expect(first.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )

    await collect('and then?')
    // The inner session saw the first turn as history.
    expect(messageTexts(inner.calls[1])).toEqual([
      'hello',
      'inner answer',
      'and then?',
    ])
    await host.close()
  })
})
