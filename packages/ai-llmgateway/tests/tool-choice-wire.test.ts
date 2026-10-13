import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createLLMGatewayText } from '../src/adapters/text'
import type { ModelMessage, Tool, ToolChoice } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'gpt-5.6-terra'
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

/** Runs one streaming call and returns the JSON body sent over HTTP. */
async function sentBody(request: ToolRequest) {
  let body: unknown
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  const adapter = createLLMGatewayText(model, 'test-key', { fetch })
  for await (const _ of adapter.chatStream({
    logger,
    model,
    messages,
    ...request,
  })) {
    // drain
  }
  return body
}

describe('llmGatewayText tool_choice', () => {
  it('sends required as is', async () => {
    const body = await sentBody({
      tools: [weatherTool],
      toolChoice: 'required',
    })
    expect(body).toHaveProperty('tool_choice', 'required')
  })

  it('sends a named tool as a function choice', async () => {
    const body = await sentBody({
      tools: [weatherTool],
      toolChoice: { type: 'tool', name: 'lookup_weather' },
    })
    expect(body).toHaveProperty('tool_choice', {
      type: 'function',
      function: { name: 'lookup_weather' },
    })
  })

  it('lets a tool_choice in modelOptions win', async () => {
    const body = await sentBody({
      tools: [weatherTool],
      toolChoice: 'required',
      modelOptions: { tool_choice: 'none' },
    })
    expect(body).toHaveProperty('tool_choice', 'none')
  })

  it('sends no tool_choice when the request has no tools', async () => {
    const body = await sentBody({ toolChoice: 'required' })
    expect(body).toHaveProperty('model', model)
    expect(body).not.toHaveProperty('tool_choice')
  })
})
