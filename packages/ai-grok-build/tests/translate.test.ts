import { describe, expect, it } from 'vitest'
import { translateThreadEvents } from '../src/stream/translate'
import type { GrokBuildStreamEvent } from '../src/stream/sdk-types'
import type { StreamChunk } from '@tanstack/ai'

async function collect(
  events: Array<GrokBuildStreamEvent>,
): Promise<Array<StreamChunk>> {
  async function* source() {
    for (const event of events) yield event
  }
  const out: Array<StreamChunk> = []
  for await (const chunk of translateThreadEvents(source(), {
    model: 'grok-build',
    runId: 'run-1',
    threadId: 'thread-1',
    genId: () => 'gen-id',
  })) {
    out.push(chunk)
  }
  return out
}

describe('translateThreadEvents (native grok streaming-json)', () => {
  it('streams thought, text, and end into AG-UI chunks', async () => {
    const chunks = await collect([
      { type: 'thought', data: 'Thinking' },
      { type: 'text', data: 'Hello' },
      { type: 'text', data: ' world' },
      {
        type: 'end',
        stopReason: 'EndTurn',
        sessionId: 'sess-abc',
        requestId: 'req-1',
      },
    ])

    const reasoning = chunks
      .filter((c) => c.type === 'REASONING_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(reasoning).toBe('Thinking')

    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(text).toBe('Hello world')

    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    expect(
      chunks.some(
        (c) =>
          c.type === 'CUSTOM' &&
          (c as { name?: string }).name === 'grok-build.session-id',
      ),
    ).toBe(true)
  })

  it('surfaces native error events as RUN_ERROR', async () => {
    const chunks = await collect([{ type: 'error', message: 'bad model' }])
    expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(true)
    const err = chunks.find((c) => c.type === 'RUN_ERROR') as {
      message?: string
    }
    expect(err.message).toBe('bad model')
  })
})
