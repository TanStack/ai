import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { createCodeMode } from '../src/create-code-mode'
import type { IsolateDriver, IsolateContext } from '../src/types'

function createMockDriver(): IsolateDriver {
  const mockContext: IsolateContext = {
    execute: vi.fn().mockResolvedValue({ success: true, value: 42, logs: [] }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  return {
    createContext: vi.fn().mockResolvedValue(mockContext),
  }
}

function createMockTool(name: string) {
  return toolDefinition({
    name: name as any,
    description: `The ${name} tool`,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  }).server(async (input: any) => ({ result: input.query }))
}

describe('createCodeMode', () => {
  it('returns an object with tool and systemPrompt keys', () => {
    const result = createCodeMode({
      driver: createMockDriver(),
      tools: [createMockTool('search')],
    })

    expect(result).toHaveProperty('tool')
    expect(result).toHaveProperty('systemPrompt')
    expect(typeof result.systemPrompt).toBe('string')
  })

  it('tool.name is execute_typescript', () => {
    const { tool } = createCodeMode({
      driver: createMockDriver(),
      tools: [createMockTool('search')],
    })

    expect(tool.name).toBe('execute_typescript')
  })

  it('systemPrompt contains execute_typescript and external_ prefixed tool names', () => {
    const { systemPrompt } = createCodeMode({
      driver: createMockDriver(),
      tools: [createMockTool('search'), createMockTool('fetchData')],
    })

    expect(systemPrompt).toContain('execute_typescript')
    expect(systemPrompt).toContain('external_search')
    expect(systemPrompt).toContain('external_fetchData')
  })

  it('throws on empty tools array', () => {
    expect(() =>
      createCodeMode({
        driver: createMockDriver(),
        tools: [],
      }),
    ).toThrow('At least one tool must be provided')
  })
})
