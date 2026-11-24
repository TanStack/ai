import { describe, expect, it } from 'vitest'
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

describe("createDiscoveryTool — catalog 'search'", () => {
  const lazyB = toolDefinition({
    name: 'sendEmail',
    description: 'Send an email.',
    inputSchema: z.object({ to: z.string() }),
    lazy: true,
  }).server(async () => ({}))

  it('lists no names', () => {
    const tool = createDiscoveryTool([lazyA, lazyB], { catalog: 'search' })
    expect(tool.description).not.toContain('fetchStocks')
    expect(tool.description).not.toContain('sendEmail')
  })

  it('returns type stubs for the functions that match a query', async () => {
    const tool = createDiscoveryTool([lazyA, lazyB], { catalog: 'search' })
    const result = await tool.execute!({ query: 'stock prices' })
    expect(result.tools.map((t) => t.name)).toEqual(['external_fetchStocks'])
    expect(result.tools[0]!.typeStub).toContain(
      'declare function external_fetchStocks',
    )
    expect(result.errors).toBeUndefined()
  })

  it('says when nothing matches, without listing the functions', async () => {
    const tool = createDiscoveryTool([lazyA, lazyB], { catalog: 'search' })
    const result = await tool.execute!({ query: 'weather' })
    expect(result.tools).toEqual([])
    expect(result.errors?.[0]).toContain("No functions match 'weather'")
    const unknown = await tool.execute!({ toolNames: ['nope'] })
    expect(unknown.errors?.[0]).not.toContain('fetchStocks')
  })

  it('still resolves exact names', async () => {
    const tool = createDiscoveryTool([lazyA, lazyB], { catalog: 'search' })
    const result = await tool.execute!({ toolNames: ['external_sendEmail'] })
    expect(result.tools.map((t) => t.name)).toEqual(['external_sendEmail'])
  })

  it('returns an error when called with no query and no names', async () => {
    const tool = createDiscoveryTool([lazyA, lazyB], { catalog: 'search' })
    const result = await tool.execute!({})
    expect(result.tools).toEqual([])
    expect(result.errors?.[0]).toContain('Pass a query or toolNames.')
  })
})
