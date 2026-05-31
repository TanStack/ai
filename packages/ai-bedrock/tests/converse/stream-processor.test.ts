import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
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
})
