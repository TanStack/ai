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
  it('produces a branded tool with snake_case wire keys', () => {
    const tool = webFetchTool({
      engine: 'native',
      maxContentTokens: 4000,
      allowedDomains: ['example.com'],
      blockedDomains: ['evil.example'],
    })
    expect(tool.name).toBe('web_fetch')
    expect((tool.metadata as { __kind?: string }).__kind).toBe(
      WEB_FETCH_TOOL_KIND,
    )
    expect(tool.metadata).toMatchObject({
      type: 'web_fetch',
      web_fetch: {
        engine: 'native',
        max_content_tokens: 4000,
        allowed_domains: ['example.com'],
        blocked_domains: ['evil.example'],
      },
    })
  })

  it('accepts a no-options call (all fields optional)', () => {
    const tool = webFetchTool()
    expect(isWebFetchTool(tool as unknown as Tool)).toBe(true)
    expect((tool.metadata as { web_fetch: unknown }).web_fetch).toEqual({
      engine: undefined,
      max_content_tokens: undefined,
      allowed_domains: undefined,
      blocked_domains: undefined,
    })
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
  it('returns the OpenRouter wire shape for a valid branded tool', () => {
    const wireShape = convertWebFetchToolToAdapterFormat(
      webFetchTool({ engine: 'exa', maxContentTokens: 2000 }) as unknown as Tool,
    )
    expect(wireShape).toEqual({
      type: 'web_fetch',
      web_fetch: {
        engine: 'exa',
        max_content_tokens: 2000,
        allowed_domains: undefined,
        blocked_domains: undefined,
      },
    })
  })

  it('throws on a tool missing the brand marker', () => {
    const unbranded: Tool = {
      name: 'web_fetch',
      description: '',
      metadata: { type: 'web_fetch', web_fetch: {} },
    }
    expect(() => convertWebFetchToolToAdapterFormat(unbranded)).toThrow(
      /not a valid webFetchTool/,
    )
  })

  it('throws on a tool with mismatched metadata.type', () => {
    const wrongType: Tool = {
      name: 'web_fetch',
      description: '',
      metadata: {
        __kind: WEB_FETCH_TOOL_KIND,
        type: 'web_search',
        web_fetch: {},
      },
    }
    expect(() => convertWebFetchToolToAdapterFormat(wrongType)).toThrow()
  })
})

describe('convertToolsToProviderFormat()', () => {
  it('routes webFetchTool() to the web_fetch wire branch', () => {
    const out = convertToolsToProviderFormat([
      webFetchTool({ engine: 'openrouter' }) as unknown as Tool,
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      type: 'web_fetch',
      web_fetch: { engine: 'openrouter' },
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
    expect((out[1] as { type: string }).type).toBe('web_fetch')
  })
})
