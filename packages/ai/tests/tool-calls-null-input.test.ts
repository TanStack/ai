import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'
import { chat } from '../src/activities/chat/index'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { uiMessageToModelMessages } from '../src/activities/chat/messages'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import { describe, expect, it } from 'vitest'
import {
  ToolCallManager,
  executeToolCalls,
} from '../src/activities/chat/tools/tool-calls'
import { EventType } from '../src/types'
import type { JSONSchema, RunFinishedEvent, Tool, ToolCall } from '../src/types'

/**
 * Drain an async generator and return its final return value.
 */
async function drainGenerator<TChunk, TResult>(
  gen: AsyncGenerator<TChunk, TResult, void>,
): Promise<TResult> {
  while (true) {
    const next = await gen.next()
    if (next.done) return next.value
  }
}

async function runManager(input: unknown, inputSchema: JSONSchema) {
  let executions = 0
  const tool: Tool = {
    name: 'test_tool',
    description: 'Check manager input',
    inputSchema,
    execute: (value) => {
      executions++
      return value
    },
  }
  const manager = new ToolCallManager([tool])
  manager.addToolCallStartEvent({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tc-1',
    toolCallName: 'test_tool',
    timestamp: 0,
  })
  manager.completeToolCall({
    type: EventType.TOOL_CALL_END,
    toolCallId: 'tc-1',
    input,
    timestamp: 0,
  })
  const finished: RunFinishedEvent = {
    type: EventType.RUN_FINISHED,
    runId: 'run-1',
    threadId: 'thread-1',
    model: 'gpt-5.5',
    finishReason: 'tool_calls',
    timestamp: 0,
  }
  const result = await drainGenerator(manager.executeTools(finished))
  return {
    result,
    executions,
    arguments: manager.getToolCalls()[0]?.function.arguments,
  }
}

describe('ToolCallManager schema input checks', () => {
  it('keeps and validates primitive event input', async () => {
    const result = await runManager('2', { type: 'integer' })
    expect(result.arguments).toBe('"2"')
    expect(result.result[0]?.content).toBe('2')
    expect(result.executions).toBe(1)
  })

  it('rejects wrong primitive input without executing', async () => {
    const result = await runManager(2, { type: 'object', properties: {} })
    expect(result.arguments).toBe('2')
    expect(result.result[0]?.content).toEqual(
      expect.stringContaining('Input validation failed'),
    )
    expect(result.executions).toBe(0)
  })

  it('keeps nullable event input', async () => {
    const result = await runManager(null, { type: 'null' })
    expect(result.arguments).toBe('null')
    expect(result.result[0]?.content).toBe('null')
    expect(result.executions).toBe(1)
  })
})

async function runWithoutSchema(argumentsString: string) {
  let executions = 0
  const tool: Tool = {
    name: 'test_tool',
    description: 'Check input',
    execute: (input) => {
      executions++
      return input
    },
  }
  const call: ToolCall = {
    id: 'tc-1',
    type: 'function',
    function: { name: 'test_tool', arguments: argumentsString },
  }
  const result = await drainGenerator(executeToolCalls([call], [tool]))
  return { result, executions }
}

function completeManagerArguments(argumentsString: string) {
  const manager = new ToolCallManager([])
  manager.addToolCallStartEvent({
    type: EventType.TOOL_CALL_START,
    toolCallId: 'tc-1',
    toolCallName: 'test_tool',
    timestamp: 0,
  })
  manager.addToolCallArgsEvent({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'tc-1',
    delta: argumentsString,
    timestamp: 0,
  })
  manager.completeToolCall({
    type: EventType.TOOL_CALL_END,
    toolCallId: 'tc-1',
    timestamp: 0,
  })
  return manager.getToolCalls()
}

