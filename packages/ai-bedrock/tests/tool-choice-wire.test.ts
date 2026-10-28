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
async function converseRequest(
  model: string,
  request: ConverseRequest,
  call: 'chat' | 'structured' = 'chat',
  outputSchema: object = {},
) {
  let path = ''
  let body: unknown
  let contentLengthMatches = false
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    maxAttempts: 1,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: {
      async handle(sent: {
        body?: unknown
        path: string
        headers: Record<string, string>
      }) {
        path = sent.path
        body = JSON.parse(String(sent.body))
        contentLengthMatches =
          Number(sent.headers['content-length']) ===
          Buffer.byteLength(String(sent.body))
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
  const options = { threadId: 'thread-1', logger, model, messages, ...request }
  try {
    if (call === 'structured') {
      // The probe makes the call throw after it records the body.
      await adapter
        .structuredOutput({ chatOptions: options, outputSchema })
        .catch(() => undefined)
    } else {
      for await (const _ of adapter.chatStream(options)) {
        // drain: the probe ends the call with RUN_ERROR
      }
    }
  } finally {
    client.destroy()
  }
  return {
    modelId: decodeURIComponent(path.split('/')[2] ?? ''),
    body,
    contentLengthMatches,
  }
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

  // Bedrock rejects toolUse and toolResult blocks without a toolConfig, so
  // the tool history goes out as text.
  it('sends no toolConfig for none after a tool call, with the history as text', async () => {
    const body = await converseBody(nova, {
      messages: toolHistory,
      tools: [weatherTool],
      toolChoice: 'none',
    })
    expect(body).not.toHaveProperty('toolConfig')
    expect(body).toHaveProperty(
      'messages.1.content.0.text',
      '[Tool call call_1 lookup_weather({"location":"Paris"})]',
    )
    expect(body).toHaveProperty(
      'messages.2.content.0.text',
      '[Tool result call_1: Sunny]',
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

  // Claude rejects a forced tool while thinking is on.
  it('sends no thinking on the forced structured-output tool', async () => {
    const { body } = await converseRequest(
      sonnet45,
      { reasoning: { level: 'high', summary: false } },
      'structured',
    )
    expect(body).not.toHaveProperty('additionalModelRequestFields')
    expect(body).toHaveProperty('toolConfig.toolChoice.tool.name')
  })

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

  it('on a Claude model that rejects a forced tool, sends no toolConfig for none after a tool call', async () => {
    const body = await converseBody('us.anthropic.claude-opus-5-5-v1:0', {
      messages: toolHistory,
      tools: [weatherTool],
      toolChoice: 'none',
    })
    expect(body).not.toHaveProperty('toolConfig')
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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

describe('Bedrock Converse documents', () => {
  it('keeps own keys named __proto__ in a tool schema and a tool input', async () => {
    const { body, contentLengthMatches } = await converseRequest(nova, {
      tools: [
        {
          name: 'inspect',
          description: 'Inspect a value',
          inputSchema: JSON.parse(
            '{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"]}',
          ),
        },
      ],
      messages: [
        { role: 'user', content: 'Inspect it' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'inspect', arguments: '{"__proto__":"value"}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', content: 'done' },
      ],
    })
    // The AWS SDK serializer drops these keys unless the adapter restores them.
    const wire = JSON.stringify(body)
    expect(wire).toContain('"properties":{"__proto__":{"type":"string"}}')
    expect(wire).toContain('"input":{"__proto__":"value"}')
    // The restored body is longer, so it must be in place before the SDK
    // sets Content-Length.
    expect(contentLengthMatches).toBe(true)
  })

  it('keeps an own key named __proto__ in a structured output schema', async () => {
    const { body, contentLengthMatches } = await converseRequest(
      nova,
      {},
      'structured',
      JSON.parse(
        '{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"]}',
      ),
    )
    expect(JSON.stringify(body)).toContain(
      '"properties":{"__proto__":{"type":"string"}}',
    )
    expect(contentLengthMatches).toBe(true)
  })
})
