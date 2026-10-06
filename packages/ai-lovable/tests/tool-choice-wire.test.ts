import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { LovableTextAdapter } from '../src/adapters/text'
import { LovableResponsesTextAdapter } from '../src/adapters/responses-text'
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
  modelOptions?: { tool_choice: 'none' }
}

// The Lovable options types have no `tool_choice`, so it is added here.
type WithToolChoice = { tool_choice?: 'none' }

type Send = (
  fetch: typeof globalThis.fetch,
  request: ToolRequest,
) => AsyncIterable<unknown>

const adapters = [
  {
    adapter: 'Chat Completions',
    namedChoice: { type: 'function', function: { name: 'lookup_weather' } },
    send: (fetch, request) =>
      new LovableTextAdapter<typeof model, WithToolChoice>(
        { apiKey: 'test-key', fetch },
        model,
      ).chatStream({ logger, model, messages, ...request }),
  },
  {
    adapter: 'Responses',
    namedChoice: { type: 'function', name: 'lookup_weather' },
    send: (fetch, request) =>
      new LovableResponsesTextAdapter<typeof model, WithToolChoice>(
        { apiKey: 'test-key', fetch },
        model,
      ).chatStream({ logger, model, messages, ...request }),
  },
] satisfies Array<{ adapter: string; send: Send }>

/** Runs one streaming call and returns the JSON body sent over HTTP. */
async function sentBody(send: Send, request: ToolRequest) {
  let body: unknown
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  for await (const _ of send(fetch, request)) {
    // drain
  }
  return body
}

describe.each(adapters)(
  'lovable $adapter tool_choice',
  ({ send, namedChoice }) => {
    it('sends required as is', async () => {
      const body = await sentBody(send, {
        tools: [weatherTool],
        toolChoice: 'required',
      })
      expect(body).toHaveProperty('tool_choice', 'required')
    })

    it('sends a named tool as a function choice', async () => {
      const body = await sentBody(send, {
        tools: [weatherTool],
        toolChoice: { type: 'tool', name: 'lookup_weather' },
      })
      expect(body).toHaveProperty('tool_choice', namedChoice)
    })

    it('lets a tool_choice in modelOptions win', async () => {
      const body = await sentBody(send, {
        tools: [weatherTool],
        toolChoice: 'required',
        modelOptions: { tool_choice: 'none' },
      })
      expect(body).toHaveProperty('tool_choice', 'none')
    })

    it('sends no tool_choice when the request has no tools', async () => {
      const body = await sentBody(send, { toolChoice: 'required' })
      expect(body).toHaveProperty('model', model)
      expect(body).not.toHaveProperty('tool_choice')
    })
  },
)
