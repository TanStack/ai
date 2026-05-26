import { describe, expect, it, vi } from 'vitest'
import { createDaytonaIsolateDriver } from '../src/isolate-driver'
import { DAYTONA_RESULT_MARKER } from '../src/wrap-code'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type {
  DaytonaCodeRunParams,
  DaytonaCodeRunResponse,
  DaytonaExecutionEnvelope,
  DaytonaSandboxLike,
} from '../src/types'

function envelope(response: DaytonaExecutionEnvelope): DaytonaCodeRunResponse {
  return {
    exitCode: 0,
    result: `${DAYTONA_RESULT_MARKER}${JSON.stringify(response)}`,
    artifacts: {
      stdout: `${DAYTONA_RESULT_MARKER}${JSON.stringify(response)}`,
    },
  }
}

function stdoutWithEnvelope(
  prefix: string,
  response: DaytonaExecutionEnvelope,
): DaytonaCodeRunResponse {
  const stdout = `${prefix}\n${DAYTONA_RESULT_MARKER}${JSON.stringify(response)}`
  return {
    exitCode: 0,
    result: stdout,
    artifacts: { stdout },
  }
}

function resultMarkerFromCode(code: string): string {
  const match = code.match(/"(__TANSTACK_AI_CODE_MODE_RESULT__:[^"]+)"/)
  return match?.[1] ?? DAYTONA_RESULT_MARKER
}

function rewriteOutputMarker(
  output: string | undefined,
  resultMarker: string,
): string | undefined {
  if (output === undefined) {
    return undefined
  }

  return output
    .split(/\r?\n/)
    .map((line) =>
      line.startsWith(DAYTONA_RESULT_MARKER)
        ? `${resultMarker}${line.slice(DAYTONA_RESULT_MARKER.length)}`
        : line,
    )
    .join('\n')
}

function rewriteResponseMarker(
  code: string,
  response: DaytonaCodeRunResponse,
): DaytonaCodeRunResponse {
  const resultMarker = resultMarkerFromCode(code)
  return {
    ...response,
    result: rewriteOutputMarker(response.result, resultMarker),
    artifacts:
      response.artifacts === undefined
        ? undefined
        : {
            ...response.artifacts,
            stdout: rewriteOutputMarker(
              response.artifacts.stdout,
              resultMarker,
            ),
          },
  }
}

function makeSandbox(
  codeRun: (
    code: string,
    params?: DaytonaCodeRunParams,
    timeoutSeconds?: number,
  ) => Promise<DaytonaCodeRunResponse>,
): DaytonaSandboxLike {
  return {
    process: {
      codeRun: async (code, params, timeoutSeconds) =>
        rewriteResponseMarker(
          code,
          await codeRun(code, params, timeoutSeconds),
        ),
    },
  }
}

function makeBinding(
  name: string,
  execute: (args: unknown) => Promise<unknown>,
): ToolBinding {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    execute,
  }
}

