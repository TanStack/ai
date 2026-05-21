import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  WEB_FETCH_TOOL_KIND,
  convertWebFetchToolToAdapterFormat,
  isWebFetchTool,
  webFetchTool,
} from '../src/tools/web-fetch-tool'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import type { Tool } from '@tanstack/ai'

describe('webFetchTool()', () => {
  it('produces a branded tool whose metadata carries the SDK parameters', () => {
    const tool = webFetchTool({
      engine: 'native',
      maxContentTokens: 4000,
      allowedDomains: ['example.com'],
      blockedDomains: ['evil.example'],
      maxUses: 3,
    })
    expect(tool.name).toBe('web_fetch')
    expect((tool.metadata as { __kind?: string }).__kind).toBe(
      WEB_FETCH_TOOL_KIND,
    )
    expect(tool.metadata).toMatchObject({
      parameters: {
        engine: 'native',
        maxContentTokens: 4000,
        allowedDomains: ['example.com'],
        blockedDomains: ['evil.example'],
        maxUses: 3,
      },
    })
  })

  it('accepts a no-options call (parameters omitted from metadata)', () => {
    const tool = webFetchTool()
    expect(isWebFetchTool(tool as unknown as Tool)).toBe(true)
    expect((tool.metadata as { parameters?: unknown }).parameters).toBeUndefined()
  })
})

describe('isWebFetchTool()', () => {
  it('returns true only for webFetchTool() outputs', () => {
    expect(isWebFetchTool(webFetchTool() as unknown as Tool)).toBe(true)
  })

  it('returns false for user-defined function tools', () => {
    const userTool = toolDefinition({
      name: 'echo',
      description: '',
      inputSchema: z.object({ msg: z.string() }),
    }).server(async ({ msg }) => msg)
    expect(isWebFetchTool(userTool)).toBe(false)
  })

  it('returns false for tools with the wrong kind brand', () => {
    const fake: Tool = {
      name: 'web_fetch',
      description: '',
      metadata: { __kind: 'openrouter.web_search' },
    }
    expect(isWebFetchTool(fake)).toBe(false)
  })
})

describe('convertWebFetchToolToAdapterFormat()', () => {
  it('emits the openrouter:web_fetch wire shape with parameters preserved', () => {
    const wireShape = convertWebFetchToolToAdapterFormat(
      webFetchTool({
        engine: 'exa',
        maxContentTokens: 2000,
      }) as unknown as Tool,
    )
    expect(wireShape).toEqual({
      type: 'openrouter:web_fetch',
      parameters: {
        engine: 'exa',
        maxContentTokens: 2000,
      },
    })
  })

  it('omits parameters when the factory was called with no options', () => {
    const wireShape = convertWebFetchToolToAdapterFormat(
      webFetchTool() as unknown as Tool,
    )
    expect(wireShape).toEqual({ type: 'openrouter:web_fetch' })
  })

  it('throws on a tool missing the brand marker', () => {
    const unbranded: Tool = {
      name: 'web_fetch',
      description: '',
      metadata: { parameters: {} },
    }
    expect(() => convertWebFetchToolToAdapterFormat(unbranded)).toThrow(
      /not a valid webFetchTool/,
    )
  })
})

describe('convertToolsToProviderFormat()', () => {
  it('routes webFetchTool() to the openrouter:web_fetch wire branch', () => {
    const out = convertToolsToProviderFormat([
      webFetchTool({ engine: 'openrouter' }) as unknown as Tool,
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      type: 'openrouter:web_fetch',
      parameters: { engine: 'openrouter' },
    })
  })

  it('passes through function tools unchanged alongside webFetchTool()', () => {
    const userTool = toolDefinition({
      name: 'echo',
      description: '',
      inputSchema: z.object({ msg: z.string() }),
    }).server(async ({ msg }) => msg)
    const out = convertToolsToProviderFormat([
      userTool,
      webFetchTool() as unknown as Tool,
    ])
    expect(out).toHaveLength(2)
    expect((out[0] as { type: string }).type).toBe('function')
    expect((out[1] as { type: string }).type).toBe('openrouter:web_fetch')
  })
})