describe('schema-free tool input compatibility', () => {
  it.each(['null', '', '2', 'true', '"text"'])(
    'normalizes schema-free scalar input: %s',
    async (argumentsString) => {
      const { result, executions } = await runWithoutSchema(argumentsString)
      expect(result.results[0]?.result).toEqual({})
      expect(result.results[0]?.state).toBeUndefined()
      expect(executions).toBe(1)
    },
  )

  it('keeps valid object arguments', async () => {
    const { result, executions } = await runWithoutSchema('{"location":"NYC"}')
    expect(result.results[0]?.result).toEqual({ location: 'NYC' })
    expect(executions).toBe(1)
  })

  it('keeps valid array arguments', async () => {
    const { result, executions } = await runWithoutSchema('[1,2]')
    expect(result.results[0]?.result).toEqual([1, 2])
    expect(executions).toBe(1)
  })
})

describe('ToolCallManager.completeToolCall', () => {
  it('keeps empty arguments when the end event has no input', () => {
    const calls = completeManagerArguments('{}')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.function.arguments).toBe('{}')
  })

  it('keeps object arguments when the end event has no input', () => {
    const calls = completeManagerArguments('{"location":"NYC"}')
    expect(calls[0]?.function.arguments).toBe('{"location":"NYC"}')
  })
})

describe('portable terminal tool arguments', () => {
  it.each([
    'null',
    '2',
    '[1,2]',
    '1e999',
    '{"value":1e999}',
    '{"value":9007199254740993,"zero":-0,"text":"\\u0061"}',
  ])(
    'keeps unchanged raw tokens through engine, UI and JSON reload: %s',
    async (raw) => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('raw-call', 'check'),
            ev.toolArgs('raw-call', raw),
            {
              type: EventType.TOOL_CALL_END,
              toolCallId: 'raw-call',
              input: JSON.parse(raw),
              timestamp: 0,
            },
            ev.runFinished('tool_calls'),
          ],
        ],
      })
      let stored = ''
      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Check' }],
          tools: [{ name: 'check', description: 'Check' }],
          middleware: [
            {
              onChunk(ctx, event) {
                stored =
                  ctx.messages
                    .flatMap((message) => message.toolCalls ?? [])
                    .find((call) => call.id === 'raw-call')?.function
                    .arguments ?? stored
                return event
              },
            },
          ],
        }),
      )
      expect(stored).toBe(raw)
      const processor = new StreamProcessor()
      for (const event of chunks)
        processor.processChunk(JSON.parse(JSON.stringify(event)))
      const reloaded = JSON.parse(JSON.stringify(processor.getMessages()))
      const calls = reloaded.flatMap(
        (message: Parameters<typeof uiMessageToModelMessages>[0]) =>
          uiMessageToModelMessages(message).flatMap(
            (model) => model.toolCalls ?? [],
          ),
      )
      expect(
        calls.find((call: ToolCall) => call.id === 'raw-call')?.function
          .arguments,
      ).toBe(raw)
    },
  )

  it('rejects overflow against a nullable schema before server execution', async () => {
    let executions = 0
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('raw-call', 'check'),
          ev.toolArgs('raw-call', '1e999'),
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'raw-call',
            input: Infinity,
            timestamp: 0,
          },
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted('second'), ev.runFinished()],
      ],
    })
    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [
          {
            name: 'check',
            description: 'Check',
            inputSchema: { type: 'null' },
            execute() {
              executions++
              return 'wrong'
            },
          },
        ],
      }),
    )
    expect(executions).toBe(0)
  })
})

