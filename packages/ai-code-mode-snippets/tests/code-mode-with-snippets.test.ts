import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { codeModeWithSnippets } from '../src/code-mode-with-snippets'
import { createMemorySnippetStorage } from '../src/storage/memory-storage'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { IsolateDriver, ToolBinding } from '@tanstack/ai-code-mode'
import type { Snippet } from '../src/types'

const snippet: Snippet = {
  id: 'id',
  name: 'load',
  description: 'Loads data',
  code: 'return await external_fetchData({})',
  inputSchema: {},
  outputSchema: {},
  usageHints: [],
  dependsOn: [],
  trustLevel: 'untrusted',
  stats: { executions: 0, successRate: 0 },
  createdAt: '',
  updatedAt: '',
}

describe('codeModeWithSnippets', () => {
  it('passes the abort signal and runtime context through snippet_* to external_* calls', async () => {
    const fetchData = vi.fn().mockResolvedValue('ok')
    const tool = toolDefinition({
      name: 'fetchData',
      description: 'Fetch data',
      inputSchema: z.object({}),
    }).server(fetchData)

    // Each sandbox calls the first binding that its code needs:
    // execute_typescript calls snippet_load, and the snippet calls external_fetchData.
    const driver: IsolateDriver = {
      createContext: async ({ bindings }) => ({
        execute: vi.fn().mockImplementation(async () => {
          const binding: ToolBinding | undefined =
            bindings['snippet_load'] ?? bindings['external_fetchData']
          return { success: true, value: await binding!.execute({}), logs: [] }
        }),
        dispose: async () => {},
      }),
    }

    const { toolsRegistry } = await codeModeWithSnippets({
      config: { driver, tools: [tool] },
      adapter: {} as AnyTextAdapter,
      snippets: { storage: createMemorySnippetStorage([snippet]) },
      messages: [],
    })
    const controller = new AbortController()

    await toolsRegistry.get('execute_typescript')!.execute!(
      { typescriptCode: 'return await snippet_load({})' },
      {
        emitCustomEvent: vi.fn(),
        abortSignal: controller.signal,
        context: { userId: 'u1' },
      },
    )

    expect(fetchData).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        abortSignal: controller.signal,
        context: { userId: 'u1' },
      }),
    )
  })
})
