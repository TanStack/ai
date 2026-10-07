import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenaiChat } from '../src/adapters/text'
import { createOpenaiChatCompletions } from '../src/adapters/text-chat-completions'
import { azureOpenaiText } from '../src/adapters/azure-text'
import { openaiCompatible } from '../src/compatible'
import type { ModelMessage, Tool, ToolChoice } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const messages: Array<ModelMessage> = [
  { role: 'user', content: 'Weather in Paris?' },
]
const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

const chatCompletionsChoice = {
  type: 'function',
  function: { name: 'lookup_weather' },
}
const responsesChoice = { type: 'function', name: 'lookup_weather' }

interface ToolRequest {
  tools?: Array<Tool>
  toolChoice?: ToolChoice
  modelOptions?: { tool_choice: 'none' }
}

/** The `chatStream` options of one call: one user message plus the tool fields. */
function callOptions(model: string, request: ToolRequest) {
  return { logger, model, messages, ...request }
}

/** An OpenAI-compatible provider on a test URL, for one API. */
function compatible(
  fetch: typeof globalThis.fetch,
  api: 'chat-completions' | 'responses',
) {
  return openaiCompatible({
    baseURL: 'https://compatible.test/v1',
    apiKey: 'test-key',
    models: ['my-model'],
    api,
    // A compat runs the request quirks, which edit the request body.
    compat: { supportsStore: false },
    fetch,
  })
}

type Send = (
  fetch: typeof globalThis.fetch,
  request: ToolRequest,
) => AsyncIterable<unknown>

const adapters = [
  {
    adapter: 'openaiText (Responses)',
    namedChoice: responsesChoice,
    send: (fetch, request) =>
      createOpenaiChat('gpt-5.5', 'test-key', { fetch }).chatStream(
        callOptions('gpt-5.5', request),
      ),
  },
  {
    adapter: 'openaiChatCompletions',
    namedChoice: chatCompletionsChoice,
    send: (fetch, request) =>
      createOpenaiChatCompletions('gpt-5.5', 'test-key', { fetch }).chatStream(
        callOptions('gpt-5.5', request),
      ),
  },
  {
    adapter: 'azureOpenaiText',
    namedChoice: responsesChoice,
    send: (fetch, request) =>
      azureOpenaiText('gpt-5.5', {
        apiKey: 'test-key',
        resourceName: 'test-resource',
        fetch,
      }).chatStream(callOptions('gpt-5.5', request)),
  },
  {
    adapter: 'openaiCompatible (Chat Completions)',
    namedChoice: chatCompletionsChoice,
    send: (fetch, request) =>
      compatible(
        fetch,
        'chat-completions',
      )('my-model').chatStream(callOptions('my-model', request)),
  },
  {
    adapter: 'openaiCompatible (Responses)',
    namedChoice: responsesChoice,
    send: (fetch, request) =>
      compatible(
        fetch,
        'responses',
      )('my-model').chatStream(callOptions('my-model', request)),
  },
] satisfies Array<{ adapter: string; namedChoice: object; send: Send }>

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

describe.each(adapters)('$adapter tool_choice', ({ send, namedChoice }) => {
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
    expect(body).toHaveProperty('model')
    expect(body).not.toHaveProperty('tool_choice')
  })
})
