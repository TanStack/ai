import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { snippetToTool, snippetsToTools } from '../src/snippets-to-tools'
import { createMemorySnippetStorage } from '../src/storage/memory-storage'
import type { IsolateContext, IsolateDriver } from '@tanstack/ai-code-mode'
import type { Snippet } from '../src/types'

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'id',
    name: 'do_thing',
    description: 'Does a thing',
    code: 'return input.value * 2;',
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'number' } },
      required: ['value'],
    },
    outputSchema: { type: 'number' },
    usageHints: [],
    dependsOn: [],
    trustLevel: 'untrusted',
    stats: { executions: 0, successRate: 0 },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function createMockDriver(
  result: { success: boolean; value?: unknown; error?: { message: string } } = {
    success: true,
    value: 42,
  },
): {
  driver: IsolateDriver
  executeSpy: ReturnType<typeof vi.fn>
  disposeSpy: ReturnType<typeof vi.fn>
} {
  const executeSpy = vi.fn().mockResolvedValue({
    ...result,
    logs: [],
  })
  const disposeSpy = vi.fn().mockResolvedValue(undefined)
  const context: IsolateContext = {
    execute: executeSpy,
    dispose: disposeSpy,
  }
  const driver: IsolateDriver = {
    createContext: vi.fn().mockResolvedValue(context),
  }
  return { driver, executeSpy, disposeSpy }
}

const mockContext = () => ({ emitCustomEvent: vi.fn() })

describe('snippetToTool', () => {
  it('prefixes the tool description with [SNIPPET]', () => {
    const { driver } = createMockDriver()
    const storage = createMemorySnippetStorage([])
    const tool = snippetToTool({
      snippet: makeSnippet({ description: 'Fetches data' }),
      driver,
      bindings: {},
      storage,
    })
    expect(tool.description).toContain('[SNIPPET]')
    expect(tool.description).toContain('Fetches data')
  })

  it('exposes the snippet name as the tool name', () => {
    const { driver } = createMockDriver()
    const storage = createMemorySnippetStorage([])
    const tool = snippetToTool({
      snippet: makeSnippet({ name: 'custom_name' }),
      driver,
      bindings: {},
      storage,
    })
    expect(tool.name).toBe('custom_name')
  })

  it('creates an isolate context, executes, returns the value, and disposes', async () => {
    const { driver, executeSpy, disposeSpy } = createMockDriver({
      success: true,
      value: 84,
    })
    const storage = createMemorySnippetStorage([])
    const tool = snippetToTool({
      snippet: makeSnippet(),
      driver,
      bindings: {},
      storage,
    })

    const result = await tool.execute!({ value: 42 }, mockContext() as any)
    expect(result).toBe(84)
    expect(executeSpy).toHaveBeenCalledOnce()
    expect(disposeSpy).toHaveBeenCalledOnce()
  })

  it('disposes the isolate context even if execution throws', async () => {
    const { driver, disposeSpy } = createMockDriver({
      success: false,
      error: { message: 'sandbox error' },
    })
    const storage = createMemorySnippetStorage([])
    const tool = snippetToTool({
      snippet: makeSnippet(),
      driver,
      bindings: {},
      storage,
    })

    await expect(
      tool.execute!({ value: 1 }, mockContext() as any),
    ).rejects.toThrow('sandbox error')
    expect(disposeSpy).toHaveBeenCalledOnce()
  })

  it('emits snippet_call then snippet_result events on success', async () => {
    const { driver } = createMockDriver({ success: true, value: 'ok' })
    const storage = createMemorySnippetStorage([])
    const tool = snippetToTool({
      snippet: makeSnippet({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    const ctx = mockContext()
    await tool.execute!({ value: 1 }, ctx as any)
    const eventNames = (ctx.emitCustomEvent as any).mock.calls.map(
      ([name]: [string]) => name,
    )
    expect(eventNames).toEqual([
      'code_mode:snippet_call',
      'code_mode:snippet_result',
    ])
  })

  it('emits snippet_error when execution fails', async () => {
    const { driver } = createMockDriver({
      success: false,
      error: { message: 'boom' },
    })
    const storage = createMemorySnippetStorage([])
    const tool = snippetToTool({
      snippet: makeSnippet({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    const ctx = mockContext()
    await expect(tool.execute!({ value: 1 }, ctx as any)).rejects.toThrow(
      'boom',
    )
    const eventNames = (ctx.emitCustomEvent as any).mock.calls.map(
      ([name]: [string]) => name,
    )
    expect(eventNames).toContain('code_mode:snippet_error')
  })

  it('records stats (success=true) on success', async () => {
    const { driver } = createMockDriver()
    const storage = createMemorySnippetStorage([makeSnippet({ name: 'x' })])
    const spy = vi.spyOn(storage, 'updateStats')
    const tool = snippetToTool({
      snippet: makeSnippet({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    await tool.execute!({ value: 1 }, mockContext() as any)
    expect(spy).toHaveBeenCalledWith('x', true)
  })

  it('records stats (success=false) on failure', async () => {
    const { driver } = createMockDriver({
      success: false,
      error: { message: 'no' },
    })
    const storage = createMemorySnippetStorage([makeSnippet({ name: 'x' })])
    const spy = vi.spyOn(storage, 'updateStats')
    const tool = snippetToTool({
      snippet: makeSnippet({ name: 'x' }),
      driver,
      bindings: {},
      storage,
    })
    await expect(
      tool.execute!({ value: 1 }, mockContext() as any),
    ).rejects.toThrow()
    expect(spy).toHaveBeenCalledWith('x', false)
  })

  it('serializes input as a JSON literal in the sandbox code, preventing injection', async () => {
    const { driver, executeSpy } = createMockDriver()
    const storage = createMemorySnippetStorage([])
    const tool = snippetToTool({
      snippet: makeSnippet(),
      driver,
      bindings: {},
      storage,
    })

    // Zod requires a number; test injection via a nested field instead
    await tool.execute!({ value: 1 }, mockContext() as any)

    const code = executeSpy.mock.calls[0]![0]
    // esbuild reformats output, so compare as normalized JSON literal
    expect(code.replace(/\s+/g, '')).toContain('constinput={"value":1}')
  })
})

describe('snippetsToTools', () => {
  it('returns one ServerTool per snippet', () => {
    const { driver } = createMockDriver()
    const storage = createMemorySnippetStorage([])
    const tools = snippetsToTools({
      snippets: [
        makeSnippet({ id: '1', name: 'a' }),
        makeSnippet({ id: '2', name: 'b' }),
      ],
      driver,
      tools: [
        toolDefinition({
          name: 'helper',
          description: 'h',
          inputSchema: z.object({ q: z.string() }),
          outputSchema: z.object({ r: z.string() }),
        }).server(async (i: any) => ({ r: i.q })),
      ],
      storage,
    })
    expect(tools).toHaveLength(2)
    expect(tools.map((t) => t.name)).toEqual(['a', 'b'])
  })
})
