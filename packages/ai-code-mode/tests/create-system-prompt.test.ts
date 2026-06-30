import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { createCodeModeSystemPrompt } from '../src/create-system-prompt'
import type { IsolateDriver } from '../src/types'

function createMockTool(name: string, description = `The ${name} tool`) {
  const def = toolDefinition({
    name: name as any,
    description,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  })
  return def.server(async (input: any) => ({ result: input.query }))
}

const mockDriver: IsolateDriver = {
  createContext: async () => ({
    execute: async () => ({ success: true }),
    dispose: async () => {},
  }),
}

describe('createCodeModeSystemPrompt', () => {
  it('output mentions execute_typescript', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: mockDriver,
      tools: [createMockTool('fetchWeather')],
    })
    expect(prompt).toContain('execute_typescript')
  })

  it('all tool names appear with external_ prefix', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: mockDriver,
      tools: [createMockTool('fetchWeather'), createMockTool('dbQuery')],
    })
    expect(prompt).toContain('external_fetchWeather')
    expect(prompt).toContain('external_dbQuery')
  })

  it('contains TypeScript type stub code block', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: mockDriver,
      tools: [createMockTool('fetchWeather')],
    })
    expect(prompt).toContain('```typescript')
    expect(prompt).toContain('declare function external_fetchWeather')
  })

  it('contains expected sections', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: mockDriver,
      tools: [createMockTool('fetchWeather')],
    })
    expect(prompt).toContain('When to Use')
    expect(prompt).toContain('Available External APIs')
    expect(prompt).toContain('Important Notes')
  })

  it('documents multiple tools', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: mockDriver,
      tools: [
        createMockTool('fetchWeather', 'Get weather data'),
        createMockTool('searchDB', 'Search the database'),
      ],
    })
    expect(prompt).toContain('external_fetchWeather')
    expect(prompt).toContain('external_searchDB')
    expect(prompt).toContain('Get weather data')
    expect(prompt).toContain('Search the database')
  })
})

const eagerTool = toolDefinition({
  name: 'fetchWeather',
  description: 'Get current weather. Returns temperature.',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temp: z.number() }),
}).server(async () => ({ temp: 0 }))

const lazyTool = toolDefinition({
  name: 'fetchStocks',
  description: 'Get stock prices. Returns quotes.',
  inputSchema: z.object({ ticker: z.string() }),
  outputSchema: z.object({ price: z.number() }),
  lazy: true,
}).server(async () => ({ price: 0 }))

const driverStub = {
  createContext: async () => ({
    execute: async () => ({ success: true }),
    dispose: async () => {},
  }),
}

describe('createCodeModeSystemPrompt — lazy tools', () => {
  it('documents eager tools with full type stubs', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: driverStub,
      tools: [eagerTool, lazyTool],
    })
    expect(prompt).toContain('declare function external_fetchWeather')
  })

  it('does NOT emit type stubs for lazy tools', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: driverStub,
      tools: [eagerTool, lazyTool],
    })
    expect(prompt).not.toContain('declare function external_fetchStocks')
  })

  it('lists lazy tools in a Discoverable APIs section (names only by default)', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: driverStub,
      tools: [eagerTool, lazyTool],
    })
    expect(prompt).toContain('Discoverable APIs')
    expect(prompt).toContain('discover_tools')
    expect(prompt).toContain('external_fetchStocks')
    expect(prompt).not.toContain('external_fetchStocks — Get stock prices.')
  })

  it('includes first sentences in the catalog when configured', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: driverStub,
      tools: [eagerTool, lazyTool],
      lazyToolsConfig: { includeDescription: 'first-sentence' },
    })
    expect(prompt).toContain('external_fetchStocks — Get stock prices.')
  })

  it('omits the Discoverable APIs section when there are no lazy tools', () => {
    const prompt = createCodeModeSystemPrompt({
      driver: driverStub,
      tools: [eagerTool],
    })
    expect(prompt).not.toContain('Discoverable APIs')
  })
})