describe('authoritative terminal snapshots', () => {
  function finish(raw: string, input: unknown, args?: string) {
    const manager = new ToolCallManager([])
    manager.addToolCallStartEvent(ev.toolStart('snapshot', 'check'))
    manager.addToolCallArgsEvent(ev.toolArgs('snapshot', raw))
    const event: AdapterYieldChunk = {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'snapshot',
      timestamp: 0,
      input,
      ...(args === undefined ? {} : { args }),
    }
    manager.completeToolCall(event)
    return manager.getToolCalls()[0]?.function.arguments
  }
  it('accepts a valid legacy final correction after an incomplete preview', () => {
    expect(finish('{"x":', { x: 7 })).toBe('{"x":7}')
  })
  it('accepts a valid correction after a complete preview', () => {
    expect(finish('{"x":1}', { x: 2 })).toBe('{"x":2}')
  })
  it('keeps an incomplete preview when no final input exists', () => {
    expect(finish('{"x":', undefined)).toBe('{"x":')
  })
  it('replaces a partial preview with the full terminal snapshot', () => {
    expect(finish('{"value":', undefined, '{"value":1e999}')).toBe(
      '{"value":1e999}',
    )
  })
  it('keeps an explicit empty terminal snapshot', () => {
    expect(finish('{"stale":true}', undefined, '')).toBe('')
  })
  it('keeps malformed terminal data instead of replacing it with an object', () => {
    expect(finish('{}', undefined, '{"value":')).toBe('{"value":')
  })
  it('keeps unchanged lexical children after a real correction', () => {
    expect(
      finish(
        '{"optional":null,"overflow":1e999,"integer":9007199254740993,"zero":-0}',
        { overflow: Infinity, integer: 9007199254740992, zero: -0 },
      ),
    ).toBe('{"overflow":1e999,"integer":9007199254740993,"zero":-0}')
  })
  it('serializes new non-finite numeric corrections as JSON numbers', () => {
    expect(finish('{"value":1}', { value: -Infinity })).toBe('{"value":-1e999}')
  })
  it.each(['null', '2', '[1,2]', '"value"'])(
    'keeps END-only JSON input: %s',
    (raw) => {
      expect(finish('', JSON.parse(raw))).toBe(raw)
    },
  )
})

describe('terminal raw schema execution', () => {
  it.each(['', '  ', 'null', '2', '[1,2]'])(
    'rejects full terminal JSON against an optional-only object schema: %s',
    async (raw) => {
      let executions = 0
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('raw-call', 'check'),
            {
              type: EventType.TOOL_CALL_END,
              toolCallId: 'raw-call',
              args: raw,
              timestamp: 0,
            },
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted('second'), ev.runFinished()],
        ],
      })
      await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Check' }],
          tools: [
            {
              name: 'check',
              description: 'Check',
              inputSchema: {
                type: 'object',
                properties: { optional: { type: 'string' } },
              },
              execute() {
                executions++
                return 'wrong'
              },
            },
          ],
        }),
      )
      expect(executions).toBe(0)
    },
  )
  it.each(['null', '2'])(
    'dispatches a valid full terminal JSON value once: %s',
    async (raw) => {
      let executions = 0
      let received: unknown
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('raw-call', 'check'),
            {
              type: EventType.TOOL_CALL_END,
              toolCallId: 'raw-call',
              args: raw,
              timestamp: 0,
            },
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted('second'), ev.runFinished()],
        ],
      })
      await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Check' }],
          tools: [
            {
              name: 'check',
              description: 'Check',
              inputSchema: { type: raw === 'null' ? 'null' : 'number' },
              execute(input: unknown) {
                executions++
                received = input
                return 'ok'
              },
            },
          ],
        }),
      )
      expect(executions).toBe(1)
      expect(received).toEqual(JSON.parse(raw))
    },
  )
})

