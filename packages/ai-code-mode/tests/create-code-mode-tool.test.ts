import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { createCodeModeTool } from '../src/create-code-mode-tool'
import type {
  IsolateDriver,
  IsolateContext,
  ExecutionResult,
  ToolExecutionContext,
} from '../src/types'

function createMockDriver(
  executeResult: ExecutionResult = { success: true, value: 42, logs: [] },
): { driver: IsolateDriver; mockContext: IsolateContext } {
  const mockContext: IsolateContext = {
    execute: vi.fn().mockResolvedValue(executeResult),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  const driver: IsolateDriver = {
    createContext: vi.fn().mockResolvedValue(mockContext),
  }
  return { driver, mockContext }
}

function createMockTool<TName extends string>(name: TName) {
  const def = toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  })
  return def.server(async (input) => ({ result: input.query }))
}

describe('createCodeModeTool', () => {
  it('throws on empty tools array', () => {
    const { driver } = createMockDriver()
    expect(() => createCodeModeTool({ driver, tools: [] })).toThrow(
      'At least one tool must be provided',
    )
  })

  it('returns a tool named execute_typescript', () => {
    const { driver } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })
    expect(tool.name).toBe('execute_typescript')
  })

  it('tool description lists all external_* function names', () => {
    const { driver } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather'), createMockTool('dbQuery')],
    })
    expect(tool.description).toContain('external_fetchWeather')
    expect(tool.description).toContain('external_dbQuery')
  })

  it('tool description says discover_tools is a separate tool', () => {
    const { driver } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [
        createMockTool('fetchWeather'),
        { ...createMockTool('dbQuery'), lazy: true },
      ],
    })
    expect(tool.description).toContain(
      'discover_tools is a separate tool. It is not available inside this sandbox.',
    )
  })

  it('execute calls stripTypeScript then driver.createContext', async () => {
    const { driver, mockContext } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    await tool.execute!({ typescriptCode: 'const x: string = "hi"\nreturn x' })

    expect(driver.createContext).toHaveBeenCalledTimes(1)
    const executeCall = vi.mocked(mockContext.execute).mock.calls[0]?.[0]
    // Should have stripped the type annotation
    expect(executeCall).not.toContain(': string')
    expect(executeCall).toContain('return x')
  })

  it('disposes context in finally block (even on error)', async () => {
    const mockContext: IsolateContext = {
      execute: vi.fn().mockRejectedValue(new Error('boom')),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const driver: IsolateDriver = {
      createContext: vi.fn().mockResolvedValue(mockContext),
    }

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    await tool.execute!({ typescriptCode: 'return 1' })

    expect(mockContext.dispose).toHaveBeenCalledTimes(1)
  })

  it('returns success result on successful execution', async () => {
    const { driver } = createMockDriver({
      success: true,
      value: { answer: 42 },
      logs: ['computed'],
    })

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    const result = await tool.execute!({ typescriptCode: 'return 42' })
    expect(result).toEqual({
      success: true,
      result: { answer: 42 },
      logs: ['computed'],
    })
  })

  it('returns failure result on failed execution', async () => {
    const { driver } = createMockDriver({
      success: false,
      error: { name: 'ReferenceError', message: 'x is not defined' },
      logs: [],
    })

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    const result = await tool.execute!({ typescriptCode: 'return x' })
    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('ReferenceError')
    expect(result.error?.message).toBe('x is not defined')
  })

  it('returns TypeScriptError for TS parse errors', async () => {
    const { driver } = createMockDriver()

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    // Invalid syntax the transpiler will reject — stripTypeScript now throws
    const result = await tool.execute!({
      typescriptCode: 'const x: = invalid{{{syntax',
    })
    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('TypeScriptError')
  })

  it('uses a custom transpile hook instead of the default', async () => {
    const { driver, mockContext } = createMockDriver()
    const transpile = vi.fn((code: string) => `/* custom */ ${code}`)

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
      transpile,
    })

    await tool.execute!({ typescriptCode: 'return 1' })

    expect(transpile).toHaveBeenCalledWith('return 1')
    const executed = vi.mocked(mockContext.execute).mock.calls[0]?.[0]
    expect(executed).toBe('/* custom */ return 1')
  })

  it('awaits an async transpile hook', async () => {
    const { driver, mockContext } = createMockDriver()
    const transpile = vi.fn(async (code: string) =>
      Promise.resolve(`async:${code}`),
    )

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
      transpile,
    })

    await tool.execute!({ typescriptCode: 'return 1' })

    const executed = vi.mocked(mockContext.execute).mock.calls[0]?.[0]
    expect(executed).toBe('async:return 1')
  })

  it('surfaces a custom transpile error as a TypeScriptError', async () => {
    const { driver } = createMockDriver()
    const transpile = vi.fn(() => {
      throw new Error('custom transpile failed')
    })

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
      transpile,
    })

    const result = await tool.execute!({ typescriptCode: 'return 1' })
    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('TypeScriptError')
    expect(result.error?.message).toBe('custom transpile failed')
    expect(driver.createContext).not.toHaveBeenCalled()
  })

  it('emits code_mode:execution_started event', async () => {
    const { driver } = createMockDriver()
    const emitCustomEvent = vi.fn<ToolExecutionContext['emitCustomEvent']>()

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    await tool.execute!({ typescriptCode: 'return 1' }, { emitCustomEvent })

    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:execution_started',
      expect.objectContaining({
        timestamp: expect.any(Number),
        codeLength: expect.any(Number),
      }),
    )
  })

  it('emits code_mode:console events with correct level parsing', async () => {
    const { driver } = createMockDriver({
      success: true,
      value: null,
      logs: ['hello', 'ERROR: bad', 'WARN: careful', 'INFO: fyi'],
    })
    const emitCustomEvent = vi.fn<ToolExecutionContext['emitCustomEvent']>()

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    await tool.execute!({ typescriptCode: 'return null' }, { emitCustomEvent })

    const consoleEvents = emitCustomEvent.mock.calls.filter(
      ([eventName]) => eventName === 'code_mode:console',
    )

    expect(consoleEvents).toHaveLength(4)
    expect(consoleEvents[0]![1]).toEqual(
      expect.objectContaining({ level: 'log', message: 'hello' }),
    )
    expect(consoleEvents[1]![1]).toEqual(
      expect.objectContaining({ level: 'error', message: 'bad' }),
    )
    expect(consoleEvents[2]![1]).toEqual(
      expect.objectContaining({ level: 'warn', message: 'careful' }),
    )
    expect(consoleEvents[3]![1]).toEqual(
      expect.objectContaining({ level: 'info', message: 'fyi' }),
    )
  })

  it('getSnippetBindings merges dynamic bindings into context', async () => {
    const { driver } = createMockDriver()

    const snippetBinding = {
      name: 'snippet_greet',
      description: 'Greet someone',
      inputSchema: { type: 'object' },
      execute: vi.fn().mockResolvedValue('hi'),
    }

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
      getSnippetBindings: async () => ({ snippet_greet: snippetBinding }),
    })

    await tool.execute!({ typescriptCode: 'return 1' })

    const contextConfig = vi.mocked(driver.createContext).mock.calls[0]?.[0]
    expect(contextConfig).toBeDefined()
    if (!contextConfig) {
      throw new Error('Expected createContext to be called')
    }
    expect(contextConfig.bindings).toHaveProperty('snippet_greet')
    expect(contextConfig.bindings).toHaveProperty('external_fetchWeather')
  })

  it('passes the run abort signal and context to external_* calls', async () => {
    const seen: Array<ToolExecutionContext | undefined> = []
    const slowTool = toolDefinition({
      name: 'slow',
      description: 'Waits until the run aborts',
      inputSchema: z.object({}),
    }).server(
      (_input, ctx) =>
        new Promise((_resolve, reject) => {
          seen.push(ctx)
          ctx?.abortSignal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        }),
    )

    const mockContext: IsolateContext = {
      execute: vi.fn().mockImplementation(async () => {
        const bindings = vi.mocked(driver.createContext).mock.calls[0]![0]
          .bindings
        try {
          await bindings['external_slow']!.execute({})
          return { success: true, value: 'finished', logs: [] }
        } catch (error) {
          return {
            success: false,
            error: { name: 'Error', message: String(error) },
            logs: [],
          }
        }
      }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const driver: IsolateDriver = {
      createContext: vi.fn().mockResolvedValue(mockContext),
    }

    const tool = createCodeModeTool({ driver, tools: [slowTool] })
    const controller = new AbortController()
    const emitCustomEvent = vi.fn()
    const pending = tool.execute!(
      { typescriptCode: 'return await external_slow({})' },
      {
        toolCallId: 'parent-call',
        abortSignal: controller.signal,
        context: { userId: 'u1' },
        inputResponse: { status: 'cancelled' },
        emitCustomEvent,
      },
    )

    await vi.waitFor(() => expect(seen).toHaveLength(1))
    controller.abort()
    const result = await pending

    expect(result.success).toBe(false)
    expect(result.error?.message).toBe('Error: aborted')
    expect(seen[0]?.abortSignal).toBe(controller.signal)
    expect(seen[0]?.context).toEqual({ userId: 'u1' })
    expect(seen[0]?.toolCallId).toBeUndefined()
    expect(seen[0]?.inputResponse).toBeUndefined()
    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_error',
      expect.objectContaining({ function: 'external_slow', error: 'aborted' }),
    )
  })

  it('returns validation error for empty/non-string input', async () => {
    const { driver } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    const result = await tool.execute!({ typescriptCode: '' })
    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('ValidationError')
  })
})

