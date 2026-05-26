import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  createEventAwareBindings,
  toolToBinding,
  toolsToBindings,
} from '../src/bindings/tool-to-binding'

function createMockServerTool(name: string, description = 'A test tool') {
  const def = toolDefinition({
    name: name as any,
    description,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  })
  return def.server(async (input: any) => ({
    result: `response to ${input.query}`,
  }))
}

describe('toolToBinding', () => {
  it('converts ServerTool to ToolBinding with correct fields', () => {
    const tool = createMockServerTool('fetchData')
    const binding = toolToBinding(tool)

    expect(binding.name).toBe('fetchData')
    expect(binding.description).toBe('A test tool')
    expect(binding.inputSchema).toBeDefined()
    expect(binding.execute).toBeTypeOf('function')
  })

  it('applies prefix to binding name', () => {
    const tool = createMockServerTool('fetchData')
    const binding = toolToBinding(tool, 'external_')

    expect(binding.name).toBe('external_fetchData')
  })

  it('throws for ToolDefinition without execute', () => {
    const def = toolDefinition({
      name: 'noExec' as any,
      description: 'No execute',
      inputSchema: z.object({ x: z.string() }),
    })

    expect(() => toolToBinding(def)).toThrow('.server(fn)')
  })

  it('execute function calls through to the tool', async () => {
    const tool = createMockServerTool('fetchData')
    const binding = toolToBinding(tool)

    const result = await binding.execute({ query: 'test' })
    expect(result).toEqual({ result: 'response to test' })
  })
})

describe('toolsToBindings', () => {
  it('converts multiple tools, keyed by prefixed name', () => {
    const tool1 = createMockServerTool('fetchWeather')
    const tool2 = createMockServerTool('dbQuery')

    const bindings = toolsToBindings([tool1, tool2], 'external_')

    expect(Object.keys(bindings)).toEqual([
      'external_fetchWeather',
      'external_dbQuery',
    ])
    expect(bindings['external_fetchWeather']!.name).toBe(
      'external_fetchWeather',
    )
    expect(bindings['external_dbQuery']!.name).toBe('external_dbQuery')
  })

  it('returns empty object for empty array', () => {
    const bindings = toolsToBindings([])
    expect(bindings).toEqual({})
  })
})

describe('createEventAwareBindings', () => {
  function makeBinding(name: string) {
    return {
      name,
      description: 'test',
      inputSchema: {},
      execute: vi.fn().mockResolvedValue('ok'),
    }
  }

  it('emits code_mode:external_call before execution', async () => {
    const emitCustomEvent = vi.fn()
    const binding = makeBinding('external_fetch')
    const wrapped = createEventAwareBindings(
      { external_fetch: binding },
      emitCustomEvent,
    )

    await wrapped['external_fetch']!.execute({ q: 'test' })

    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_call',
      expect.objectContaining({
        function: 'external_fetch',
        args: { q: 'test' },
        timestamp: expect.any(Number),
      }),
    )
  })

  it('emits code_mode:external_result after success with duration', async () => {
    const emitCustomEvent = vi.fn()
    const binding = makeBinding('external_fetch')
    const wrapped = createEventAwareBindings(
      { external_fetch: binding },
      emitCustomEvent,
    )

    await wrapped['external_fetch']!.execute({})

    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_result',
      expect.objectContaining({
        function: 'external_fetch',
        result: 'ok',
        duration: expect.any(Number),
      }),
    )
  })

  it('emits code_mode:external_error on failure and re-throws', async () => {
    const emitCustomEvent = vi.fn()
    const error = new Error('network fail')
    const binding = makeBinding('external_fetch')
    binding.execute.mockRejectedValue(error)

    const wrapped = createEventAwareBindings(
      { external_fetch: binding },
      emitCustomEvent,
    )

    await expect(wrapped['external_fetch']!.execute({})).rejects.toThrow(
      'network fail',
    )

    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_error',
      expect.objectContaining({
        function: 'external_fetch',
        error: 'network fail',
        duration: expect.any(Number),
      }),
    )
  })

  it('event data includes function name, args, and timestamps', async () => {
    const emitCustomEvent = vi.fn()
    const binding = makeBinding('external_search')
    const wrapped = createEventAwareBindings(
      { external_search: binding },
      emitCustomEvent,
    )

    await wrapped['external_search']!.execute({ term: 'hello' })

    const callEvent = emitCustomEvent.mock.calls[0]!
    expect(callEvent[0]).toBe('code_mode:external_call')
    expect(callEvent[1].function).toBe('external_search')
    expect(callEvent[1].args).toEqual({ term: 'hello' })
    expect(typeof callEvent[1].timestamp).toBe('number')
  })
})