describe('authored terminal validation', () => {
  it.each([false, true])(
    'runs an authored Standard validator once: %s',
    async (transform) => {
      let validations = 0
      let executions = 0
      let received: unknown
      const inputSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'raw-test',
          jsonSchema: { input: () => ({ type: 'string' }) },
          validate(value: unknown) {
            validations++
            return typeof value === 'string'
              ? { value: transform ? value.length : value }
              : { issues: [{ message: 'Expected a string' }] }
          },
        },
      }
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('raw-call', 'check'),
            {
              type: EventType.TOOL_CALL_END,
              toolCallId: 'raw-call',
              args: '"text"',
              timestamp: 0,
            },
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted('second'), ev.runFinished()],
        ],
      })
      await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Check' }],
          tools: [
            {
              name: 'check',
              description: 'Check',
              inputSchema,
              execute(input: unknown) {
                executions++
                received = input
                return 'ok'
              },
            },
          ],
        }),
      )
      expect(validations).toBe(1)
      expect(executions).toBe(1)
      expect(received).toBe(transform ? 4 : 'text')
    },
  )

  it('stores an explicit object correction without losing unrelated raw numeric tokens', async () => {
    const raw =
      '{"optional":null,"overflow":1e999,"\\u0069nteger":9007199254740993,"zero":-0}'
    const expected =
      '{"overflow":1e999,"\\u0069nteger":9007199254740993,"zero":-0}'
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('raw-call', 'check'),
          ev.toolArgs('raw-call', raw),
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'raw-call',
            input: { overflow: Infinity, integer: 9007199254740992, zero: -0 },
            args: raw,
            metadata: { tanstack: { args: '{"stale":true}' } },
            timestamp: 0,
          },
          ev.runFinished('tool_calls'),
        ],
      ],
    })
    let stored = ''
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [{ name: 'check', description: 'Check' }],
        middleware: [
          {
            onChunk(ctx, event) {
              stored =
                ctx.messages
                  .flatMap((message) => message.toolCalls ?? [])
                  .find((call) => call.id === 'raw-call')?.function.arguments ??
                stored
              return event
            },
          },
        ],
      }),
    )
    expect(stored).toBe(expected)
    expect(
      chunks.find((event) => event.type === EventType.TOOL_CALL_END)?.metadata
        ?.tanstack?.args,
    ).toBe(expected)
    const processor = new StreamProcessor()
    for (const event of chunks)
      processor.processChunk(JSON.parse(JSON.stringify(event)))
    const calls = processor
      .getMessages()
      .flatMap((message) =>
        uiMessageToModelMessages(message).flatMap(
          (model) => model.toolCalls ?? [],
        ),
      )
    expect(
      calls.find((call) => call.id === 'raw-call')?.function.arguments,
    ).toBe(expected)
  })
})

describe('schema-bearing empty dispatcher input', () => {
  it.each(['', '  '])(
    'rejects empty raw input before dispatch: %j',
    async (raw) => {
      let executions = 0
      const call: ToolCall = {
        id: 'empty',
        type: 'function',
        function: { name: 'check', arguments: raw },
      }
      const result = await drainGenerator(
        executeToolCalls(
          [call],
          [
            {
              name: 'check',
              description: 'Check',
              inputSchema: { type: 'object', properties: {} },
              execute() {
                executions++
                return 'wrong'
              },
            },
          ],
        ),
      )
      expect(executions).toBe(0)
      expect(result.results[0]?.state).toBe('output-error')
    },
  )
  it('dispatches a valid explicit empty object once', async () => {
    let executions = 0
    const call: ToolCall = {
      id: 'empty',
      type: 'function',
      function: { name: 'check', arguments: '{}' },
    }
    const result = await drainGenerator(
      executeToolCalls(
        [call],
        [
          {
            name: 'check',
            description: 'Check',
            inputSchema: { type: 'object', properties: {} },
            execute(input: unknown) {
              executions++
              return input
            },
          },
        ],
      ),
    )
    expect(executions).toBe(1)
    expect(result.results[0]?.result).toEqual({})
  })
})

