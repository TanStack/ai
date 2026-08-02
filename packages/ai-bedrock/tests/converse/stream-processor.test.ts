import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { processConverseStream } from '../../src/converse/stream-processor'
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime'

// Test fixtures use the minimal field subset the processor reads. Cast at the
// generator boundary to the SDK union type — the SDK marks every field as
// `T | undefined` and requires sibling fields (e.g. `metrics` on metadata) the
// processor never touches, so supplying full Smithy shapes would only add noise.
type ConverseStreamFixture = {
  [K in keyof ConverseStreamOutput]?: unknown
}

async function* gen(...e: Array<ConverseStreamFixture>) {
  for (const x of e) yield x as ConverseStreamOutput
}

describe('processConverseStream', () => {
  it('emits the text lifecycle and finishes', async () => {
    const types: Array<string> = []
    for await (const c of processConverseStream(
      gen(
        { messageStart: { role: 'assistant' } },
        { contentBlockDelta: { delta: { text: 'Hel' }, contentBlockIndex: 0 } },
        { contentBlockDelta: { delta: { text: 'lo' }, contentBlockIndex: 0 } },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { messageStop: { stopReason: 'end_turn' } },
        {
          metadata: {
            usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
          },
        },
      ),
      () => 'msg-1',
    )) {
      types.push(c.type)
    }
    expect(types).toContain(EventType.RUN_STARTED)
    expect(types).toContain(EventType.TEXT_MESSAGE_START)
    expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT)
    expect(types).toContain(EventType.TEXT_MESSAGE_END)
    expect(types).toContain(EventType.RUN_FINISHED)
  })

  it('accumulates text content across deltas', async () => {
    const contents: Array<string> = []
    for await (const c of processConverseStream(
      gen(
        { messageStart: { role: 'assistant' } },
        { contentBlockDelta: { delta: { text: 'Hel' }, contentBlockIndex: 0 } },
        { contentBlockDelta: { delta: { text: 'lo' }, contentBlockIndex: 0 } },
        { messageStop: { stopReason: 'end_turn' } },
      ),
      () => 'msg-1',
    )) {
      if (c.type === EventType.TEXT_MESSAGE_CONTENT)
        contents.push((c as { delta: string }).delta)
    }
    expect(contents).toEqual(['Hel', 'lo'])
  })

  it('emits TOOL_CALL_* for a toolUse block with streamed args', async () => {
    const types: Array<string> = []
    const argDeltas: Array<string> = []
    for await (const c of processConverseStream(
      gen(
        { messageStart: { role: 'assistant' } },
        {
          contentBlockStart: {
            start: { toolUse: { toolUseId: 't1', name: 'getX' } },
            contentBlockIndex: 0,
          },
        },
        {
          contentBlockDelta: {
            delta: { toolUse: { input: '{"a":' } },
            contentBlockIndex: 0,
          },
        },
        {
          contentBlockDelta: {
            delta: { toolUse: { input: '1}' } },
            contentBlockIndex: 0,
          },
        },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { messageStop: { stopReason: 'tool_use' } },
      ),
      () => 'msg-2',
    )) {
      types.push(c.type)
      if (c.type === EventType.TOOL_CALL_ARGS)
        argDeltas.push((c as { delta: string }).delta)
    }
    expect(types).toContain(EventType.TOOL_CALL_START)
    expect(types).toContain(EventType.TOOL_CALL_ARGS)
    expect(types).toContain(EventType.TOOL_CALL_END)
    expect(argDeltas.join('')).toBe('{"a":1}')
  })

  it('emits reasoning content', async () => {
    const types: Array<string> = []
    for await (const c of processConverseStream(
      gen(
        { messageStart: { role: 'assistant' } },
        {
          contentBlockDelta: {
            delta: { reasoningContent: { text: 'thinking' } },
            contentBlockIndex: 0,
          },
        },
        { messageStop: { stopReason: 'end_turn' } },
      ),
      () => 'msg-3',
    )) {
      types.push(c.type)
    }
    expect(types).toContain(EventType.REASONING_MESSAGE_CONTENT)
  })

  // Unique-id factory so RUN_STARTED/TEXT_MESSAGE/etc. carry distinct ids and
  // payload assertions aren't ambiguous.
  function counter() {
    let n = 0
    return () => `id-${n++}`
  }

  async function collect(
    ...events: Array<ConverseStreamFixture>
  ): Promise<Array<StreamChunk>> {
    const out: Array<StreamChunk> = []
    for await (const c of processConverseStream(gen(...events), counter())) {
      out.push(c)
    }
    return out
  }

  it('folds usage and maps each stopReason into the terminal RUN_FINISHED', async () => {
    const cases: Array<[string, string]> = [
      ['tool_use', 'tool_calls'],
      ['max_tokens', 'length'],
      ['content_filtered', 'content_filter'],
      ['end_turn', 'stop'],
      ['some_unknown_reason', 'stop'],
    ]
    for (const [stopReason, expected] of cases) {
      const events = await collect(
        { contentBlockDelta: { delta: { text: 'hi' }, contentBlockIndex: 0 } },
        { messageStop: { stopReason } },
        {
          metadata: {
            usage: { inputTokens: 7, outputTokens: 11, totalTokens: 18 },
          },
        },
      )
      const finished = events.filter((e) => e.type === EventType.RUN_FINISHED)
      expect(finished).toHaveLength(1)
      const evt = finished[0] as {
        finishReason: string
        usage?: {
          promptTokens: number
          completionTokens: number
          totalTokens: number
        }
      }
      expect(evt.finishReason).toBe(expected)
      // Usage arrives in the trailing metadata event (after messageStop) yet is
      // folded into the single terminal RUN_FINISHED.
      expect(evt.usage).toEqual({
        promptTokens: 7,
        completionTokens: 11,
        totalTokens: 18,
      })
    }
  })

  it('drains a tool call that never received contentBlockStop (truncated stream)', async () => {
    const events = await collect(
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: 't9', name: 'getX' } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"a":1}' } },
          contentBlockIndex: 0,
        },
      },
      // No contentBlockStop, no messageStop — stream just ends.
    )
    const ends = events.filter((e) => e.type === EventType.TOOL_CALL_END)
    expect(ends).toHaveLength(1)
    expect((ends[0] as { toolCallId: string }).toolCallId).toBe('t9')
    // The terminal RUN_FINISHED is still emitted after the drain.
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })

  it('closes reasoning before opening the text message (ordering)', async () => {
    const events = await collect(
      {
        contentBlockDelta: {
          delta: { reasoningContent: { text: 'think' } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: { delta: { text: 'answer' }, contentBlockIndex: 1 },
      },
      { messageStop: { stopReason: 'end_turn' } },
    )
    const order = events.map((e) => e.type)
    const reasoningEnd = order.indexOf(EventType.REASONING_MESSAGE_END)
    const textStart = order.indexOf(EventType.TEXT_MESSAGE_START)
    expect(reasoningEnd).toBeGreaterThanOrEqual(0)
    expect(textStart).toBeGreaterThanOrEqual(0)
    expect(reasoningEnd).toBeLessThan(textStart)
  })

  it('threads incoming threadId/parentRunId/model onto the lifecycle', async () => {
    const out: Array<StreamChunk> = []
    for await (const c of processConverseStream(
      gen(
        { contentBlockDelta: { delta: { text: 'hi' }, contentBlockIndex: 0 } },
        { messageStop: { stopReason: 'end_turn' } },
      ),
      counter(),
      { threadId: 'thread-x', parentRunId: 'parent-y', model: 'model-z' },
    )) {
      out.push(c)
    }
    const started = out.find((e) => e.type === EventType.RUN_STARTED) as {
      threadId: string
      parentRunId?: string
      model?: string
    }
    expect(started.threadId).toBe('thread-x')
    expect(started.parentRunId).toBe('parent-y')
    expect(started.model).toBe('model-z')
    const finished = out.find((e) => e.type === EventType.RUN_FINISHED) as {
      threadId: string
    }
    expect(finished.threadId).toBe('thread-x')
  })

  it('throws on an in-band Converse error event instead of ending cleanly', async () => {
    const drain = async () => {
      for await (const _ of processConverseStream(
        gen(
          {
            contentBlockDelta: {
              delta: { text: 'partial' },
              contentBlockIndex: 0,
            },
          },
          { throttlingException: new Error('rate limited') },
        ),
        counter(),
      )) {
        // consume
      }
    }
    await expect(drain()).rejects.toThrow(/rate limited/)
  })

  it('keeps two concurrent tool-use blocks distinct by contentBlockIndex', async () => {
    const events = await collect(
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: 'a', name: 'toolA' } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: 'b', name: 'toolB' } },
          contentBlockIndex: 1,
        },
      },
      // Interleaved arg fragments for both blocks.
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"x":' } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"y":' } },
          contentBlockIndex: 1,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '1}' } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '2}' } },
          contentBlockIndex: 1,
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { messageStop: { stopReason: 'tool_use' } },
    )
    const starts = events.filter(
      (e) => e.type === EventType.TOOL_CALL_START,
    ) as Array<{ toolCallName: string }>
    expect(starts.map((s) => s.toolCallName)).toEqual(['toolA', 'toolB'])
    const argsById: Record<string, string> = {}
    for (const e of events) {
      if (e.type === EventType.TOOL_CALL_ARGS) {
        const a = e as { toolCallId: string; delta: string }
        argsById[a.toolCallId] = (argsById[a.toolCallId] ?? '') + a.delta
      }
    }
    // No cross-talk: each block's fragments accumulate against its own id.
    expect(argsById['a']).toBe('{"x":1}')
    expect(argsById['b']).toBe('{"y":2}')
    expect(
      events.filter((e) => e.type === EventType.TOOL_CALL_END),
    ).toHaveLength(2)
  })
})
