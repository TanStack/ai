import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { createDiscoveryTool } from '../src/create-discovery-tool'

const lazyA = toolDefinition({
  name: 'fetchStocks',
  description: 'Get stock prices.',
  inputSchema: z.object({ ticker: z.string() }),
  outputSchema: z.object({ price: z.number() }),
  lazy: true,
}).server(async () => ({ price: 0 }))

describe('createDiscoveryTool', () => {
  it('names the tool discover_tools and lists discoverable names in its description', () => {
    const tool = createDiscoveryTool([lazyA])
    expect(tool.name).toBe('discover_tools')
    expect(tool.description).toContain('fetchStocks')
  })

  it('returns a TypeScript type stub + description for a known lazy tool', async () => {
    const tool = createDiscoveryTool([lazyA])
    const result = await tool.execute!({ toolNames: ['fetchStocks'] })
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0]!.name).toBe('external_fetchStocks')
    expect(result.tools[0]!.description).toBe('Get stock prices.')
    expect(result.tools[0]!.typeStub).toContain(
      'declare function external_fetchStocks',
    )
    expect(result.errors).toBeUndefined()
  })

  it('returns an error entry for an unknown name', async () => {
    const tool = createDiscoveryTool([lazyA])
    const result = await tool.execute!({ toolNames: ['nope'] })
    expect(result.tools).toHaveLength(0)
    expect(result.errors?.[0]).toContain("Unknown tool: 'nope'")
    expect(result.errors?.[0]).toContain('fetchStocks')
  })

  it('resolves names passed with the external_ prefix (the catalog form)', async () => {
    const tool = createDiscoveryTool([lazyA])
    const result = await tool.execute!({ toolNames: ['external_fetchStocks'] })
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0]!.name).toBe('external_fetchStocks')
    expect(result.errors).toBeUndefined()
  })

  it('honors lazyToolsConfig.includeDescription in its own catalog', () => {
    const namesOnly = createDiscoveryTool([lazyA])
    expect(namesOnly.description).toContain('external_fetchStocks')
    expect(namesOnly.description).not.toContain(
      'external_fetchStocks — Get stock prices.',
    )

    const withDesc = createDiscoveryTool([lazyA], {
      includeDescription: 'first-sentence',
    })
    expect(withDesc.description).toContain(
      'external_fetchStocks — Get stock prices.',
    )
  })
})