describe('legacy custom END serialization', () => {
  it('keeps a Date final correction as its JSON string', async () => {
    const date = new Date('2026-10-04T00:00:00.000Z')
    const result = await runManager(date, { type: 'string' })
    expect(result.arguments).toBe(JSON.stringify(date))
    expect(result.executions).toBe(1)
  })
  it('keeps boxed primitive final correction', async () => {
    const result = await runManager(Object(7), { type: 'number' })
    expect(result.arguments).toBe('7')
    expect(result.executions).toBe(1)
  })
  it('calls custom toJSON once and stores its canonical result through chat and UI', async () => {
    let serializations = 0
    let executions = 0
    const input = {
      toJSON() {
        serializations++
        return { value: 2 }
      },
    }
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('custom', 'check'),
          ev.toolArgs('custom', '{"value":1}'),
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'custom',
            input,
            metadata: {
              tanstack: {
                input: {
                  toJSON() {
                    throw new Error('Stale metadata input must not serialize')
                  },
                },
              },
            },
            timestamp: 0,
          },
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted('second'), ev.runFinished()],
      ],
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [
          {
            name: 'check',
            description: 'Check',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'number' } },
            },
            execute(value: unknown) {
              executions++
              expect(value).toEqual({ value: 2 })
              return 'ok'
            },
          },
        ],
      }),
    )
    expect(serializations).toBe(1)
    expect(executions).toBe(1)
    const processor = new StreamProcessor()
    for (const event of chunks)
      processor.processChunk(JSON.parse(JSON.stringify(event)))
    expect(
      processor
        .getMessages()
        .flatMap((message) => uiMessageToModelMessages(message))
        .flatMap((message) => message.toolCalls ?? [])
        .find((call) => call.id === 'custom')?.function.arguments,
    ).toBe('{"value":2}')
  })
})

describe('custom array END JSON semantics', () => {
  it('uses array indices instead of a custom iterator', async () => {
    const values = [1]
    values[Symbol.iterator] = () => [2][Symbol.iterator]()
    const result = await runManager(values, {
      type: 'array',
      items: { type: 'number' },
    })
    expect(result.arguments).toBe('[1]')
    expect(result.executions).toBe(1)
    expect(result.result[0]?.content).toBe('[1]')
  })
  it('reads an array accessor only once through actual chat and JSON transport', async () => {
    let reads = 0
    let executions = 0
    const values: Array<unknown> = []
    Object.defineProperty(values, '0', {
      get() {
        reads++
        return 1
      },
      enumerable: true,
      configurable: true,
    })
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('array', 'check'),
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'array',
            input: values,
            timestamp: 0,
          },
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted('second'), ev.runFinished()],
      ],
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [
          {
            name: 'check',
            description: 'Check',
            inputSchema: { type: 'array', items: { type: 'number' } },
            execute(input: unknown) {
              executions++
              expect(input).toEqual([1])
              return 'ok'
            },
          },
        ],
      }),
    )
    expect(executions).toBe(1)
    expect(reads).toBe(1)
    const processor = new StreamProcessor()
    for (const event of chunks)
      processor.processChunk(JSON.parse(JSON.stringify(event)))
    expect(reads).toBe(1)
    expect(
      processor
        .getMessages()
        .flatMap((message) => uiMessageToModelMessages(message))
        .flatMap((message) => message.toolCalls ?? [])
        .find((call) => call.id === 'array')?.function.arguments,
    ).toBe('[1]')
  })
})

describe('custom END proxy evaluation', () => {
  it('evaluates original custom properties once through actual chat and wire reload', async () => {
    let propertyReads = 0
    let keyReads = 0
    const input = new Proxy(
      { value: 2 },
      {
        get(target, key, receiver) {
          if (key === 'value') propertyReads++
          return Reflect.get(target, key, receiver)
        },
        ownKeys(target) {
          keyReads++
          return Reflect.ownKeys(target)
        },
      },
    )
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('proxy', 'check'),
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'proxy',
            input,
            timestamp: 0,
          },
          ev.runFinished('tool_calls'),
        ],
      ],
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Check' }],
        tools: [
          {
            name: 'check',
            description: 'Check',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'number' } },
            },
          },
        ],
      }),
    )
    const processor = new StreamProcessor()
    for (const event of chunks)
      processor.processChunk(JSON.parse(JSON.stringify(event)))
    expect(propertyReads).toBe(1)
    expect(keyReads).toBe(1)
    expect(
      processor
        .getMessages()
        .flatMap((message) => uiMessageToModelMessages(message))
        .flatMap((message) => message.toolCalls ?? [])
        .find((call) => call.id === 'proxy')?.function.arguments,
    ).toBe('{"value":2}')
  })
})

