import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GrokTextAdapter } from '../src/adapters/text'
import { grokVertexText } from '../src/vertex'
import type { ModelMessage, Tool, ToolChoice } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'grok-4.3'
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
  modelOptions?: { tool_choice: 'none' }
}

/** Drains one chat stream and returns the JSON body sent over HTTP. */
async function sentBody(
  send: (fetch: typeof globalThis.fetch) => AsyncIterable<unknown>,
) {
  let body: unknown
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  for await (const _ of send(fetch)) {
    // drain
  }
  return body
}

/** The JSON body that the xAI adapter sends for one request. */
function xaiBody(request: ToolRequest) {
  return sentBody((fetch) =>
    // The Grok options type has no `tool_choice`, so it is added here.
    new GrokTextAdapter<typeof model, { tool_choice?: 'none' }>(
      { apiKey: 'test-key', fetch },
      model,
    ).chatStream({ logger, model, messages, ...request }),
  )
}

describe('grokText tool_choice', () => {
  it('sends required as is', async () => {
    const body = await xaiBody({ tools: [weatherTool], toolChoice: 'required' })
    expect(body).toHaveProperty('tool_choice', 'required')
  })

  it('sends a named tool as a function choice', async () => {
    const body = await xaiBody({
      tools: [weatherTool],
      toolChoice: { type: 'tool', name: 'lookup_weather' },
    })
    expect(body).toHaveProperty('tool_choice', {
      type: 'function',
      name: 'lookup_weather',
    })
  })

  it('lets a tool_choice in modelOptions win', async () => {
    const body = await xaiBody({
      tools: [weatherTool],
      toolChoice: 'required',
      modelOptions: { tool_choice: 'none' },
    })
    expect(body).toHaveProperty('tool_choice', 'none')
  })

  it('sends no tool_choice when the request has no tools', async () => {
    const body = await xaiBody({ toolChoice: 'required' })
    expect(body).toHaveProperty('model', model)
    expect(body).not.toHaveProperty('tool_choice')
  })
})

describe('grokVertexText tool_choice', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends required as is', async () => {
    const body = await sentBody((fetch) => {
      // The Vertex adapter calls the global fetch.
      vi.stubGlobal('fetch', fetch)
      return grokVertexText(model, {
        baseURL: 'http://vertex.test/v1',
        getAccessToken: async () => 'vertex-token',
      }).chatStream({
        logger,
        model,
        messages,
        tools: [weatherTool],
        toolChoice: 'required',
      })
    })
    expect(body).toHaveProperty('tool_choice', 'required')
  })
})
