import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { TextOptions, Tool } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {}
class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

const completionsDone = {
  id: 'response-1',
  model,
  choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }],
}
const responsesDone = {
  type: 'response.completed',
  response: {
    id: 'response-1',
    model,
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'message-1',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Done', annotations: [] }],
      },
    ],
  },
}

const apis = [
  {
    api: 'Chat Completions',
    adapter: (client: OpenAI) => new Completions(model, 'openai', client),
    sse: `data: ${JSON.stringify(completionsDone)}\n\ndata: [DONE]\n\n`,
    namedChoice: { type: 'function', function: { name: 'lookup_weather' } },
  },
  {
    api: 'Responses',
    adapter: (client: OpenAI) => new Responses(model, 'openai', client),
    sse: `data: ${JSON.stringify(responsesDone)}\n\n`,
    namedChoice: { type: 'function', name: 'lookup_weather' },
  },
]

/** Runs one streaming call and returns the JSON body sent over HTTP. */
async function sentBody(
  { adapter, sse }: (typeof apis)[number],
  request: Pick<TextOptions, 'tools' | 'toolChoice' | 'modelOptions'>,
) {
  let body: unknown
  const client = new OpenAI({
    apiKey: 'test-key',
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(sse, {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  for await (const _ of adapter(client).chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'Weather in Paris?' }],
    ...request,
  })) {
    // drain
  }
  return body
}

describe.each(apis)('$api tool_choice', (api) => {
  it.each(['auto', 'none', 'required'] as const)(
    'sends %s as is',
    async (choice) => {
      const body = await sentBody(api, {
        tools: [weatherTool],
        toolChoice: choice,
      })
      expect(body).toHaveProperty('tool_choice', choice)
    },
  )

  it('sends a named tool as a function choice', async () => {
    const body = await sentBody(api, {
      tools: [weatherTool],
      toolChoice: { type: 'tool', name: 'lookup_weather' },
    })
    expect(body).toHaveProperty('tool_choice', api.namedChoice)
  })

  it('lets a tool_choice in modelOptions win', async () => {
    const body = await sentBody(api, {
      tools: [weatherTool],
      toolChoice: 'required',
      modelOptions: { tool_choice: 'none' },
    })
    expect(body).toHaveProperty('tool_choice', 'none')
  })

  it('sends no tool_choice when the request has no tools', async () => {
    const body = await sentBody(api, { toolChoice: 'required' })
    expect(body).not.toHaveProperty('tool_choice')
  })
})
