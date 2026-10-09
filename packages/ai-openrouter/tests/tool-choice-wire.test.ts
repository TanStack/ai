import { describe, expect, it } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenRouterTextAdapter } from '../src/adapters/text'
import { OpenRouterResponsesTextAdapter } from '../src/adapters/responses-text'
import type { ModelMessage, Tool, ToolChoice } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'openai/gpt-5.5'
const messages: Array<ModelMessage> = [
  { role: 'user', content: 'Weather in Paris?' },
]
const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

interface ToolRequest {
  tools?: Array<Tool>
  toolChoice?: ToolChoice
  modelOptions?: { toolChoice: 'none' }
}

/**
 * Runs one streaming call through the real SDK and returns the JSON body
 * sent over HTTP.
 */
async function sentBody(
  api: 'chat' | 'responses',
  request: ToolRequest,
): Promise<unknown> {
  let body: unknown
  const httpClient = new HTTPClient({
    fetcher: async (input) => {
      if (!(input instanceof Request)) throw new Error('Missing SDK request')
      body = JSON.parse(await input.text())
      return new Response('', {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  const config = { apiKey: 'test-key', httpClient }
  const options = { logger, model, messages, ...request }
  const stream =
    api === 'chat'
      ? new OpenRouterTextAdapter(config, model).chatStream(options)
      : new OpenRouterResponsesTextAdapter(config, model).chatStream(options)
  for await (const _ of stream) {
    // drain
  }
  return body
}

const adapters = [
  {
    adapter: 'OpenRouterTextAdapter (Chat Completions)',
    api: 'chat',
    namedChoice: { type: 'function', function: { name: 'lookup_weather' } },
  },
  {
    adapter: 'OpenRouterResponsesTextAdapter (Responses)',
    api: 'responses',
    namedChoice: { type: 'function', name: 'lookup_weather' },
  },
] as const

describe.each(adapters)('$adapter tool_choice', ({ api, namedChoice }) => {
  it('sends required as is', async () => {
    const body = await sentBody(api, {
      tools: [weatherTool],
      toolChoice: 'required',
    })
    expect(body).toHaveProperty('tool_choice', 'required')
  })

  it('sends none as is', async () => {
    const body = await sentBody(api, {
      tools: [weatherTool],
      toolChoice: 'none',
    })
    expect(body).toHaveProperty('tool_choice', 'none')
  })

  it('sends a named tool as a function choice', async () => {
    const body = await sentBody(api, {
      tools: [weatherTool],
      toolChoice: { type: 'tool', name: 'lookup_weather' },
    })
    expect(body).toHaveProperty('tool_choice', namedChoice)
  })

  it('lets a toolChoice in modelOptions win', async () => {
    const body = await sentBody(api, {
      tools: [weatherTool],
      toolChoice: 'required',
      modelOptions: { toolChoice: 'none' },
    })
    expect(body).toHaveProperty('tool_choice', 'none')
  })

  it('sends no tool_choice when the request has no tools', async () => {
    const body = await sentBody(api, { toolChoice: 'required' })
    expect(body).toHaveProperty('model')
    expect(body).not.toHaveProperty('tool_choice')
  })
})
