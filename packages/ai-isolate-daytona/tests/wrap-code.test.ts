import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  DAYTONA_RESULT_MARKER,
  generateToolWrappers,
  wrapCode,
} from '../src/wrap-code'
import type {
  DaytonaExecutionEnvelope,
  ToolResultPayload,
  ToolSchema,
} from '../src/types'

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

async function runWrappedCode(
  code: string,
  tools: Array<ToolSchema> = [],
  toolResults?: Record<string, ToolResultPayload>,
): Promise<DaytonaExecutionEnvelope> {
  const output: Array<string> = []
  const context = createContext({
    console: {
      log: (value: unknown) => output.push(String(value)),
    },
  })

  const result: unknown = runInContext(
    wrapCode(code, tools, toolResults),
    context,
  )
  if (isPromiseLike(result)) {
    await result
  }

  const markedOutput = output.find((line) =>
    line.startsWith(DAYTONA_RESULT_MARKER),
  )
  if (!markedOutput) {
    throw new Error('wrapped code did not emit Daytona marker')
  }

  return JSON.parse(
    markedOutput.slice(DAYTONA_RESULT_MARKER.length),
  ) as DaytonaExecutionEnvelope
}

describe('generateToolWrappers', () => {
  const tools: Array<ToolSchema> = [
    { name: 'add', description: 'Add numbers', inputSchema: {} },
    { name: 'fetchData', description: 'Fetch data', inputSchema: {} },
  ]

  it('generates first-pass wrappers that collect missing tool calls', () => {
    const code = generateToolWrappers(tools)
    expect(code).toContain('async function add(input)')
    expect(code).toContain("__pendingToolCalls.push({ id: callId, name: 'add'")
    expect(code).toContain('__ToolCallNeeded')
    expect(code).toContain('async function fetchData(input)')
  })

  it('generates wrappers that return cached results when present', () => {
    const code = generateToolWrappers(tools)
    expect(code).toContain('const result = __toolResults[callId]')
    expect(code).toContain('result.success')
    expect(code).toContain('return result.value')
  })

  it('rejects unsafe tool names', () => {
    const invalid = [
      'has space',
      'with`backtick',
      "with'quote",
      'with"quote',
      'with;semi',
      'with\nnewline',
      '123tool',
      'return',
      'class',
      'await',
    ]

    for (const name of invalid) {
      expect(() =>
        generateToolWrappers([{ name, description: '', inputSchema: {} }]),
      ).toThrow(/Invalid tool name/)
    }
  })

  it('accepts conventional JavaScript identifiers', () => {
    const valid = ['camelCase', 'snake_case', '_leading', '$dollar']

    for (const name of valid) {
      expect(() =>
        generateToolWrappers([{ name, description: '', inputSchema: {} }]),
      ).not.toThrow()
    }
  })
})

describe('wrapCode', () => {
  it('prints a marked JSON envelope instead of relying on codeRun return value', () => {
    const wrapped = wrapCode('return 1 + 1', [])
    expect(wrapped).toContain(DAYTONA_RESULT_MARKER)
    expect(wrapped).toContain('__hostConsole.log')
    expect(wrapped).toContain("status: 'done'")
    expect(wrapped).toContain('return 1 + 1')
  })

  it('includes cached tool results for replay rounds', () => {
    const wrapped = wrapCode(
      'return await add({ a: 2, b: 3 })',
      [{ name: 'add', description: 'Add numbers', inputSchema: {} }],
      { tc_0: { success: true, value: 5 } },
    )

    expect(wrapped).toContain('"tc_0"')
    expect(wrapped).toContain('"success":true')
    expect(wrapped).toContain('"value":5')
  })

  it('captures user console output in the protocol logs', () => {
    const wrapped = wrapCode('console.log("hello")', [])
    expect(wrapped).toContain('const console =')
    expect(wrapped).toContain('__logs.push')
    expect(wrapped).toContain('logs: __logs')
  })

  it('executes wrapped code and emits a done envelope', async () => {
    const envelope = await runWrappedCode('return 1 + 1')

    expect(envelope).toEqual({
      status: 'done',
      success: true,
      value: 2,
      logs: [],
    })
  })

  it('captures console output in an executable wrapper', async () => {
    const envelope = await runWrappedCode(`
      console.log("hello", { target: "world" });
      console.warn("careful");
      return "ok";
    `)

    expect(envelope.status).toBe('done')
    if (envelope.status === 'done') {
      expect(envelope.logs).toEqual([
        'hello {"target":"world"}',
        'WARN: careful',
      ])
    }
  })

  it('does not fail execution when console arguments cannot JSON serialize', async () => {
    const envelope = await runWrappedCode(`
      const circular = {};
      circular.self = circular;
      console.log("circular", circular);
      console.info("bigint", 1n);
      return "ok";
    `)

    expect(envelope.status).toBe('done')
    if (envelope.status === 'done') {
      expect(envelope.success).toBe(true)
      expect(envelope.logs).toEqual([
        'circular [object Object]',
        'INFO: bigint 1',
      ])
    }
  })

  it('normalizes non-Error thrown values in the failure envelope', async () => {
    const nullEnvelope = await runWrappedCode('throw null')
    const undefinedEnvelope = await runWrappedCode('throw undefined')
    const stringEnvelope = await runWrappedCode('throw "boom"')

    expect(nullEnvelope).toMatchObject({
      status: 'done',
      success: false,
      error: { name: 'Error', message: 'null' },
    })
    expect(undefinedEnvelope).toMatchObject({
      status: 'done',
      success: false,
      error: { name: 'Error', message: 'undefined' },
    })
    expect(stringEnvelope).toMatchObject({
      status: 'done',
      success: false,
      error: { name: 'Error', message: 'boom' },
    })
  })

  it('emits need_tools for missing tool results', async () => {
    const envelope = await runWrappedCode('return await add({ a: 2, b: 3 })', [
      { name: 'add', description: 'Add numbers', inputSchema: {} },
    ])

    expect(envelope).toEqual({
      status: 'need_tools',
      toolCalls: [{ id: 'tc_0', name: 'add', args: { a: 2, b: 3 } }],
      logs: [],
    })
  })

  it('replays successful cached tool results', async () => {
    const envelope = await runWrappedCode(
      'return await add({ a: 2, b: 3 })',
      [{ name: 'add', description: 'Add numbers', inputSchema: {} }],
      { tc_0: { success: true, value: 5 } },
    )

    expect(envelope).toEqual({
      status: 'done',
      success: true,
      value: 5,
      logs: [],
    })
  })

  it('replays failed cached tool results as execution errors', async () => {
    const envelope = await runWrappedCode(
      'return await add({ a: 2, b: 3 })',
      [{ name: 'add', description: 'Add numbers', inputSchema: {} }],
      { tc_0: { success: false, error: 'Tool failed' } },
    )

    expect(envelope.status).toBe('done')
    if (envelope.status === 'done') {
      expect(envelope.success).toBe(false)
      expect(envelope.error?.message).toBe('Tool failed')
    }
  })

  it('emits an outer error envelope when the result marker cannot serialize', async () => {
    const envelope = await runWrappedCode(`
      const value = {};
      value.self = value;
      return value;
    `)

    expect(envelope.status).toBe('error')
    if (envelope.status === 'error') {
      expect(envelope.error.message).toContain('circular')
    }
  })

  it('normalizes non-Error outer serialization failures', async () => {
    const envelope = await runWrappedCode(`
      return {
        toJSON() {
          throw null;
        }
      };
    `)

    expect(envelope).toEqual({
      status: 'error',
      error: {
        name: 'Error',
        message: 'null',
      },
    })
  })
})