describe('custom END JSON object compatibility', () => {
  it('does not invent an empty object for boxed BigInt', async () => {
    await expect(
      runManager(Object(1n), { type: 'object', properties: {} }),
    ).rejects.toThrow(TypeError)
  })
  it('uses a callable authored toJSON once', async () => {
    let serializations = 0
    const input = Object.assign(() => undefined, {
      toJSON() {
        serializations++
        return { value: 2 }
      },
    })
    const result = await runManager(input, {
      type: 'object',
      properties: { value: { type: 'number' } },
    })
    expect(result.arguments).toBe('{"value":2}')
    expect(result.executions).toBe(1)
    expect(serializations).toBe(1)
  })
})

describe('custom END JSON conversion compatibility', () => {
  it('captures a proxy array length once', async () => {
    let reads = 0
    const input = new Proxy([1, 2], {
      get(target, key, receiver) {
        if (key === 'length') return ++reads === 1 ? 1 : 2
        return Reflect.get(target, key, receiver)
      },
    })
    const result = await runManager(input, {
      type: 'array',
      items: { type: 'number' },
    })
    expect(result.arguments).toBe('[1]')
    expect(result.executions).toBe(1)
    expect(reads).toBe(1)
  })
  it('honors boxed Number primitive conversion', async () => {
    const input = Object(7)
    input[Symbol.toPrimitive] = () => 2
    const result = await runManager(input, { type: 'number' })
    expect(result.arguments).toBe('2')
    expect(result.executions).toBe(1)
  })
  it('honors boxed String primitive conversion', async () => {
    const input = Object('old')
    input[Symbol.toPrimitive] = () => 'new'
    const result = await runManager(input, { type: 'string' })
    expect(result.arguments).toBe('"new"')
    expect(result.executions).toBe(1)
  })
  it('retains an own __proto__ key during a sibling correction', () => {
    const manager = new ToolCallManager([])
    manager.addToolCallStartEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'proto',
      toolCallName: 'check',
      timestamp: 0,
    })
    manager.addToolCallArgsEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'proto',
      delta: '{"__proto__":{"polluted":true},"value":1}',
      timestamp: 0,
    })
    manager.completeToolCall({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'proto',
      input: JSON.parse('{"__proto__":{"polluted":true},"value":2}'),
      timestamp: 0,
    })
    const raw = manager.getToolCalls()[0]?.function.arguments
    expect(raw).toBe('{"__proto__":{"polluted":true},"value":2}')
    const parsed: unknown = JSON.parse(raw ?? '')
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(true)
    expect(
      Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'),
    ).toBe(false)
  })
})

describe('custom END boxed internal values', () => {
  it.each([Number.prototype, String.prototype, Boolean.prototype])(
    'treats a fake boxed prototype as an ordinary object',
    async (prototype) => {
      const result = await runManager(Object.create(prototype), {
        type: 'object',
        properties: {},
      })
      expect(result.arguments).toBe('{}')
      expect(result.executions).toBe(1)
    },
  )
  it('treats a Proxy around a boxed number as an ordinary object', async () => {
    const result = await runManager(new Proxy(Object(7), {}), {
      type: 'object',
      properties: {},
    })
    expect(result.arguments).toBe('{}')
    expect(result.executions).toBe(1)
  })
})

describe('custom END boxed Number numeric conversion', () => {
  it.each([1n, Symbol('number')])(
    'rejects a non-number primitive result',
    async (primitive) => {
      const input = Object(7)
      input[Symbol.toPrimitive] = () => primitive
      await expect(runManager(input, { type: 'number' })).rejects.toThrow(
        TypeError,
      )
    },
  )
})