describe('createDaytonaIsolateDriver', () => {
  it('rejects invalid driver config', () => {
    const sandbox = makeSandbox(vi.fn())

    expect(() => createDaytonaIsolateDriver({ sandbox, timeout: 0 })).toThrow(
      /timeout must be a finite positive number/,
    )
    expect(() =>
      createDaytonaIsolateDriver({ sandbox, timeout: Number.NaN }),
    ).toThrow(/timeout must be a finite positive number/)
    expect(() =>
      createDaytonaIsolateDriver({ sandbox, maxToolRounds: -1 }),
    ).toThrow(/maxToolRounds must be a finite non-negative integer/)
    expect(() =>
      createDaytonaIsolateDriver({ sandbox, maxToolRounds: 1.5 }),
    ).toThrow(/maxToolRounds must be a finite non-negative integer/)
  })

  it('rejects invalid per-context timeout config', async () => {
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(vi.fn()),
    })

    expect(() =>
      driver.createContext({
        bindings: {},
        timeout: -1,
      }),
    ).toThrow(/timeout must be a finite positive number/)
  })

  it('returns a context with execute and dispose', async () => {
    const codeRun = vi.fn().mockResolvedValue(
      envelope({
        status: 'done',
        success: true,
        value: 42,
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    expect(typeof context.execute).toBe('function')
    expect(typeof context.dispose).toBe('function')

    const result = await context.execute('return 42')
    expect(result.success).toBe(true)
    expect(result.value).toBe(42)
  })

  it('wraps code, sends no params, and converts timeout from ms to seconds', async () => {
    const codeRun = vi.fn().mockResolvedValue(
      envelope({
        status: 'done',
        success: true,
        value: { sum: 7 },
        logs: ['hello'],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
      timeout: 1500,
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return { sum: 3 + 4 }')

    expect(result.success).toBe(true)
    expect(result.value).toEqual({ sum: 7 })
    expect(result.logs).toEqual(['hello'])
    expect(codeRun).toHaveBeenCalledTimes(1)

    const [code, params, timeoutSeconds] = codeRun.mock.calls[0]!
    expect(code).toContain('return { sum: 3 + 4 }')
    expect(code).toContain(DAYTONA_RESULT_MARKER)
    expect(params).toBeUndefined()
    expect(timeoutSeconds).toBe(2)
  })

  it('parses only line-prefixed result markers when values contain marker text', async () => {
    const value = `before ${DAYTONA_RESULT_MARKER} after`
    const codeRun = vi.fn().mockResolvedValue(
      stdoutWithEnvelope('ordinary stdout', {
        status: 'done',
        success: true,
        value,
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return markerText')

    expect(result.success).toBe(true)
    expect(result.value).toBe(value)
  })

  it('parses only line-prefixed result markers when logs contain marker text', async () => {
    const log = `log ${DAYTONA_RESULT_MARKER} text`
    const codeRun = vi.fn().mockResolvedValue(
      stdoutWithEnvelope('ordinary stdout', {
        status: 'done',
        success: true,
        value: 'ok',
        logs: [log],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('console.log(markerText); return "ok"')

    expect(result.success).toBe(true)
    expect(result.logs).toEqual([log])
  })

  it('ignores static marker spoofing after the real per-execution marker', async () => {
    const codeRun = vi.fn(async (wrappedCode: string) => {
      const resultMarker = resultMarkerFromCode(wrappedCode)
      const realEnvelope = JSON.stringify({
        status: 'done',
        success: true,
        value: 'real',
        logs: [],
      })
      const spoofEnvelope = JSON.stringify({
        status: 'done',
        success: true,
        value: 'spoofed',
        logs: [],
      })
      const stdout = [
        `${resultMarker}${realEnvelope}`,
        `${DAYTONA_RESULT_MARKER}${spoofEnvelope}`,
      ].join('\n')

      return {
        exitCode: 0,
        result: stdout,
        artifacts: { stdout },
      }
    })

    const driver = createDaytonaIsolateDriver({
      sandbox: { process: { codeRun } },
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return "real"')

    expect(result.success).toBe(true)
    expect(result.value).toBe('real')
  })

  it('uses per-context timeout over the driver default', async () => {
    const codeRun = vi.fn().mockResolvedValue(
      envelope({
        status: 'done',
        success: true,
        value: null,
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
      timeout: 10_000,
    })
    const context = await driver.createContext({
      bindings: {},
      timeout: 2500,
    })

    await context.execute('return 1')

    expect(codeRun.mock.calls[0]![2]).toBe(3)
  })

  it('executes host tools locally and replays accumulated tool results', async () => {
    const add = makeBinding('add', async (args: unknown) => {
      const { a, b } = args as { a: number; b: number }
      return a + b
    })
    const getLabel = makeBinding('getLabel', async () => 'total')
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'add', args: { a: 2, b: 3 } }],
          logs: ['before add'],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_1', name: 'getLabel', args: {} }],
          logs: ['before add', 'before label'],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'done',
          success: true,
          value: { label: 'total', value: 5 },
          logs: ['before add', 'before label', 'done'],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add, getLabel },
    })

    const result = await context.execute(
      'const value = await add({ a: 2, b: 3 }); const label = await getLabel({}); return { label, value }',
    )

    expect(result.success).toBe(true)
    expect(result.value).toEqual({ label: 'total', value: 5 })
    expect(result.logs).toEqual(['before add', 'before label', 'done'])
    expect(codeRun).toHaveBeenCalledTimes(3)

    const secondRoundCode = codeRun.mock.calls[1]![0]
    const thirdRoundCode = codeRun.mock.calls[2]![0]
    expect(secondRoundCode).toContain('"tc_0":{"success":true,"value":5}')
    expect(thirdRoundCode).toContain('"tc_0":{"success":true,"value":5}')
    expect(thirdRoundCode).toContain('"tc_1":{"success":true,"value":"total"}')
  })

  it('returns tool errors to the sandbox protocol', async () => {
    const failTool = makeBinding('failTool', async () => {
      throw new Error('Tool failed')
    })
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'failTool', args: {} }],
          logs: [],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'done',
          success: false,
          error: { name: 'Error', message: 'Tool call failed' },
          logs: [],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { failTool },
    })

    const result = await context.execute('return await failTool({})')

    expect(result.success).toBe(false)
    expect(result.error?.message).toBe('Tool call failed')
    expect(codeRun.mock.calls[1]![0]).toContain(
      '"tc_0":{"success":false,"error":"Tool failed"}',
    )
  })

  it('returns unknown tool names to the sandbox protocol', async () => {
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'unknownTool', args: {} }],
          logs: [],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'done',
          success: false,
          error: { name: 'Error', message: 'Tool result not found' },
          logs: [],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    await context.execute('return await unknownTool({})')

    expect(codeRun.mock.calls[1]![0]).toContain(
      '"tc_0":{"success":false,"error":"Unknown tool: unknownTool"}',
    )
  })

  it('executes same-round tool calls concurrently and merges results atomically', async () => {
    const events: Array<string> = []
    let resolveSlow: (value: string) => void = () => {}
    const slowReady = new Promise<string>((resolve) => {
      resolveSlow = resolve
    })
    const slow = makeBinding('slow', async () => {
      events.push('slow:start')
      return slowReady
    })
    const fast = makeBinding('fast', async () => {
      events.push('fast:start')
      return 'fast'
    })
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [
            { id: 'tc_0', name: 'slow', args: {} },
            { id: 'tc_1', name: 'fast', args: {} },
          ],
          logs: [],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'done',
          success: true,
          value: 'done',
          logs: [],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { slow, fast },
    })

    const resultPromise = context.execute(
      'return await Promise.all([slow({}), fast({})])',
    )

    for (let index = 0; index < 10 && events.length < 2; index++) {
      await Promise.resolve()
    }
    expect(events).toEqual(['slow:start', 'fast:start'])

    resolveSlow('slow')
    const result = await resultPromise

    expect(result.success).toBe(true)
    expect(codeRun.mock.calls[1]![0]).toContain(
      '"tc_0":{"success":true,"value":"slow"}',
    )
    expect(codeRun.mock.calls[1]![0]).toContain(
      '"tc_1":{"success":true,"value":"fast"}',
    )
  })

  it('treats prototype property tool names as unknown tools', async () => {
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'toString', args: {} }],
          logs: [],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'done',
          success: false,
          error: { name: 'Error', message: 'Tool result not found' },
          logs: [],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    await context.execute('return await toString({})')

    expect(codeRun.mock.calls[1]![0]).toContain(
      '"tc_0":{"success":false,"error":"Unknown tool: toString"}',
    )
  })

  it('rejects invalid tool call ids from the sandbox boundary', async () => {
    const add = makeBinding('add', async () => 1)
    const codeRun = vi.fn().mockResolvedValueOnce(
      envelope({
        status: 'need_tools',
        toolCalls: [{ id: '__proto__', name: 'add', args: {} }],
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain('Invalid Daytona tool call id')
    expect(codeRun).toHaveBeenCalledTimes(1)
  })

  it('rejects duplicate tool call ids in one sandbox response', async () => {
    const add = makeBinding('add', async () => 1)
    const codeRun = vi.fn().mockResolvedValueOnce(
      envelope({
        status: 'need_tools',
        toolCalls: [
          { id: 'tc_0', name: 'add', args: {} },
          { id: 'tc_0', name: 'add', args: {} },
        ],
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain('Duplicate Daytona tool call id')
    expect(codeRun).toHaveBeenCalledTimes(1)
  })

  it('rejects empty need_tools responses before executing host tools', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const add = makeBinding('add', execute)
    const codeRun = vi.fn().mockResolvedValueOnce(
      envelope({
        status: 'need_tools',
        toolCalls: [],
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      'Daytona need_tools response must include tool calls',
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects gapped tool call ids before executing host tools', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const add = makeBinding('add', execute)
    const codeRun = vi.fn().mockResolvedValueOnce(
      envelope({
        status: 'need_tools',
        toolCalls: [{ id: 'tc_1', name: 'add', args: {} }],
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      'Daytona tool call ids must be contiguous from tc_0',
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects out-of-order tool call ids before executing host tools', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const add = makeBinding('add', execute)
    const codeRun = vi.fn().mockResolvedValueOnce(
      envelope({
        status: 'need_tools',
        toolCalls: [
          { id: 'tc_1', name: 'add', args: {} },
          { id: 'tc_0', name: 'add', args: {} },
        ],
        logs: [],
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute(
      'return await Promise.all([add({}), add({})])',
    )

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      'Daytona tool call ids must be contiguous from tc_0',
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects tool call ids that already have cached results', async () => {
    const add = makeBinding('add', async () => 1)
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
          logs: [],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
          logs: [],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      'Daytona tool call id already has a cached result',
    )
    expect(codeRun).toHaveBeenCalledTimes(2)
  })

  it('allows one tool callback round plus final replay when maxToolRounds is 1', async () => {
    const add = makeBinding('add', async () => 5)
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
          logs: ['need add'],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'done',
          success: true,
          value: 5,
          logs: ['need add', 'done'],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
      maxToolRounds: 1,
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(true)
    expect(result.value).toBe(5)
    expect(result.logs).toEqual(['need add', 'done'])
    expect(codeRun).toHaveBeenCalledTimes(2)
  })

  it('returns MaxRoundsExceeded when sandbox keeps requesting tools', async () => {
    const add = makeBinding('add', async () => 1)
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
          logs: [],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_1', name: 'add', args: {} }],
          logs: [],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_2', name: 'add', args: {} }],
          logs: [],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
      maxToolRounds: 2,
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('MaxRoundsExceeded')
    expect(result.error?.message).toContain('2')
    expect(codeRun).toHaveBeenCalledTimes(3)
  })

  it('uses the latest replay log snapshot instead of appending duplicates', async () => {
    const add = makeBinding('add', async () => 1)
    const codeRun = vi
      .fn()
      .mockResolvedValueOnce(
        envelope({
          status: 'need_tools',
          toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
          logs: ['before'],
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          status: 'done',
          success: true,
          value: 1,
          logs: ['before', 'after'],
        }),
      )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')

    expect(result.success).toBe(true)
    expect(result.logs).toEqual(['before', 'after'])
  })

  it('does not execute tools or replay when disposed after codeRun resolves', async () => {
    let resolveCodeRun: (value: DaytonaCodeRunResponse) => void = () => {}
    const firstCodeRun = new Promise<DaytonaCodeRunResponse>((resolve) => {
      resolveCodeRun = resolve
    })
    const codeRun = vi.fn().mockReturnValueOnce(firstCodeRun)
    const execute = vi.fn().mockResolvedValue(1)
    const add = makeBinding('add', execute)
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const executePromise = context.execute('return await add({})')
    await context.dispose()
    resolveCodeRun(
      envelope({
        status: 'need_tools',
        toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
        logs: ['before add'],
      }),
    )

    const result = await executePromise

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DisposedError')
    expect(result.logs).toEqual(['before add'])
    expect(execute).not.toHaveBeenCalled()
    expect(codeRun).toHaveBeenCalledTimes(1)
  })

  it('returns timeout instead of replaying after host tools exceed the budget', async () => {
    let resolveTool: (value: number) => void = () => {}
    const toolResult = new Promise<number>((resolve) => {
      resolveTool = resolve
    })
    const add = makeBinding('add', async () => toolResult)
    const codeRun = vi.fn().mockResolvedValueOnce(
      envelope({
        status: 'need_tools',
        toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
        logs: ['before'],
      }),
    )
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
      timeout: 1,
    })
    const context = await driver.createContext({
      bindings: { add },
    })

    const result = await context.execute('return await add({})')
    resolveTool(1)

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('TimeoutError')
    expect(codeRun).toHaveBeenCalledTimes(1)
  })

  it('returns timeout when codeRun exceeds the millisecond execution budget', async () => {
    let resolveCodeRun: (value: DaytonaCodeRunResponse) => void = () => {}
    const slowCodeRun = new Promise<DaytonaCodeRunResponse>((resolve) => {
      resolveCodeRun = resolve
    })
    const codeRun = vi.fn().mockReturnValueOnce(slowCodeRun)
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
      timeout: 1,
    })
    const context = await driver.createContext({
      bindings: {},
    })

    const result = await context.execute('return 1')
    resolveCodeRun(
      envelope({
        status: 'done',
        success: true,
        value: 1,
        logs: [],
      }),
    )

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('TimeoutError')
    expect(codeRun).toHaveBeenCalledTimes(1)
  })

  it('returns wrapper status errors as execution errors', async () => {
    const codeRun = vi.fn().mockResolvedValue(
      envelope({
        status: 'error',
        error: {
          name: 'WrapperError',
          message: 'wrapper failed',
        },
      }),
    )

    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('WrapperError')
    expect(result.error?.message).toBe('wrapper failed')
  })

  it('rejects success envelopes that include errors', async () => {
    const codeRun = vi.fn().mockResolvedValue({
      exitCode: 0,
      result: `${DAYTONA_RESULT_MARKER}${JSON.stringify({
        status: 'done',
        success: true,
        value: 1,
        error: { name: 'Error', message: 'impossible' },
        logs: [],
      })}`,
    })
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      'Daytona success envelope must not include error',
    )
  })

  it('rejects failure envelopes without errors', async () => {
    const codeRun = vi.fn().mockResolvedValue({
      exitCode: 0,
      result: `${DAYTONA_RESULT_MARKER}${JSON.stringify({
        status: 'done',
        success: false,
        logs: [],
      })}`,
    })
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      "Daytona envelope field 'error' must be an object",
    )
  })

  it('rejects failure envelopes that include values', async () => {
    const codeRun = vi.fn().mockResolvedValue({
      exitCode: 0,
      result: `${DAYTONA_RESULT_MARKER}${JSON.stringify({
        status: 'done',
        success: false,
        value: 1,
        error: { name: 'Error', message: 'failed' },
        logs: [],
      })}`,
    })
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      'Daytona failure envelope must not include value',
    )
  })

  it('returns DaytonaExecutionError when codeRun throws', async () => {
    const codeRun = vi.fn().mockRejectedValue(new Error('sandbox unavailable'))
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain('sandbox unavailable')
  })

  it('normalizes thrown circular objects without throwing again', async () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    const codeRun = vi.fn().mockRejectedValue(circular)
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain(
      'Failed to execute code in Daytona sandbox: Error',
    )
  })

  it('returns DaytonaExecutionError when the marker is missing', async () => {
    const codeRun = vi.fn().mockResolvedValue({
      exitCode: 0,
      result: 'ordinary stdout',
      artifacts: { stdout: 'ordinary stdout' },
    })
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DaytonaExecutionError')
    expect(result.error?.message).toContain('Code Mode marker')
  })

  it('does not call Daytona after dispose', async () => {
    const codeRun = vi.fn()
    const driver = createDaytonaIsolateDriver({
      sandbox: makeSandbox(codeRun),
    })
    const context = await driver.createContext({ bindings: {} })

    await context.dispose()
    const result = await context.execute('return 1')

    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('DisposedError')
    expect(codeRun).not.toHaveBeenCalled()
  })
})
