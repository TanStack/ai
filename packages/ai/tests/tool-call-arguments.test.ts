import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import type { ToolCallEndEvent } from '../src/types'
import { tanstackMetadata } from '../src/utilities/merge-metadata'
import {
  finishToolCallArguments,
  reconcileToolCallArguments,
} from '../src/utilities/tool-call-arguments'
import { collectChunks, createMockAdapter, ev } from './test-utils'

describe('lexical tool argument reconciliation', () => {
  it.each([
    '  1e999  ',
    '-0',
    '9007199254740993',
    '1.20e+3',
    '"\\u0061"',
    '{"a":1e999,"b":[-0,9007199254740993,"\\u0061"]}',
  ])('keeps unchanged raw JSON exactly: %s', (raw) => {
    expect(reconcileToolCallArguments(raw, JSON.parse(raw))).toBe(raw)
  })
  it('reuses unchanged nested values after removing an optional null', () => {
    const raw =
      '{"removed":null,"nested":{"number":1e999,"text":"\\u0061"},"array":[-0,9007199254740993]}'
    expect(
      reconcileToolCallArguments(raw, {
        nested: { number: Infinity, text: 'a' },
        array: [-0, 9007199254740992],
      }),
    ).toBe(
      '{"nested":{"number":1e999,"text":"\\u0061"},"array":[-0,9007199254740993]}',
    )
  })
  it('retains unchanged array positions while correcting another position', () => {
    expect(reconcileToolCallArguments('[1e999,2,-0]', [Infinity, 3, -0])).toBe(
      '[1e999,3,-0]',
    )
  })
  it('uses valid JSON spelling for corrected numbers', () => {
    expect(
      reconcileToolCallArguments('{}', {
        positive: Infinity,
        negative: -Infinity,
        zero: -0,
      }),
    ).toBe('{"positive":1e999,"negative":-1e999,"zero":-0}')
  })
  it('does not repair malformed raw JSON with a parsed projection', () => {
    expect(reconcileToolCallArguments('{"broken":', {})).toBe('{"broken":')
  })
  it('serializes END-only input when no raw arguments exist', () => {
    expect(reconcileToolCallArguments(undefined, null)).toBe('null')
    expect(reconcileToolCallArguments(undefined, [1, true])).toBe('[1,true]')
  })
  it('leaves raw arguments alone when input is undefined', () => {
    expect(reconcileToolCallArguments('1e999', undefined)).toBe('1e999')
  })
})

describe('raw JSON key spelling', () => {
  it('keeps an escaped key when removing an unrelated null', () => {
    expect(
      reconcileToolCallArguments('{"\\u0061":9007199254740993,"drop":null}', {
        a: 9007199254740992,
      }),
    ).toBe('{"\\u0061":9007199254740993}')
  })
  it('uses the last duplicate key value and its original spelling', () => {
    expect(
      reconcileToolCallArguments('{"a":1,"\\u0061":1e999,"drop":null}', {
        a: Infinity,
      }),
    ).toBe('{"\\u0061":1e999}')
  })
  it('serializes sparse custom array positions as null slots', () => {
    const values: Array<unknown> = new Array(2)
    values[1] = -0
    expect(reconcileToolCallArguments(undefined, values)).toBe('[null,-0]')
  })
})

describe('finishToolCallArguments', () => {
  const end = (
    fields: Partial<ToolCallEndEvent> & { args?: string },
  ): ToolCallEndEvent => ({
    type: EventType.TOOL_CALL_END,
    toolCallId: 'call-1',
    timestamp: 0,
    ...fields,
  })

  it('keeps raw args when the input is null', () => {
    expect(
      finishToolCallArguments('', end({ args: '{"q":"x"}', input: null })),
    ).toEqual({ args: '{"q":"x"}', input: { q: 'x' } })
  })

  it('keeps malformed raw args with no input', () => {
    expect(finishToolCallArguments('', end({ args: '{"q":' }))).toEqual({
      args: '{"q":',
      input: undefined,
    })
  })

  it('keeps the streamed bytes when they match the input', () => {
    expect(
      finishToolCallArguments('{"n": 1.50}', end({ input: { n: 1.5 } })),
    ).toEqual({ args: '{"n": 1.50}', input: { n: 1.5 } })
  })

  it('ignores args that are not a string', () => {
    expect(
      finishToolCallArguments(
        '{"a":1}',
        end({ metadata: { tanstack: { args: { a: 1 } } } } as never),
      ),
    ).toEqual({ args: '{"a":1}', input: { a: 1 } })
  })

  it('reads args and input from metadata.tanstack', () => {
    expect(
      finishToolCallArguments(
        '',
        end({
          metadata: {
            tanstack: { args: '{"a": 1, "b": null}', input: { a: 1 } },
          },
        }),
      ),
    ).toEqual({ args: '{"a":1}', input: { a: 1 } })
  })
})

describe('raw tool arguments through chat()', () => {
  async function run(raw: string, input?: unknown) {
    const executed: Array<unknown> = []
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call-1', 'check'),
          ev.toolArgs('call-1', raw),
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'call-1',
            timestamp: Date.now(),
            args: raw,
            ...(input !== undefined ? { input } : {}),
          },
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted('run-2'), ev.runFinished('stop', 'run-2')],
      ],
    })
    const chunks = await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'check' }],
        tools: [
          {
            name: 'check',
            description: 'Check',
            execute: (value: unknown) => {
              executed.push(value)
              return 'ok'
            },
          },
        ],
      }),
    )
    return { chunks, calls, executed }
  }

  function replayedArguments(
    calls: ReturnType<typeof createMockAdapter>['calls'],
  ) {
    return calls[1]?.messages
      .flatMap((message) => message.toolCalls ?? [])
      .map((call) => call.function.arguments)
  }

  it('replays the exact provider bytes', async () => {
    const raw = '{"count": 1.50, "id": 9007199254740993}'
    const { calls, executed } = await run(raw, JSON.parse(raw))
    expect(replayedArguments(calls)).toEqual([raw])
    expect(executed).toEqual([{ count: 1.5, id: 9007199254740992 }])
  })

  it('sends the raw arguments to the client in TOOL_CALL_END metadata', async () => {
    const raw = '{"count": 1.50}'
    const { chunks } = await run(raw, JSON.parse(raw))
    const end = chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_END)
    const metadata = end ? tanstackMetadata(end) : undefined
    expect(metadata && 'args' in metadata ? metadata.args : undefined).toBe(raw)
    // `input` is not sent twice; in process it is parsed back from `args`.
    expect(metadata && 'input' in metadata).toBe(false)
    expect(end && 'input' in end ? end.input : undefined).toEqual({
      count: 1.5,
    })
  })

  it('keeps an in-process input that JSON spells as -0 or 1e999', async () => {
    const raw = '{"zero": -0, "big": 1e999}'
    const { chunks } = await run(raw, JSON.parse(raw))
    const end = chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_END)
    expect(end && 'input' in end ? end.input : undefined).toEqual({
      zero: -0,
      big: Infinity,
    })
  })

  it('reports malformed raw arguments instead of running with {}', async () => {
    const { calls, executed } = await run('{"count":')
    expect(executed).toEqual([])
    const toolMessage = calls[1]?.messages.find(
      (message) => message.role === 'tool',
    )
    expect(JSON.stringify(toolMessage)).toContain(
      'Failed to parse tool arguments as JSON',
    )
  })
})
