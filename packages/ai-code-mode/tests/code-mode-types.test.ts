import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { createCodeMode } from '../src/create-code-mode'
import type { CodeModeTool, IsolateDriver } from '../src/types'

const driver: IsolateDriver = {
  createContext: async () => ({
    execute: async () => ({ success: true }),
    dispose: async () => {},
  }),
}

const tool = toolDefinition({
  name: 'search',
  description: 'Search',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
})

describe('Code Mode tool types', () => {
  it('accepts server tools', () => {
    const serverTool = tool.server(async ({ query }) => ({ result: query }))

    expectTypeOf(serverTool).toMatchTypeOf<CodeModeTool>()
    createCodeMode({ driver, tools: [serverTool] })
  })

  it('rejects client tools', () => {
    const clientTool = tool.client(async ({ query }) => ({ result: query }))

    // @ts-expect-error - Code Mode requires server tools for sandbox execution.
    createCodeMode({ driver, tools: [clientTool] })
  })
})
