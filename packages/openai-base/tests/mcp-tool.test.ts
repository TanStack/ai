import { describe, expect, it } from 'vitest'
import { convertMCPToolToAdapterFormat } from '../src/tools/mcp-tool'
import type { Tool } from '@tanstack/ai'

describe('convertMCPToolToAdapterFormat', () => {
  it('should always set type to mcp even if metadata contains a type field', () => {
    const tool: Tool = {
      name: 'mcp',
      description: 'test mcp tool',
      metadata: {
        type: 'not_mcp',
        server_url: 'https://example.com/mcp',
      },
    }

    const result = convertMCPToolToAdapterFormat(tool)
    expect(result.type).toBe('mcp')
  })

  it('should preserve metadata fields other than type', () => {
    const tool: Tool = {
      name: 'mcp',
      description: 'test mcp tool',
      metadata: {
        server_url: 'https://example.com/mcp',
        server_description: 'Test server',
      },
    }

    const result = convertMCPToolToAdapterFormat(tool)
    expect(result.type).toBe('mcp')
    expect(result.server_url).toBe('https://example.com/mcp')
  })
})
