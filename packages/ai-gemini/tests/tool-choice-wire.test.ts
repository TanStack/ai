import { describe, expect, it, vi } from 'vitest'
import { FunctionCallingConfigMode } from '@google/genai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGeminiChat } from '../src/adapters/text'
import { googleSearchTool } from '../src/tools'
import type { TextOptions, Tool, ToolChoice } from '@tanstack/ai'
import type { GeminiTextProviderOptions } from '../src/adapters/text'

const logger = resolveDebugOption(false)
const model = 'gemini-3.1-pro-preview'

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

const sse = `data: ${JSON.stringify({
  candidates: [
    {
      content: { role: 'model', parts: [{ text: 'Done' }] },
      finishReason: 'STOP',
    },
  ],
})}\n\n`

type CallOptions = Pick<
  TextOptions<GeminiTextProviderOptions>,
  'tools' | 'toolChoice' | 'modelOptions'
>

/**
 * Runs one streaming call through the real SDK and returns the JSON body
 * sent over HTTP. Vertex runs in express mode, so it needs only an API key.
 */
async function sentBody(options: CallOptions, config: { vertexai?: boolean }) {
  let body: unknown
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(sse, {
        headers: { 'content-type': 'text/event-stream' },
      })
    })
  try {
    const adapter = createGeminiChat(model, 'test-key', config)
    for await (const _ of adapter.chatStream({
      logger,
      model,
      messages: [{ role: 'user', content: 'Weather in Paris?' }],
      ...options,
    })) {
      // drain
    }
  } finally {
    fetch.mockRestore()
  }
  return body
}

interface Row {
  label: string
  toolChoice: ToolChoice
  expected: object
}

const shapes: Array<Row> = [
  { label: 'auto', toolChoice: 'auto', expected: { mode: 'AUTO' } },
  { label: 'none', toolChoice: 'none', expected: { mode: 'NONE' } },
  { label: 'required', toolChoice: 'required', expected: { mode: 'ANY' } },
  {
    label: 'a named tool',
    toolChoice: { type: 'tool', name: 'lookup_weather' },
    expected: { mode: 'ANY', allowedFunctionNames: ['lookup_weather'] },
  },
]

describe('Gemini toolConfig.functionCallingConfig', () => {
  it.each(shapes)('sends $label', async ({ toolChoice, expected }) => {
    const body = await sentBody({ tools: [weatherTool], toolChoice }, {})
    expect(body).toHaveProperty('toolConfig', {
      functionCallingConfig: expected,
    })
  })

  it('sends a named tool on Vertex', async () => {
    const body = await sentBody(
      {
        tools: [weatherTool],
        toolChoice: { type: 'tool', name: 'lookup_weather' },
      },
      { vertexai: true },
    )
    expect(body).toHaveProperty('toolConfig', {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['lookup_weather'],
      },
    })
  })

  it('sends no toolConfig when the request has no tools', async () => {
    const body = await sentBody({ toolChoice: 'required' }, {})
    expect(body).toHaveProperty('contents')
    expect(body).not.toHaveProperty('toolConfig')
  })

  it('sends no toolConfig when the request has only provider tools', async () => {
    const body = await sentBody(
      { tools: [googleSearchTool()], toolChoice: 'required' },
      {},
    )
    expect(body).toHaveProperty('tools', [{ googleSearch: {} }])
    expect(body).not.toHaveProperty('toolConfig')
  })

  it('lets a functionCallingConfig in modelOptions win', async () => {
    const body = await sentBody(
      {
        tools: [weatherTool],
        toolChoice: 'required',
        modelOptions: {
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
          },
        },
      },
      {},
    )
    expect(body).toHaveProperty('toolConfig', {
      functionCallingConfig: { mode: 'NONE' },
    })
  })

  it('keeps the mapped mode next to a retrievalConfig in modelOptions', async () => {
    const body = await sentBody(
      {
        tools: [weatherTool],
        toolChoice: 'required',
        modelOptions: {
          toolConfig: { retrievalConfig: { languageCode: 'en' } },
        },
      },
      {},
    )
    expect(body).toHaveProperty('toolConfig', {
      functionCallingConfig: { mode: 'ANY' },
      retrievalConfig: { languageCode: 'en' },
    })
  })
})
