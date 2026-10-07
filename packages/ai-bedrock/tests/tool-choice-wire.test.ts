import { describe, expect, it } from 'vitest'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../src/adapters/converse-text'
import { createBedrockChat } from '../src/adapters/text'
import { createBedrockResponsesText } from '../src/adapters/responses-text'
import type { ModelMessage, TextOptions, Tool, ToolChoice } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const messages: Array<ModelMessage> = [
  { role: 'user', content: 'Weather in Paris?' },
]
const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}
// A finished tool call. Converse gets a `toolUse` and a `toolResult` block.
const toolHistory: Array<ModelMessage> = [
  ...messages,
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'lookup_weather', arguments: '{"location":"Paris"}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'call_1', content: 'Sunny' },
]
const named: ToolChoice = { type: 'tool', name: 'lookup_weather' }
const forcedChoices: Array<{ label: string; toolChoice: ToolChoice }> = [
  { label: 'required', toolChoice: 'required' },
  { label: 'a named tool', toolChoice: named },
]

// Not Claude: takes a forced tool.
const nova = 'us.amazon.nova-pro-v1:0'
// Older Claude: takes a forced tool, and thinks when `reasoning` asks for it.
const sonnet45 = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
// Claude models that reject a forced tool on every request, in the id shapes
// Bedrock uses (plain, regional, and global inference profiles).
const noForcedToolModels = [
  'anthropic.claude-opus-5-5-v1:0',
  'us.anthropic.claude-sonnet-5-5-v1:0',
  'global.anthropic.claude-fable-5-1-v1:0',
  'eu.anthropic.claude-mythos-5-1-v1:0',
]

type ConverseRequest = Partial<
  Pick<TextOptions, 'messages' | 'tools' | 'toolChoice' | 'reasoning'>
>

/**
 * Runs one Converse stream call through the installed AWS SDK and returns the
 * model id and the JSON body that the SDK sent over HTTP.
 */
async function converseRequest(model: string, request: ConverseRequest) {
  let path = ''
  let body: unknown
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    maxAttempts: 1,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: {
      async handle(sent: { body?: unknown; path: string }) {
        path = sent.path
        body = JSON.parse(String(sent.body))
        throw new Error('Transport probe complete')
      },
    },
  })
  class WireAdapter extends BedrockConverseTextAdapter<typeof nova> {
    protected override async getClient(): Promise<BedrockRuntimeClient> {
      return client
    }
  }
  const adapter = new WireAdapter({ apiKey: 'test-key' }, nova)
  // The adapter type takes only catalog ids, and the Claude 5.x models are
  // not in the Bedrock catalog yet. So the test sets the id at runtime.
  Object.defineProperty(adapter, 'model', { value: model })
  try {
    for await (const _ of adapter.chatStream({
      logger,
      model,
      messages,
      ...request,
    })) {
      // drain: the probe ends the call with RUN_ERROR
    }
  } finally {
    client.destroy()
  }
  return { modelId: decodeURIComponent(path.split('/')[2] ?? ''), body }
}

async function converseBody(model: string, request: ConverseRequest) {
  return (await converseRequest(model, request)).body
}

interface Row {
  label: string
  toolChoice: ToolChoice
  expected: object
}

const forcedShapes: Array<Row> = [
  { label: 'auto', toolChoice: 'auto', expected: { auto: {} } },
  { label: 'required', toolChoice: 'required', expected: { any: {} } },
  {
    label: 'a named tool',
    toolChoice: named,
    expected: { tool: { name: 'lookup_weather' } },
  },
]