describe('createCodeModeTool debug logging', () => {
  const makeSpyLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })

  const failingDriver = () =>
    createMockDriver({
      success: false,
      error: { name: 'TypeError', message: 'boom' },
      logs: [],
    }).driver

  it('routes execution failures to the configured logger, not console', async () => {
    const logger = makeSpyLogger()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tool = createCodeModeTool({
        driver: failingDriver(),
        tools: [createMockTool('fetchWeather')],
        debug: { logger },
      })

      const result = await tool.execute!({ typescriptCode: 'return 1' })

      expect(result.success).toBe(false)
      expect(consoleError).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('execute_typescript failed'),
        expect.objectContaining({
          phase: 'execute',
          success: false,
          error: expect.objectContaining({
            name: 'TypeError',
            message: 'boom',
          }),
        }),
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('logs execution failures to console.error when debug is unset', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tool = createCodeModeTool({
        driver: failingDriver(),
        tools: [createMockTool('fetchWeather')],
      })

      await tool.execute!({ typescriptCode: 'return 1' })

      // The default ConsoleLogger prints meta separately (console.dir on Node).
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('execute_typescript failed'),
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('silences execution failures with debug: false', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tool = createCodeModeTool({
        driver: failingDriver(),
        tools: [createMockTool('fetchWeather')],
        debug: false,
      })

      await tool.execute!({ typescriptCode: 'return 1' })

      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('logs successful executions under the tools category', async () => {
    const logger = makeSpyLogger()
    const { driver } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
      debug: { logger, tools: true },
    })

    await tool.execute!({ typescriptCode: 'return 1' })

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[tanstack-ai:tools]'),
      expect.objectContaining({ phase: 'execute', logCount: 0 }),
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('does not log successful executions with tools: false', async () => {
    const logger = makeSpyLogger()
    const { driver } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
      debug: { logger, tools: false },
    })

    await tool.execute!({ typescriptCode: 'return 1' })

    expect(logger.debug).not.toHaveBeenCalled()
  })

  it('routes secret-parameter warnings to the configured logger', () => {
    const logger = makeSpyLogger()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const secretTool = toolDefinition({
        name: 'callApi',
        description: 'Call an API',
        inputSchema: z.object({ apiKey: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
      }).server(async () => ({ ok: true }))

      createCodeModeTool({
        driver: createMockDriver().driver,
        tools: [secretTool],
        debug: { logger },
      })

      expect(consoleWarn).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('apiKey'),
        expect.objectContaining({
          toolName: 'external_callApi',
          paramName: 'apiKey',
        }),
      )
    } finally {
      consoleWarn.mockRestore()
    }
  })
})
