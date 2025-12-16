import { describe, it, expect } from 'vitest'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import { convertCustomToolToAdapterFormat } from '../src/tools/custom-tool'
import type { Tool } from '@tanstack/ai'
import { z } from 'zod'

describe('Tool Converter', () => {
  // T024: Unit test for tool definition conversion
  describe('convertToolsToProviderFormat', () => {
    it('should convert a simple tool to SDK format', () => {
      const tools: Tool[] = [
        {
          name: 'get_weather',
          description: 'Get weather for a location',
          inputSchema: z.object({
            location: z.string().describe('City name'),
          }),
        },
      ]

      const result = convertToolsToProviderFormat(tools)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'get_weather',
        type: 'custom',
        description: 'Get weather for a location',
        input_schema: {
          type: 'object',
          properties: expect.objectContaining({
            location: expect.objectContaining({
              type: 'string',
              description: 'City name',
            }),
          }),
          required: ['location'],
        },
        cache_control: null,
      })
    })

    it('should convert multiple tools', () => {
      const tools: Tool[] = [
        {
          name: 'tool1',
          description: 'First tool',
          inputSchema: z.object({ a: z.string() }),
        },
        {
          name: 'tool2',
          description: 'Second tool',
          inputSchema: z.object({ b: z.number() }),
        },
      ]

      const result = convertToolsToProviderFormat(tools)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('tool1')
      expect(result[1].name).toBe('tool2')
    })

    it('should convert tool with optional parameters', () => {
      const tools: Tool[] = [
        {
          name: 'search',
          description: 'Search for items',
          inputSchema: z.object({
            query: z.string(),
            limit: z.number().optional(),
          }),
        },
      ]

      const result = convertToolsToProviderFormat(tools)

      expect(result[0].input_schema.required).toEqual(['query'])
      expect(result[0].input_schema.properties).toHaveProperty('query')
      expect(result[0].input_schema.properties).toHaveProperty('limit')
    })

    it('should handle empty tools array', () => {
      const result = convertToolsToProviderFormat([])
      expect(result).toEqual([])
    })
  })

  describe('convertCustomToolToAdapterFormat', () => {
    it('should convert tool with nested object schema', () => {
      const tool: Tool = {
        name: 'create_user',
        description: 'Create a new user',
        inputSchema: z.object({
          user: z.object({
            name: z.string(),
            email: z.string(),
          }),
        }),
      }

      const result = convertCustomToolToAdapterFormat(tool)

      expect(result.name).toBe('create_user')
      expect(result.type).toBe('custom')
      expect(result.input_schema.properties).toHaveProperty('user')
    })

    it('should convert tool with array schema', () => {
      const tool: Tool = {
        name: 'process_items',
        description: 'Process multiple items',
        inputSchema: z.object({
          items: z.array(z.string()),
        }),
      }

      const result = convertCustomToolToAdapterFormat(tool)

      expect(result.input_schema.properties).toHaveProperty('items')
    })

    it('should preserve cache control from metadata', () => {
      const tool: Tool = {
        name: 'cached_tool',
        description: 'A cached tool',
        inputSchema: z.object({ input: z.string() }),
        metadata: {
          cacheControl: { type: 'ephemeral' as const },
        },
      }

      const result = convertCustomToolToAdapterFormat(tool)

      expect(result.cache_control).toEqual({ type: 'ephemeral' })
    })

    it('should handle tool with enum parameter', () => {
      const tool: Tool = {
        name: 'set_mode',
        description: 'Set operation mode',
        inputSchema: z.object({
          mode: z.enum(['light', 'dark', 'auto']),
        }),
      }

      const result = convertCustomToolToAdapterFormat(tool)

      expect(result.input_schema.properties).toHaveProperty('mode')
    })
  })
})