describe('Bedrock Converse toolChoice', () => {
  it.each(forcedShapes)(
    'sends $label on a model that is not Claude',
    async ({ toolChoice, expected }) => {
      const body = await converseBody(nova, {
        tools: [weatherTool],
        toolChoice,
      })
      expect(body).toHaveProperty('toolConfig.toolChoice', expected)
      expect(body).toHaveProperty(
        'toolConfig.tools.0.toolSpec.name',
        'lookup_weather',
      )
    },
  )

  it('sends auto when the request sets no toolChoice', async () => {
    const body = await converseBody(nova, { tools: [weatherTool] })
    expect(body).toHaveProperty('toolConfig.toolChoice', { auto: {} })
  })

  it('sends no tools and no toolConfig for none without tool history', async () => {
    const body = await converseBody(nova, {
      tools: [weatherTool],
      toolChoice: 'none',
    })
    expect(body).toHaveProperty('messages')
    expect(body).not.toHaveProperty('toolConfig')
  })

  // Bedrock rejects toolUse and toolResult blocks without a toolConfig.
  it('sends the tools with auto for none after a tool call', async () => {
    const body = await converseBody(nova, {
      messages: toolHistory,
      tools: [weatherTool],
      toolChoice: 'none',
    })
    expect(body).toHaveProperty(
      'messages.1.content.0.toolUse.name',
      'lookup_weather',
    )
    expect(body).toHaveProperty('messages.2.content.0.toolResult.toolUseId')
    expect(body).toHaveProperty('toolConfig.toolChoice', { auto: {} })
    expect(body).toHaveProperty(
      'toolConfig.tools.0.toolSpec.name',
      'lookup_weather',
    )
  })

  it('sends no toolConfig when the request has no tools', async () => {
    const body = await converseBody(nova, { toolChoice: 'required' })
    expect(body).toHaveProperty('messages')
    expect(body).not.toHaveProperty('toolConfig')
  })

  it('forces the tool on an older Claude model with thinking off', async () => {
    const body = await converseBody(sonnet45, {
      tools: [weatherTool],
      toolChoice: 'required',
    })
    expect(body).not.toHaveProperty('additionalModelRequestFields')
    expect(body).toHaveProperty('toolConfig.toolChoice', { any: {} })
  })

  it.each(forcedChoices)(
    'with thinking on an older Claude model, sends auto for $label',
    async ({ toolChoice }) => {
      const body = await converseBody(sonnet45, {
        tools: [weatherTool],
        toolChoice,
        reasoning: { level: 'high', summary: false },
      })
      expect(body).toHaveProperty(
        'additionalModelRequestFields.thinking.type',
        'enabled',
      )
      expect(body).toHaveProperty('toolConfig.toolChoice', { auto: {} })
    },
  )

  it('with thinking on an older Claude model, still sends no toolConfig for none', async () => {
    const body = await converseBody(sonnet45, {
      tools: [weatherTool],
      toolChoice: 'none',
      reasoning: { level: 'high', summary: false },
    })
    expect(body).toHaveProperty('additionalModelRequestFields')
    expect(body).not.toHaveProperty('toolConfig')
  })

  it.each(noForcedToolModels)(
    'on %s, sends auto for a forced choice',
    async (model) => {
      for (const { toolChoice } of forcedChoices) {
        const { modelId, body } = await converseRequest(model, {
          tools: [weatherTool],
          toolChoice,
        })
        expect(modelId).toBe(model)
        expect(body).not.toHaveProperty('additionalModelRequestFields')
        expect(body).toHaveProperty('toolConfig.toolChoice', { auto: {} })
      }
    },
  )

  it('on a Claude model that rejects a forced tool, sends no toolConfig for none', async () => {
    const body = await converseBody('us.anthropic.claude-opus-5-5-v1:0', {
      tools: [weatherTool],
      toolChoice: 'none',
    })
    expect(body).not.toHaveProperty('toolConfig')
  })

  it('on a Claude model that rejects a forced tool, sends auto for none after a tool call', async () => {
    const body = await converseBody('us.anthropic.claude-opus-5-5-v1:0', {
      messages: toolHistory,
      tools: [weatherTool],
      toolChoice: 'none',
    })
    expect(body).toHaveProperty('toolConfig.toolChoice', { auto: {} })
  })
})

