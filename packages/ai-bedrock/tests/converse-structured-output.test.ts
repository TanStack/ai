import { describe, expect, it } from 'vitest'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../src/adapters/converse-text'
import type {
  ConverseCommandOutput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import type {
  AdapterYieldChunk,
  JSONSchema,
  ModelMessage,
  TextOptions,
} from '@tanstack/ai'

const logger = resolveDebugOption(false)
const messages: Array<ModelMessage> = [
  { role: 'user', content: 'Pick a city.' },
]
const schema: JSONSchema = {
  type: 'object',
  properties: { city: { type: 'string' } },
  required: ['city'],
}

// Not Claude: takes a forced tool.
const nova = 'us.amazon.nova-pro-v1:0'
// Older Claude: takes a forced tool, and thinks when `reasoning` asks for it.
const sonnet45 = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
// Claude models that reject a forced tool on every request.
const opus55 = 'us.anthropic.claude-opus-5-5-v1:0'
const noForcedToolModels = [
  'anthropic.claude-opus-5-5-v1:0',
  'us.anthropic.claude-sonnet-5-5-v1:0',
  'global.anthropic.claude-fable-5-1-v1:0',
  'eu.anthropic.claude-mythos-5-1-v1:0',
]

type Call = 'structuredOutput' | 'structuredOutputStream'
const calls: Array<Call> = ['structuredOutput', 'structuredOutputStream']

/** The Converse native JSON schema output for `schema`. */
const nativeOutput = {
  textFormat: {
    type: 'json_schema',
    structure: {
      jsonSchema: { schema: JSON.stringify(schema), name: 'structured_output' },
    },
  },
}

/**
 * Runs one structured output call through the installed AWS SDK and returns
 * the JSON body that the SDK sent over HTTP.
 */
async function structuredBody(
  model: string,
  call: Call,
  chatOptions: Partial<Pick<TextOptions, 'messages' | 'reasoning'>> = {},
) {
  let body: unknown
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    maxAttempts: 1,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: {
      async handle(sent: { body?: unknown }) {
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
  const options = {
    chatOptions: { logger, model, messages, ...chatOptions },
    outputSchema: schema,
  }
  try {
    if (call === 'structuredOutput')
      await expect(adapter.structuredOutput(options)).rejects.toThrow(
        'Transport probe complete',
      )
    else
      for await (const _ of adapter.structuredOutputStream(options)) {
        // drain: the probe ends the call with RUN_ERROR
      }
  } finally {
    client.destroy()
  }
  return body
}

describe('Bedrock Converse structured output request', () => {
  it.each(calls)(
    '%s forces the structured_output tool on a model that takes a forced tool',
    async (call) => {
      const body = await structuredBody(nova, call)
      expect(body).toHaveProperty('toolConfig.toolChoice', {
        tool: { name: 'structured_output' },
      })
      expect(body).not.toHaveProperty('outputConfig')
    },
  )

  it.each(
    noForcedToolModels.flatMap((model) =>
      calls.map((call) => ({ model, call })),
    ),
  )(
    '$call on $model sends the native JSON schema output and no tool',
    async ({ model, call }) => {
      const body = await structuredBody(model, call)
      expect(body).toHaveProperty('outputConfig', nativeOutput)
      expect(body).not.toHaveProperty('toolConfig')
    },
  )

  it.each(calls)(
    '%s with thinking on sends the native JSON schema output',
    async (call) => {
      const body = await structuredBody(sonnet45, call, {
        reasoning: { level: 'high', summary: false },
      })
      expect(body).toHaveProperty(
        'additionalModelRequestFields.thinking.type',
        'enabled',
      )
      expect(body).toHaveProperty('outputConfig', nativeOutput)
      expect(body).not.toHaveProperty('toolConfig')
    },
  )

  // The native output sends no toolConfig, so the tool history goes as text.
  it('sends the tool history as text with the native output', async () => {
    const body = await structuredBody(opus55, 'structuredOutput', {
      messages: [
        ...messages,
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'list_cities', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', content: 'Paris, Rome' },
      ],
    })
    expect(body).not.toHaveProperty('toolConfig')
    expect(body).toHaveProperty('messages.1.content', [
      { text: '[Tool call list_cities({})]' },
    ])
    expect(body).toHaveProperty('messages.2.content', [
      { text: '[Tool result for list_cities: Paris, Rome]' },
    ])
  })
})

/** An adapter for `model` that answers with canned Converse output. */
function cannedAdapter(
  model: string,
  reply: { text?: string; events?: Array<ConverseStreamOutput> },
) {
  const output: ConverseCommandOutput = {
    $metadata: {},
    output: {
      message: { role: 'assistant', content: [{ text: reply.text ?? '' }] },
    },
    stopReason: 'end_turn',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
  }
  class CannedAdapter extends BedrockConverseTextAdapter<typeof nova> {
    protected override async send(): Promise<ConverseCommandOutput> {
      return output
    }
    protected override async sendStream(): Promise<
      AsyncIterable<ConverseStreamOutput>
    > {
      const events = reply.events ?? []
      return (async function* () {
        yield* events
      })()
    }
  }
  const adapter = new CannedAdapter({ apiKey: 'test-key' }, nova)
  Object.defineProperty(adapter, 'model', { value: model })
  return adapter
}

const options = {
  chatOptions: { logger, model: opus55, messages },
  outputSchema: schema,
}

describe('Bedrock Converse native structured output response', () => {
  it('structuredOutput returns the JSON text answer', async () => {
    const adapter = cannedAdapter(opus55, { text: '{"city":"Paris"}' })
    const result = await adapter.structuredOutput(options)
    expect(result.data).toEqual({ city: 'Paris' })
    expect(result.rawText).toBe('{"city":"Paris"}')
  })

  it('structuredOutput fails with the model name when the answer is not JSON', async () => {
    const adapter = cannedAdapter(opus55, { text: 'Paris is nice.' })
    await expect(adapter.structuredOutput(options)).rejects.toThrow(
      `bedrock-converse.structuredOutput: ${opus55} did not answer with JSON`,
    )
  })

  it('structuredOutputStream reads the JSON from the text deltas', async () => {
    const adapter = cannedAdapter(opus55, {
      events: [
        { messageStart: { role: 'assistant' } },
        {
          contentBlockDelta: {
            delta: { reasoningContent: { text: 'Paris is a city.' } },
            contentBlockIndex: 0,
          },
        },
        {
          contentBlockDelta: {
            delta: { text: '{"city":' },
            contentBlockIndex: 1,
          },
        },
        {
          contentBlockDelta: {
            delta: { text: '"Paris"}' },
            contentBlockIndex: 1,
          },
        },
        { messageStop: { stopReason: 'end_turn' } },
      ],
    })
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of adapter.structuredOutputStream(options))
      chunks.push(chunk)
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: { object: { city: 'Paris' }, raw: '{"city":"Paris"}' },
      }),
    )
    expect(chunks.at(-1)).toHaveProperty('type', EventType.RUN_FINISHED)
  })
})
