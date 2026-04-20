import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { createCodeModeTool } from '../src/create-code-mode-tool'
import type {
  IsolateDriver,
  IsolateContext,
  ExecutionResult,
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

function createMockTool(name: string) {
  const def = toolDefinition({
    name: name as any,
    description: `The ${name} tool`,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  })
  return def.server(async (input: any) => ({ result: input.query }))
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

  it('execute calls stripTypeScript then driver.createContext', async () => {
    const { driver, mockContext } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    await tool.execute({ typescriptCode: 'const x: string = "hi"\nreturn x' })

    expect(driver.createContext).toHaveBeenCalledTimes(1)
    const executeCall = (mockContext.execute as any).mock.calls[0][0]
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

    await tool.execute({ typescriptCode: 'return 1' })

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

    const result = await tool.execute({ typescriptCode: 'return 42' })
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

    const result = await tool.execute({ typescriptCode: 'return x' })
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

    // Invalid syntax that esbuild will reject — stripTypeScript now throws
    const result = await tool.execute({
      typescriptCode: 'const x: = invalid{{{syntax',
    })
    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('TypeScriptError')
  })

  it('emits code_mode:execution_started event', async () => {
    const { driver } = createMockDriver()
    const emitCustomEvent = vi.fn()

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    await tool.execute({ typescriptCode: 'return 1' }, { emitCustomEvent })

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
    const emitCustomEvent = vi.fn()

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    await tool.execute({ typescriptCode: 'return null' }, { emitCustomEvent })

    const consoleEvents = emitCustomEvent.mock.calls.filter(
      (c: any) => c[0] === 'code_mode:console',
    )

    expect(consoleEvents).toHaveLength(4)
    expect(consoleEvents[0][1]).toEqual(
      expect.objectContaining({ level: 'log', message: 'hello' }),
    )
    expect(consoleEvents[1][1]).toEqual(
      expect.objectContaining({ level: 'error', message: 'bad' }),
    )
    expect(consoleEvents[2][1]).toEqual(
      expect.objectContaining({ level: 'warn', message: 'careful' }),
    )
    expect(consoleEvents[3][1]).toEqual(
      expect.objectContaining({ level: 'info', message: 'fyi' }),
    )
  })

  it('getSkillBindings merges dynamic bindings into context', async () => {
    const { driver, mockContext } = createMockDriver()

    const skillBinding = {
      name: 'skill_greet',
      description: 'Greet someone',
      inputSchema: { type: 'object' },
      execute: vi.fn().mockResolvedValue('hi'),
    }

    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
      getSkillBindings: async () => ({ skill_greet: skillBinding }),
    })

    await tool.execute({ typescriptCode: 'return 1' })

    const contextConfig = (driver.createContext as any).mock.calls[0][0]
    expect(contextConfig.bindings).toHaveProperty('skill_greet')
    expect(contextConfig.bindings).toHaveProperty('external_fetchWeather')
  })

  it('returns validation error for empty/non-string input', async () => {
    const { driver } = createMockDriver()
    const tool = createCodeModeTool({
      driver,
      tools: [createMockTool('fetchWeather')],
    })

    const result = await tool.execute({ typescriptCode: '' })
    expect(result.success).toBe(false)
    expect(result.error?.name).toBe('ValidationError')
  })
})
