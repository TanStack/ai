import { describe, expect, it, vi } from 'vitest'
import { createOpenRouterText } from '../src/adapters/text'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'
import {
  OPENROUTER_CHAT_MODELS,
  OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS,
} from '../src/model-meta'
import type { Tool } from '@tanstack/ai'

// The adapter constructor instantiates `new OpenRouter(config)`. Mock the SDK
// so construction succeeds; these tests only exercise request building
// (`mapOptionsToRequest`) and the capability gate, never an SDK call.
vi.mock('@openrouter/sdk', () => ({
  OpenRouter: class {
    chat = { send: () => undefined }
    beta = { responses: { send: () => undefined } }
  },
}))

// JSON Schema as the engine hands it to the adapter on the combined path.
const outputSchema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

const tools: Array<Tool> = [
  { name: 'lookup_weather', description: 'Return the forecast for a location' },
]

// `mapOptionsToRequest` is protected; reach it directly to assert the wire
// shape without standing up a full streaming round-trip.
type RequestBuilder = {
  mapOptionsToRequest: (options: Record<string, unknown>) => Record<string, any>
}

function buildChatRequest(model: string, modelOptions?: Record<string, unknown>) {
  const adapter = createOpenRouterText(
    model as 'openai/gpt-4o',
    'test-key',
  ) as unknown as RequestBuilder
  return adapter.mapOptionsToRequest({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    tools,
    outputSchema,
    ...(modelOptions ? { modelOptions } : {}),
  })
}

function buildResponsesRequest(model: string) {
  const adapter = createOpenRouterResponsesText(
    model as 'openai/gpt-4o',
    'test-key',
  ) as unknown as RequestBuilder
  return adapter.mapOptionsToRequest({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    tools,
    outputSchema,
  })
}

describe('OpenRouter combined tools + outputSchema (#612)', () => {
  describe('supportsCombinedToolsAndSchema gate', () => {
    it('returns true for combined-capable upstream models', () => {
      expect(
        createOpenRouterText(
          'anthropic/claude-sonnet-4.5',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createOpenRouterText('openai/gpt-4o', 'k').supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createOpenRouterText(
          'x-ai/grok-4.3',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
    })

    it('returns false for upstream models the upstream gate excludes', () => {
      // claude-opus-4.1 predates Anthropic combined mode (4.5+); gpt-4o-2024-05-13
      // predates strict json_schema — both have `responseFormat` in the catalog
      // but are deliberately excluded.
      expect(
        createOpenRouterText(
          'anthropic/claude-opus-4.1',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
      expect(
        createOpenRouterText(
          'openai/gpt-4o-2024-05-13',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
    })

    it('mirrors the gate on the Responses adapter', () => {
      expect(
        createOpenRouterResponsesText(
          'openai/gpt-4o',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createOpenRouterResponsesText(
          'openai/gpt-4o-2024-05-13',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
    })
  })

  describe('chat-completions request payload', () => {
    it('attaches responseFormat alongside tools on the combined path', () => {
      const req = buildChatRequest('openai/gpt-4o')
      expect(req.responseFormat).toEqual({
        type: 'json_schema',
        jsonSchema: {
          name: 'structured_output',
          schema: expect.any(Object),
          strict: true,
        },
      })
      expect(req.tools).toBeDefined()
      expect(req.tools.length).toBeGreaterThan(0)
    })

    it('omits responseFormat for an unsupported model (legacy finalization path)', () => {
      const req = buildChatRequest('anthropic/claude-opus-4.1')
      expect(req.responseFormat).toBeUndefined()
      // tools still flow — only the schema attachment is gated.
      expect(req.tools).toBeDefined()
    })

    it('keys capability off the bare model id, ignoring the :variant suffix', () => {
      const req = buildChatRequest('openai/gpt-4o', { variant: 'nitro' })
      expect(req.responseFormat).toBeDefined()
      // variant rides the model id, not the wire body.
      expect(req.model).toBe('openai/gpt-4o:nitro')
    })
  })

  describe('Responses request payload', () => {
    it('attaches text.format alongside tools on the combined path', () => {
      const req = buildResponsesRequest('openai/gpt-4o')
      expect(req.text).toEqual({
        format: {
          type: 'json_schema',
          name: 'structured_output',
          schema: expect.any(Object),
          strict: true,
        },
      })
      expect(req.tools).toBeDefined()
    })

    it('omits text.format for an unsupported model', () => {
      const req = buildResponsesRequest('openai/gpt-4o-2024-05-13')
      expect(req.text).toBeUndefined()
    })

    it('preserves caller-supplied text.* fields when attaching the schema format', () => {
      const adapter = createOpenRouterResponsesText(
        'openai/gpt-4o',
        'test-key',
      ) as unknown as RequestBuilder
      const req = adapter.mapOptionsToRequest({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema,
        modelOptions: { text: { verbosity: 'low' } },
      })
      // `text.format` carries the combined-mode schema; the caller's
      // `text.verbosity` rides alongside it rather than being clobbered.
      expect(req.text.verbosity).toBe('low')
      expect(req.text.format).toMatchObject({
        type: 'json_schema',
        name: 'structured_output',
        strict: true,
      })
    })
  })

  describe('set integrity', () => {
    it('every combined-mode id exists in the OpenRouter catalog', () => {
      const catalog = new Set<string>(OPENROUTER_CHAT_MODELS)
      for (const id of OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS) {
        expect(catalog.has(id), `${id} is not in OPENROUTER_CHAT_MODELS`).toBe(
          true,
        )
      }
    })
  })
})
