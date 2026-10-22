import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  createEventAwareBindings,
  toolToBinding,
  toolsToBindings,
} from '../src/bindings/tool-to-binding'
import type {
  CodeModeCallHook,
  ToolBinding,
  ToolExecutionContext,
} from '../src/types'

function createMockServerTool<TName extends string>(
  name: TName,
  description = 'A test tool',
) {
  const def = toolDefinition({
    name,
    description,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  })
  return def.server(async (input) => ({
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
      name: 'noExec',
      description: 'No execute',
      inputSchema: z.object({ x: z.string() }),
    })

    // @ts-expect-error - bare definitions are rejected by the Code Mode API.
    expect(() => toolToBinding(def)).toThrow('server tools')
  })

  it('execute function calls through to the tool', async () => {
    const tool = createMockServerTool('fetchData')
    const binding = toolToBinding(tool)

    const result = await binding.execute({ query: 'test' })
    expect(result).toEqual({ result: 'response to test' })
  })

  it('validates input against the tool schema and throws an agent-readable error', async () => {
    const tool = createMockServerTool('fetchData')
    const binding = toolToBinding(tool)

    await expect(binding.execute({ query: 123 })).rejects.toThrow(
      /Input validation failed for tool fetchData/,
    )
  })

  it('coerces/defaults input via the schema before calling execute', async () => {
    const def = toolDefinition({
      name: 'withDefault',
      description: 'has a defaulted field',
      inputSchema: z.object({ n: z.number().default(7) }),
      outputSchema: z.object({ n: z.number() }),
    })
    const execute = vi.fn(async (input: { n?: number }) => ({ n: input.n! }))
    const binding = toolToBinding(def.server(execute))

    const result = await binding.execute({})
    expect(execute).toHaveBeenCalledWith({ n: 7 }, undefined)
    expect(result).toEqual({ n: 7 })
  })

  it('validates output against the tool schema', async () => {
    const def = toolDefinition({
      name: 'badOutput',
      description: 'returns the wrong shape',
      inputSchema: z.object({}),
      outputSchema: z.object({ result: z.string() }),
    })
    // @ts-expect-error - deliberately returns a non-conforming value
    const binding = toolToBinding(def.server(async () => ({ result: 123 })))

    await expect(binding.execute({})).rejects.toThrow(
      /Output validation failed for tool badOutput/,
    )
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
  /** Wraps one `external_fetch` binding whose `execute` resolves 'ok'. */
  function wrapBinding(
    options: {
      parentContext?: ToolExecutionContext
      hook?: CodeModeCallHook
    } = {},
  ) {
    const emitCustomEvent = vi.fn<ToolExecutionContext['emitCustomEvent']>()
    const execute = vi.fn<ToolBinding['execute']>().mockResolvedValue('ok')
    const bindings = {
      external_fetch: {
        name: 'external_fetch',
        description: 'test',
        inputSchema: {},
        execute,
      },
    }
    const wrapped = createEventAwareBindings(
      bindings,
      emitCustomEvent,
      options.parentContext,
      options.hook,
    )
    return { emitCustomEvent, execute, wrapped: wrapped['external_fetch']! }
  }

  it('emits code_mode:external_call before execution', async () => {
    const { emitCustomEvent, wrapped } = wrapBinding()

    await wrapped.execute({ q: 'test' })

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
    const { emitCustomEvent, wrapped } = wrapBinding()

    await wrapped.execute({})

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
    const { emitCustomEvent, execute, wrapped } = wrapBinding()
    execute.mockRejectedValue(new Error('network fail'))

    await expect(wrapped.execute({})).rejects.toThrow('network fail')

    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_error',
      expect.objectContaining({
        function: 'external_fetch',
        error: 'network fail',
        duration: expect.any(Number),
      }),
    )
  })

  it('passes the parent abortSignal, threadId, and context, not its toolCallId or inputResponse', async () => {
    const controller = new AbortController()
    const { emitCustomEvent, execute, wrapped } = wrapBinding({
      parentContext: {
        toolCallId: 'parent-call',
        threadId: 'thread-1',
        abortSignal: controller.signal,
        context: { userId: 'u1' },
        inputResponse: { status: 'cancelled' },
        emitCustomEvent: vi.fn(),
      },
    })

    await wrapped.execute({})

    const ctx = execute.mock.calls[0]![1]
    expect(ctx?.abortSignal).toBe(controller.signal)
    expect(ctx?.context).toEqual({ userId: 'u1' })
    expect(ctx?.threadId).toBe('thread-1')
    expect(ctx?.toolCallId).toBeUndefined()
    expect(ctx?.inputResponse).toBeUndefined()
    // The wrapper's emitCustomEvent is the one the binding gets.
    expect(ctx?.emitCustomEvent).toBe(emitCustomEvent)
  })

  it('builds a context with no threadId when there is no parent context', async () => {
    const { emitCustomEvent, execute, wrapped } = wrapBinding()

    await wrapped.execute({})

    const ctx = execute.mock.calls[0]![1]
    expect(ctx?.emitCustomEvent).toBe(emitCustomEvent)
    expect(ctx?.threadId).toBeUndefined()
  })

  it('does not run the binding when the parent signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const { emitCustomEvent, execute, wrapped } = wrapBinding({
      parentContext: {
        threadId: 'thread-1',
        abortSignal: controller.signal,
        emitCustomEvent: vi.fn(),
      },
    })

    await expect(wrapped.execute({})).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(execute).not.toHaveBeenCalled()
    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_error',
      expect.objectContaining({ function: 'external_fetch' }),
    )
  })

  it('event data includes function name, args, and timestamps', async () => {
    const { emitCustomEvent, wrapped } = wrapBinding()

    await wrapped.execute({ term: 'hello' })

    const callEvent = emitCustomEvent.mock.calls[0]!
    expect(callEvent[0]).toBe('code_mode:external_call')
    expect(callEvent[1].function).toBe('external_fetch')
    expect(callEvent[1].args).toEqual({ term: 'hello' })
    expect(typeof callEvent[1].timestamp).toBe('number')
  })

  it('runs each call through the hook with the tool name and the args', async () => {
    const calls: Array<{ name: string; args: unknown }> = []
    const { emitCustomEvent, execute, wrapped } = wrapBinding({
      hook: (call, run) => {
        calls.push(call)
        return run()
      },
    })

    await expect(wrapped.execute({ q: 'test' })).resolves.toBe('ok')

    expect(calls).toEqual([{ name: 'fetch', args: { q: 'test' } }])
    expect(execute).toHaveBeenCalledWith(
      { q: 'test' },
      expect.objectContaining({ emitCustomEvent }),
    )
  })

  it('fails the call and emits code_mode:external_error when the hook refuses it', async () => {
    const { emitCustomEvent, execute, wrapped } = wrapBinding({
      hook: async () => {
        throw new Error('denied by a rule')
      },
    })

    await expect(wrapped.execute({})).rejects.toThrow('denied by a rule')

    expect(execute).not.toHaveBeenCalled()
    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_error',
      expect.objectContaining({
        function: 'external_fetch',
        error: 'denied by a rule',
      }),
    )
  })

  it('returns the result of the hook in place of the binding result', async () => {
    const { emitCustomEvent, execute, wrapped } = wrapBinding({
      hook: async () => 'stored result',
    })

    await expect(wrapped.execute({})).resolves.toBe('stored result')

    expect(execute).not.toHaveBeenCalled()
    expect(emitCustomEvent).toHaveBeenCalledWith(
      'code_mode:external_result',
      expect.objectContaining({
        function: 'external_fetch',
        result: 'stored result',
      }),
    )
  })
})
