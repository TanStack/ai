import { describe, expect, it } from 'vitest'
import { convertFunctionToolToResponsesFormat } from '../src/adapters/responses-tool-converter'
import { convertFunctionToolToChatCompletionsFormat } from '../src/adapters/chat-completions-tool-converter'
import { convertFunctionToolToAdapterFormat } from '../src/tools/function-tool'
import type { Tool } from '@tanstack/ai'

/** A schema fully inside OpenAI's strict Structured Outputs subset. */
const strictSafeTool: Tool = {
  name: 'get_user',
  description: 'Get a user',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
}

/**
 * Mirrors a Notion-style MCP schema: uses `$defs` + `oneOf` (outside the strict
 * subset) plus an unsupported `format`. With `strict: true` OpenAI 400s the
 * whole request, so the converter must fall back to `strict: false`.
 */
const gnarlyTool: Tool = {
  name: 'API-get-user',
  description: 'Notion get user',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: { type: 'string', format: 'uuid' },
      site: { type: 'string', format: 'uri' },
    },
    required: ['user_id'],
    $defs: {
      parent: {
        oneOf: [
          { type: 'object', properties: { page_id: { type: 'string' } } },
        ],
      },
    },
  } as unknown as Tool['inputSchema'],
}

const freeFormMapTool: Tool = {
  name: 'store_labels',
  description: 'Store arbitrary labels',
  inputSchema: {
    type: 'object',
    properties: {
      labels: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['labels'],
  },
}

describe('responses tool converter — strict fallback', () => {
  it('uses strict:true for strict-subset schemas', () => {
    const out = convertFunctionToolToResponsesFormat(strictSafeTool)
    expect(out.strict).toBe(true)
    expect(
      (out.parameters as Record<string, unknown>).additionalProperties,
    ).toBe(false)
  })

  it('falls back to strict:false for schemas with unsupported keywords', () => {
    const out = convertFunctionToolToResponsesFormat(gnarlyTool)
    expect(out.strict).toBe(false)
    // Schema is preserved (not corrupted) so the tool stays callable...
    const params = out.parameters as any
    expect(params.$defs.parent.oneOf).toBeDefined()
    // ...but unsupported `format` keywords are still stripped.
    expect(params.properties.site.format).toBeUndefined()
    expect(params.properties.user_id.format).toBe('uuid')
  })

  it('falls back to strict:false without closing free-form maps', () => {
    const out = convertFunctionToolToResponsesFormat(freeFormMapTool)
    expect(out.strict).toBe(false)
    expect(
      (out.parameters as any).properties.labels.additionalProperties,
    ).toEqual({ type: 'string' })
  })

})

describe('chat-completions tool converter — strict fallback', () => {
  it('uses strict:true for strict-subset schemas', () => {
    const out = convertFunctionToolToChatCompletionsFormat(strictSafeTool)
    expect(out.function.strict).toBe(true)
  })

  it('falls back to strict:false for schemas with unsupported keywords', () => {
    const out = convertFunctionToolToChatCompletionsFormat(gnarlyTool)
    expect(out.function.strict).toBe(false)
    const params = out.function.parameters as any
    expect(params.$defs.parent.oneOf).toBeDefined()
    expect(params.properties.site.format).toBeUndefined()
  })

  it('falls back to strict:false for free-form maps', () => {
    const out = convertFunctionToolToChatCompletionsFormat(freeFormMapTool)
    expect(out.function.strict).toBe(false)
  })

})

// This is the converter the provider tool-dispatcher (`convertToolsToProviderFormat`)
// actually uses for MCP / function tools on the Responses + Chat Completions
// adapters, so the same strict fallback must apply here.
describe('function-tool adapter converter — strict fallback', () => {
  it('uses strict:true for strict-subset schemas', () => {
    const out = convertFunctionToolToAdapterFormat(strictSafeTool)
    expect(out.strict).toBe(true)
    expect(
      (out.parameters as Record<string, unknown>).additionalProperties,
    ).toBe(false)
  })

  it('falls back to strict:false for schemas with unsupported keywords', () => {
    const out = convertFunctionToolToAdapterFormat(gnarlyTool)
    expect(out.strict).toBe(false)
    // Schema is preserved (not corrupted) so the tool stays callable...
    const params = out.parameters as any
    expect(params.$defs.parent.oneOf).toBeDefined()
    // ...but unsupported `format` keywords are still stripped.
    expect(params.properties.site.format).toBeUndefined()
    expect(params.properties.user_id.format).toBe('uuid')
  })

  it('falls back to strict:false for free-form maps', () => {
    const out = convertFunctionToolToAdapterFormat(freeFormMapTool)
    expect(out.strict).toBe(false)
  })

})