// Bedrock rejects toolUse and toolResult blocks without a toolConfig. So a
// request with no tools sends the tool history as text.
describe('Bedrock Converse tool history in a request with no tools', () => {
  const noTools: Array<{ label: string; tools?: Array<Tool> }> = [
    { label: 'no tools' },
    { label: 'an empty tools list', tools: [] },
  ]

  it.each(noTools)(
    'sends the tool blocks as text for $label',
    async ({ tools }) => {
      const history = structuredClone(toolHistory)
      const body = await converseBody(nova, { messages: history, tools })
      expect(body).not.toHaveProperty('toolConfig')
      expect(body).toHaveProperty('messages', [
        { role: 'user', content: [{ text: 'Weather in Paris?' }] },
        {
          role: 'assistant',
          content: [
            { text: '[Tool call lookup_weather({"location":"Paris"})]' },
          ],
        },
        {
          role: 'user',
          content: [{ text: '[Tool result for lookup_weather: Sunny]' }],
        },
      ])
      // Only the provider input changes. The transcript stays the same.
      expect(history).toEqual(toolHistory)
    },
  )

  it('keeps an image of a tool result as an image block', async () => {
    const png = 'iVBORw0KGgo='
    const body = await converseBody(nova, {
      messages: [
        ...toolHistory.slice(0, 2),
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [
            { type: 'text', content: 'Radar map' },
            {
              type: 'image',
              source: { type: 'data', value: png, mimeType: 'image/png' },
            },
          ],
        },
      ],
    })
    expect(body).not.toHaveProperty('toolConfig')
    expect(body).toHaveProperty('messages.2', {
      role: 'user',
      content: [
        { text: '[Tool result for lookup_weather: Radar map]' },
        { image: { format: 'png', source: { bytes: png } } },
      ],
    })
  })
})

// The Bedrock OpenAI-compatible adapters inherit the openai-base mapping.
const gptOss = 'openai.gpt-oss-120b-1:0'

interface OpenAIRequest {
  tools?: Array<Tool>
  toolChoice?: ToolChoice
  modelOptions?: { tool_choice: 'none' }
}

type Send = (
  fetch: typeof globalThis.fetch,
  request: OpenAIRequest,
) => AsyncIterable<unknown>

const openaiAdapters = [
  {
    adapter: 'Bedrock Chat Completions',
    namedChoice: { type: 'function', function: { name: 'lookup_weather' } },
    send: (fetch, request) =>
      createBedrockChat(gptOss, 'test-key', { fetch }).chatStream({
        logger,
        model: gptOss,
        messages,
        ...request,
      }),
  },
  {
    adapter: 'Bedrock Responses',
    namedChoice: { type: 'function', name: 'lookup_weather' },
    send: (fetch, request) =>
      createBedrockResponsesText(gptOss, 'test-key', { fetch }).chatStream({
        logger,
        model: gptOss,
        messages,
        ...request,
      }),
  },
] satisfies Array<{ adapter: string; namedChoice: object; send: Send }>

/** Runs one streaming call and returns the JSON body sent over HTTP. */
async function openaiBody(send: Send, request: OpenAIRequest) {
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

describe.each(openaiAdapters)(
  '$adapter tool_choice',
  ({ send, namedChoice }) => {
    it('sends required as is', async () => {
      const body = await openaiBody(send, {
        tools: [weatherTool],
        toolChoice: 'required',
      })
      expect(body).toHaveProperty('tool_choice', 'required')
    })

    it('sends a named tool as a function choice', async () => {
      const body = await openaiBody(send, {
        tools: [weatherTool],
        toolChoice: named,
      })
      expect(body).toHaveProperty('tool_choice', namedChoice)
    })

    it('lets a tool_choice in modelOptions win', async () => {
      const body = await openaiBody(send, {
        tools: [weatherTool],
        toolChoice: 'required',
        modelOptions: { tool_choice: 'none' },
      })
      expect(body).toHaveProperty('tool_choice', 'none')
    })

    it('sends no tool_choice when the request has no tools', async () => {
      const body = await openaiBody(send, { toolChoice: 'required' })
      expect(body).toHaveProperty('model')
      expect(body).not.toHaveProperty('tool_choice')
    })
  },
)
