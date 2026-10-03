import { describe, expect, it, vi } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { ev } from './test-utils'
import {
  EventType,
  type MessagePart,
  type StreamChunk,
  type UIMessage,
} from '../src/types'

function attributed(chunk: StreamChunk, subagentRunId: string) {
  return { ...chunk, subagentRunId }
}

describe('StreamProcessor subagent parts', () => {
  it('nests attributed text under a type subagent part', () => {
    const processor = new StreamProcessor()
    processor.processChunk(ev.runStarted())
    processor.processChunk({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'sub-1',
      name: 'researcher',
      description: 'Looks up facts',
      timestamp: Date.now(),
    })
    processor.processChunk(attributed(ev.textStart('child-msg'), 'sub-1'))
    processor.processChunk(
      attributed(ev.textContent('Paris', 'child-msg'), 'sub-1'),
    )
    processor.processChunk(attributed(ev.textEnd('child-msg'), 'sub-1'))
    processor.processChunk({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'sub-1',
      timestamp: Date.now(),
    })
    processor.processChunk(ev.runFinished())

    const assistant = processor
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(part.subagent.id).toBe('sub-1')
    expect(part.subagent.name).toBe('researcher')
    expect(part.subagent.status).toBe('finished')
    expect(part.subagent.messages[0]?.parts).toEqual([
      { type: 'text', content: 'Paris' },
    ])
  })

  it('keeps status error when SUBAGENT_FINISHED arrives after SUBAGENT_ERROR', () => {
    const processor = new StreamProcessor()
    processor.processChunk(ev.runStarted())
    processor.processChunk({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'sub-1',
      name: 'researcher',
      timestamp: Date.now(),
    })
    processor.processChunk({
      type: EventType.SUBAGENT_ERROR,
      subagentRunId: 'sub-1',
      message: 'Stopped',
      timestamp: Date.now(),
    })
    processor.processChunk(attributed(ev.textStart('late-msg'), 'sub-1'))
    processor.processChunk(
      attributed(ev.textContent('late', 'late-msg'), 'sub-1'),
    )
    processor.processChunk({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'sub-1',
      timestamp: Date.now(),
    })

    const assistant = processor
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(part.subagent.status).toBe('error')
    expect(part.subagent.error).toEqual({ message: 'Stopped' })
    expect(part.subagent.messages).toEqual([])
  })

  it.each([
    [
      'TOOL_CALL_START',
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'child-tool',
        toolCallName: 'lookup',
      },
    ],
    [
      'TOOL_CALL_CHUNK',
      {
        type: EventType.TOOL_CALL_CHUNK,
        toolCallId: 'child-tool',
        toolCallName: 'lookup',
        delta: '{}',
      },
    ],
  ])(
    'routes an untagged result to the child that started the call with %s',
    (_, start) => {
      const processor = new StreamProcessor()
      processor.processChunk(ev.runStarted())
      processor.processChunk({
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 'sub-1',
        name: 'researcher',
        timestamp: Date.now(),
      })
      processor.processChunk(
        attributed({ ...start, timestamp: Date.now() } as StreamChunk, 'sub-1'),
      )
      processor.processChunk({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'child-tool',
        messageId: 'result-1',
        content: '"found"',
        timestamp: Date.now(),
      })

      const part = processor
        .getMessages()
        .flatMap((message) => message.parts)
        .find((entry) => entry.type === 'subagent')
      if (part?.type !== 'subagent') throw new Error('expected subagent part')
      expect(
        part.subagent.messages
          .flatMap((message) => message.parts)
          .find((entry) => entry.type === 'tool-call'),
      ).toMatchObject({ id: 'child-tool', output: 'found' })
    },
  )

  describe('an untagged chunk with no id', () => {
    const started = (subagentRunId: string) =>
      ({
        type: EventType.SUBAGENT_STARTED,
        subagentRunId,
        name: subagentRunId,
        timestamp: Date.now(),
      }) as StreamChunk
    const toolChunk = (fields: Record<string, unknown>) =>
      ({
        type: EventType.TOOL_CALL_CHUNK,
        timestamp: Date.now(),
        ...fields,
      }) as StreamChunk
    const partsOf = (messages: Array<UIMessage>): Array<MessagePart> =>
      messages
        .flatMap((message) => message.parts)
        .flatMap((part) =>
          part.type === 'subagent' ? partsOf(part.subagent.messages) : [part],
        )
    const toolCallsOf = (processor: StreamProcessor) =>
      partsOf(processor.getMessages()).flatMap((part) =>
        part.type === 'tool-call' ? [part.arguments] : [],
      )
    const run = (...chunks: Array<StreamChunk>) => {
      const processor = new StreamProcessor()
      for (const c of [ev.runStarted(), ...chunks]) processor.processChunk(c)
      return toolCallsOf(processor)
    }

    it('continues the only open stream of a child', () => {
      expect(
        run(
          started('sub-1'),
          attributed(
            toolChunk({
              toolCallId: 'tc-1',
              toolCallName: 'a',
              delta: '{"q":',
            }),
            'sub-1',
          ),
          toolChunk({ delta: '1}' }),
        ),
      ).toEqual(['{"q":1}'])
    })

    it('continues the only open stream of a nested child', () => {
      expect(
        run(
          started('sub-1'),
          { ...started('sub-2'), parentSubagentRunId: 'sub-1' } as StreamChunk,
          attributed(
            toolChunk({
              toolCallId: 'tc-2',
              toolCallName: 'b',
              delta: '{"q":',
            }),
            'sub-2',
          ),
          toolChunk({ delta: '2}' }),
        ),
      ).toEqual(['{"q":2}'])
    })

    it('continues the open stream of this processor first', () => {
      expect(
        run(
          started('sub-1'),
          toolChunk({ toolCallId: 'tc-p', toolCallName: 'p', delta: '{"p":' }),
          attributed(
            toolChunk({ toolCallId: 'tc-1', toolCallName: 'a', delta: '{}' }),
            'sub-1',
          ),
          toolChunk({ delta: '1}' }),
        ),
      ).toEqual(['{}', '{"p":1}'])
    })

    it('does not guess between two open child streams', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(
        run(
          started('sub-1'),
          started('sub-2'),
          attributed(
            toolChunk({ toolCallId: 'tc-1', toolCallName: 'a', delta: '{' }),
            'sub-1',
          ),
          attributed(
            toolChunk({ toolCallId: 'tc-2', toolCallName: 'b', delta: '{' }),
            'sub-2',
          ),
          toolChunk({ delta: '}' }),
        ),
      ).toEqual(['{', '{'])
      expect(warn).toHaveBeenCalledOnce()
      warn.mockRestore()
    })
  })
})
