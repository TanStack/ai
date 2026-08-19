import { describe, expect, it, vi } from 'vitest'
import {
  snippetsToBindings,
  snippetsToSimpleBindings,
} from '../src/snippets-to-bindings'
import { createMemorySnippetStorage } from '../src/storage/memory-storage'
import type { Snippet } from '../src/types'

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'id',
    name: 'sample',
    description: 'Sample snippet',
    code: 'return input.value * 2;',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    usageHints: [],
    dependsOn: [],
    trustLevel: 'untrusted',
    stats: { executions: 0, successRate: 0 },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('snippetsToBindings', () => {
  it('prefixes binding names with snippet_', () => {
    const storage = createMemorySnippetStorage([])
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'alpha' })],
      executeInSandbox: async () => undefined,
      storage,
    })
    expect(Object.keys(bindings)).toEqual(['snippet_alpha'])
  })

  it('serializes input via JSON.stringify into the wrapped code', async () => {
    const storage = createMemorySnippetStorage([])
    const executeInSandbox = vi.fn(async () => 'ok')
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x', code: 'return input;' })],
      executeInSandbox,
      storage,
    })

    await bindings['snippet_x']!.execute({ value: 42 })
    const call = executeInSandbox.mock.calls[0] as unknown as [string, unknown]
    expect(call[0]).toContain('const input = {"value":42}')
    expect(call[0]).toContain('return input;')
    expect(call[1]).toEqual({ value: 42 })
  })

  it('emits snippet_call then snippet_result events on success', async () => {
    const storage = createMemorySnippetStorage([])
    const emitCustomEvent = vi.fn()
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x' })],
      executeInSandbox: async () => 42,
      storage,
      context: { emitCustomEvent } as any,
    })

    await bindings['snippet_x']!.execute({})

    const eventNames = emitCustomEvent.mock.calls.map(([name]) => name)
    expect(eventNames).toEqual([
      'code_mode:snippet_call',
      'code_mode:snippet_result',
    ])
  })

  it('emits snippet_error when sandbox execution throws, and re-throws', async () => {
    const storage = createMemorySnippetStorage([])
    const emitCustomEvent = vi.fn()
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x' })],
      executeInSandbox: async () => {
        throw new Error('boom')
      },
      storage,
      context: { emitCustomEvent } as any,
    })

    await expect(bindings['snippet_x']!.execute({})).rejects.toThrow('boom')
    const eventNames = emitCustomEvent.mock.calls.map(([name]) => name)
    expect(eventNames).toContain('code_mode:snippet_error')
  })

  it('updates storage stats with success=true on success', async () => {
    const storage = createMemorySnippetStorage([
      makeSnippet({ name: 'x', stats: { executions: 0, successRate: 0 } }),
    ])
    const updateStats = vi.spyOn(storage, 'updateStats')
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x' })],
      executeInSandbox: async () => 1,
      storage,
    })

    await bindings['snippet_x']!.execute({})
    expect(updateStats).toHaveBeenCalledWith('x', true)
  })

  it('updates storage stats with success=false on failure', async () => {
    const storage = createMemorySnippetStorage([makeSnippet({ name: 'x' })])
    const updateStats = vi.spyOn(storage, 'updateStats')
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x' })],
      executeInSandbox: async () => {
        throw new Error('fail')
      },
      storage,
    })

    await expect(bindings['snippet_x']!.execute({})).rejects.toThrow()
    expect(updateStats).toHaveBeenCalledWith('x', false)
  })

  it('does not reject if storage.updateStats fails', async () => {
    const storage = createMemorySnippetStorage([makeSnippet({ name: 'x' })])
    storage.updateStats = async () => {
      throw new Error('stats broke')
    }
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x' })],
      executeInSandbox: async () => 'ok',
      storage,
    })

    await expect(bindings['snippet_x']!.execute({})).resolves.toBe('ok')
  })

  it('serializes string inputs as JSON strings (prevents code injection via input)', async () => {
    const storage = createMemorySnippetStorage([])
    const executeInSandbox = vi.fn(async () => null)
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x', code: 'return input;' })],
      executeInSandbox,
      storage,
    })

    // Adversarial payload: attempts to escape the wrapping const-declaration
    const malicious = `"); throw new Error("escaped"); ("`
    await bindings['snippet_x']!.execute(malicious)

    const wrappedCode = (
      executeInSandbox.mock.calls[0] as unknown as [string, unknown]
    )[0]
    // JSON.stringify quotes & escapes the whole thing — it becomes a string literal
    expect(wrappedCode).toContain(`const input = ${JSON.stringify(malicious)}`)
    // Ensure the raw payload is not present unquoted
    expect(wrappedCode).not.toContain(
      `const input = "); throw new Error("escaped"); ("`,
    )
  })

  it('forwards the configured input through to executeInSandbox unchanged', async () => {
    const storage = createMemorySnippetStorage([])
    const executeInSandbox = vi.fn(async () => 'ok')
    const bindings = snippetsToBindings({
      snippets: [makeSnippet({ name: 'x' })],
      executeInSandbox,
      storage,
    })

    const input = { complex: { nested: [1, 2] } }
    await bindings['snippet_x']!.execute(input)
    expect(
      (executeInSandbox.mock.calls[0] as unknown as [string, unknown])[1],
    ).toBe(input)
  })
})

describe('snippetsToSimpleBindings', () => {
  it('prefixes names with snippet_', () => {
    const bindings = snippetsToSimpleBindings([makeSnippet({ name: 'alpha' })])
    expect(Object.keys(bindings)).toEqual(['snippet_alpha'])
  })

  it('exposes metadata without executing anything', () => {
    const snippet = makeSnippet({
      name: 'meta',
      description: 'desc',
      inputSchema: { type: 'string' },
      outputSchema: { type: 'number' },
    })
    const bindings = snippetsToSimpleBindings([snippet])
    expect(bindings['snippet_meta']!.name).toBe('snippet_meta')
    expect(bindings['snippet_meta']!.description).toBe('desc')
    expect(bindings['snippet_meta']!.inputSchema).toEqual({ type: 'string' })
    expect(bindings['snippet_meta']!.outputSchema).toEqual({ type: 'number' })
  })

  it('execute() throws because execution is not available in this mode', async () => {
    const bindings = snippetsToSimpleBindings([makeSnippet({ name: 'x' })])
    await expect(bindings['snippet_x']!.execute({})).rejects.toThrow(
      /not available for execution/,
    )
  })
})
