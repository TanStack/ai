import { BedrockTextAdapter } from '../src/adapters/text'
import { BedrockResponsesTextAdapter } from '../src/adapters/responses-text'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../src/adapters/converse-text'
import { describe, expect, it } from 'vitest'
import {
  EventType,
  StreamProcessor,
  chat,
  toolDefinition,
  uiMessagesToWire,
  normalizeStreamChunk,
} from '@tanstack/ai'
import { toConverseMessages } from '../src/converse/message-converter'
import { processConverseStream } from '../src/converse/stream-processor'
import type {
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import type { AdapterYieldChunk, ModelMessage } from '@tanstack/ai'

const context = {
  model: 'anthropic.claude-sonnet-4-6',
  inputModalities: ['text', 'image'] as const,
}

describe('Bedrock replay parity', () => {
  it.each([
    { raw: 'null', value: null },
    { raw: '[1,"value"]', value: [1, 'value'] },
    { raw: '"value"', value: 'value' },
    { raw: '42', value: 42 },
  ])('replays a valid JSON tool value $raw', ({ raw, value }) => {
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'tool',
            type: 'function',
            function: { name: 'lookup', arguments: raw },
          },
        ],
      },
      { role: 'tool', toolCallId: 'tool', content: 'Result' },
    ]
    const saved = structuredClone(messages)
    expect(toConverseMessages(messages, [], context)).toEqual({
      system: [],
      messages: [
        {
          role: 'assistant',
          content: [
            { toolUse: { toolUseId: 'tool', name: 'lookup', input: value } },
          ],
        },
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 'tool',
                content: [{ text: 'Result' }],
                status: 'success',
              },
            },
          ],
        },
      ],
    })
    expect(messages).toEqual(saved)
  })

  it('keeps the complete ordinary converter request unchanged', () => {
    expect(
      toConverseMessages(
        [
          { role: 'user', content: 'Hello' },
          {
            role: 'assistant',
            content: 'Answer',
            toolCalls: [
              {
                id: 'tool',
                type: 'function',
                function: { name: 'lookup', arguments: '{"value":1}' },
              },
            ],
          },
          { role: 'tool', toolCallId: 'tool', content: 'Result' },
        ],
        [{ content: 'System', metadata: { cachePoint: { type: 'default' } } }],
      ),
    ).toEqual({
      system: [{ text: 'System' }, { cachePoint: { type: 'default' } }],
      messages: [
        { role: 'user', content: [{ text: 'Hello' }] },
        {
          role: 'assistant',
          content: [
            { text: 'Answer' },
            {
              toolUse: {
                toolUseId: 'tool',
                name: 'lookup',
                input: { value: 1 },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 'tool',
                content: [{ text: 'Result' }],
                status: 'success',
              },
            },
          ],
        },
      ],
    })
  })
  it('replays signed and redacted thinking around tools in recorded order', () => {
    const history: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: 'AB',
        thinking: [
          { content: 'First\ud800', signature: 'opaque-first' },
          { content: 'Second', signature: 'opaque-second' },
          { content: '', signature: 'AAH/', redacted: true },
        ],
        toolCalls: [
          {
            id: 'tool',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
        blockOrder: [
          { type: 'thinking', index: 0 },
          { type: 'text', length: 1 },
          { type: 'tool-call', id: 'tool' },
          { type: 'thinking', index: 1 },
          { type: 'text', length: 1 },
          { type: 'thinking', index: 2 },
        ],
      },
      { role: 'tool', toolCallId: 'tool', content: 'Result' },
    ]
    const saved = structuredClone(history)
    expect(toConverseMessages(history, ['System\ud800'], context)).toEqual({
      system: [{ text: 'System' }],
      messages: [
        {
          role: 'assistant',
          content: [
            {
              reasoningContent: {
                reasoningText: { text: 'First', signature: 'opaque-first' },
              },
            },
            { text: 'A' },
            { toolUse: { toolUseId: 'tool', name: 'lookup', input: {} } },
            {
              reasoningContent: {
                reasoningText: { text: 'Second', signature: 'opaque-second' },
              },
            },
            { text: 'B' },
            {
              reasoningContent: {
                redactedContent: new Uint8Array([0, 1, 255]),
              },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 'tool',
                content: [{ text: 'Result' }],
                status: 'success',
              },
            },
          ],
        },
      ],
    })
    expect(history).toEqual(saved)
  })
  it('omits a foreign signature for non-Claude reasoning', () => {
    expect(
      toConverseMessages(
        [
          {
            role: 'assistant',
            content: 'Answer',
            thinking: [{ content: 'Reason', signature: 'opaque' }],
          },
        ],
        [],
        { model: 'us.amazon.nova-pro-v1:0', inputModalities: ['text'] },
      ),
    ).toEqual({
      system: [],
      messages: [
        {
          role: 'assistant',
          content: [
            { reasoningContent: { reasoningText: { text: 'Reason' } } },
            { text: 'Answer' },
          ],
        },
      ],
    })
  })
  it('puts images inside tool results and preserves an empty error status', () => {
    expect(
      toConverseMessages(
        [
          {
            role: 'tool',
            toolCallId: 'tool',
            error: '',
            content: [
              { type: 'text', content: 'Image\ud800' },
              {
                type: 'image',
                source: { type: 'data', value: 'AAH/', mimeType: 'image/png' },
              },
            ],
          },
        ],
        [],
        context,
      ),
    ).toEqual({
      system: [],
      messages: [
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 'tool',
                status: 'error',
                content: [
                  { text: 'Image' },
                  {
                    image: {
                      format: 'png',
                      source: { bytes: new Uint8Array([0, 1, 255]) },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
  })
  it('uses a text placeholder for tool images on a text-only model', () => {
    expect(
      toConverseMessages(
        [
          {
            role: 'tool',
            toolCallId: 'tool',
            content: [
              {
                type: 'image',
                source: { type: 'data', value: 'AAH/', mimeType: 'image/png' },
              },
            ],
          },
        ],
        [],
        { model: 'text-only', inputModalities: ['text'] },
      ),
    ).toEqual({
      system: [],
      messages: [
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 'tool',
                status: 'success',
                content: [
                  { text: '(image omitted: model does not support images)' },
                ],
              },
            },
          ],
        },
      ],
    })
  })
  it('keeps every indexed thinking signature and redacted payload separate', async () => {
    const events: Array<ConverseStreamOutput> = [
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { text: 'First' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { signature: 'opaque-' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { signature: 'first' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      {
        contentBlockStart: {
          contentBlockIndex: 1,
          start: { toolUse: { toolUseId: 'tool', name: 'lookup' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 1,
          delta: { toolUse: { input: '{}' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 1 } },
      {
        contentBlockDelta: {
          contentBlockIndex: 2,
          delta: { reasoningContent: { text: 'Second' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 2,
          delta: { reasoningContent: { signature: 'opaque-second' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 2 } },
      {
        contentBlockDelta: {
          contentBlockIndex: 3,
          delta: {
            reasoningContent: { redactedContent: new Uint8Array([0, 1]) },
          },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 3,
          delta: {
            reasoningContent: { redactedContent: new Uint8Array([255]) },
          },
        },
      },
      { contentBlockStop: { contentBlockIndex: 3 } },
      { messageStop: { stopReason: 'end_turn' } },
    ]
    const chunks = []
    let id = 0
    for await (const chunk of processConverseStream(
      (async function* () {
        for (const event of events) yield event
      })(),
      () => 'id-' + id++,
    ))
      chunks.push(chunk)
    const signatures = chunks.filter(
      (chunk) => chunk.type === EventType.REASONING_ENCRYPTED_VALUE,
    )
    expect(signatures.map((chunk) => chunk.encryptedValue)).toEqual([
      'opaque-first',
      'opaque-second',
      'AAE=',
      'AAH/',
    ])
    expect(new Set(signatures.map((chunk) => chunk.entityId)).size).toBe(3)
    expect(signatures[2]?.entityId).toMatch(/^redacted_thinking-/)
    expect(
      chunks.filter((chunk) => chunk.type === EventType.STEP_STARTED),
    ).toHaveLength(3)
    expect(
      chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
    ).not.toHaveProperty('responseId')
  })
})

describe('Bedrock installed SDK request serialization', () => {
  it('keeps the native body and never treats the AWS request ID as a generation ID', async () => {
    const bodies: Array<unknown> = []
    const paths: Array<string> = []
    const client = new BedrockRuntimeClient({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      requestHandler: {
        async handle(request: {
          body?: unknown
          path: string
          headers: Record<string, string>
        }) {
          if (typeof request.body !== 'string')
            throw new Error('Expected SDK JSON request body')
          bodies.push(JSON.parse(request.body))
          paths.push(request.path)
          return {
            response: {
              statusCode: 200,
              headers: {
                'content-type': 'application/json',
                'x-amzn-requestid': 'aws-transport-only',
              },
              body: new TextEncoder().encode(
                JSON.stringify({
                  output: {
                    message: {
                      role: 'assistant',
                      content: [
                        {
                          toolUse: {
                            toolUseId: 'structured',
                            name: 'structured_output',
                            input: { ok: true },
                          },
                        },
                      ],
                    },
                  },
                  stopReason: 'tool_use',
                  usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
                  metrics: { latencyMs: 1 },
                }),
              ),
            },
          }
        },
      },
    })
    class SdkAdapter extends BedrockConverseTextAdapter<'us.amazon.nova-pro-v1:0'> {
      protected override async getClient(): Promise<BedrockRuntimeClient> {
        return client
      }
    }
    const adapter = new SdkAdapter(
      { apiKey: 'unused' },
      'us.amazon.nova-pro-v1:0',
    )
    const history: Array<ModelMessage> = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'tool',
            type: 'function',
            function: { name: 'lookup', arguments: 'null' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'tool',
        content: [
          { type: 'text', content: 'Result' },
          {
            type: 'image',
            source: { type: 'data', mimeType: 'image/png', value: 'AAH/' },
          },
        ],
      },
    ]
    const saved = structuredClone(history)
    try {
      const result = await adapter.structuredOutput({
        chatOptions: {
          model: 'us.amazon.nova-pro-v1:0',
          messages: history,
          systemPrompts: ['System'],
          modelOptions: {
            temperature: 0.5,
            top_p: 0.9,
            max_completion_tokens: 128,
            stop: ['STOP'],
          },
          logger: resolveDebugOption(false),
        },
        outputSchema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      })
      expect(result.data).toEqual({ ok: true })
      expect(result).not.toHaveProperty('responseId')
      expect(bodies).toHaveLength(1)
      expect(paths).toEqual(['/model/us.amazon.nova-pro-v1%3A0/converse'])
      expect(bodies[0]).toEqual({
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: 'structured_output',
                description: 'Return the final answer as structured JSON.',
                inputSchema: {
                  json: {
                    type: 'object',
                    properties: { ok: { type: 'boolean' } },
                    required: ['ok'],
                  },
                },
              },
            },
          ],
          toolChoice: { tool: { name: 'structured_output' } },
        },
        messages: [
          { role: 'user', content: [{ text: 'Hello' }] },
          {
            role: 'assistant',
            content: [
              { toolUse: { toolUseId: 'tool', name: 'lookup', input: null } },
            ],
          },
          {
            role: 'user',
            content: [
              {
                toolResult: {
                  toolUseId: 'tool',
                  status: 'success',
                  content: [
                    { text: 'Result' },
                    { image: { format: 'png', source: { bytes: 'AAH/' } } },
                  ],
                },
              },
            ],
          },
        ],
        system: [{ text: 'System' }],
        inferenceConfig: {
          temperature: 0.5,
          topP: 0.9,
          maxTokens: 128,
          stopSequences: ['STOP'],
        },
      })
      expect(history).toEqual(saved)
      await adapter.structuredOutput({
        chatOptions: {
          model: 'us.amazon.nova-pro-v1:0',
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'assistant',
              content: 'Answer',
              toolCalls: [
                {
                  id: 'ordinary-tool',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{"value":1}' },
                },
              ],
            },
            { role: 'tool', toolCallId: 'ordinary-tool', content: 'Result' },
          ],
          systemPrompts: [
            {
              content: 'System',
              metadata: { cachePoint: { type: 'default' } },
            },
          ],
          modelOptions: {
            temperature: 0.5,
            top_p: 0.9,
            max_completion_tokens: 128,
            stop: ['STOP'],
          },
          logger: resolveDebugOption(false),
        },
        outputSchema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      })
      expect(bodies[1]).toEqual({
        messages: [
          { role: 'user', content: [{ text: 'Hello' }] },
          {
            role: 'assistant',
            content: [
              { text: 'Answer' },
              {
                toolUse: {
                  toolUseId: 'ordinary-tool',
                  name: 'lookup',
                  input: { value: 1 },
                },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                toolResult: {
                  toolUseId: 'ordinary-tool',
                  content: [{ text: 'Result' }],
                  status: 'success',
                },
              },
            ],
          },
        ],
        system: [{ text: 'System' }, { cachePoint: { type: 'default' } }],
        inferenceConfig: {
          temperature: 0.5,
          topP: 0.9,
          maxTokens: 128,
          stopSequences: ['STOP'],
        },
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: 'structured_output',
                description: 'Return the final answer as structured JSON.',
                inputSchema: {
                  json: {
                    type: 'object',
                    properties: { ok: { type: 'boolean' } },
                    required: ['ok'],
                  },
                },
              },
            },
          ],
          toolChoice: { tool: { name: 'structured_output' } },
        },
      })
    } finally {
      client.destroy()
    }
  })
})

describe('Bedrock replay ID allocation', () => {
  it('reserves existing IDs and pairs foreign collisions without changing history', () => {
    const reserved = 'a'.repeat(64)
    const foreignSource = {
      provider: 'other',
      api: 'other-api',
      model: 'other-model',
    }
    const history: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: reserved,
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', toolCallId: reserved, content: 'First' },
      {
        role: 'assistant',
        content: null,
        metadata: { tanstack: { source: foreignSource } },
        toolCalls: [
          {
            id: reserved + ':one',
            type: 'function',
            function: { name: 'lookup', arguments: '{"text":"value\ud800"}' },
          },
          {
            id: reserved + ':two',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', toolCallId: reserved + ':one', content: 'Second' },
      { role: 'tool', toolCallId: reserved + ':two', content: 'Third' },
    ]
    const saved = structuredClone(history)
    const request = toConverseMessages(history, [], context)
    const blocks = request.messages.flatMap((message) => message.content ?? [])
    const uses = blocks.flatMap((block) =>
      block.toolUse ? [block.toolUse] : [],
    )
    const results = blocks.flatMap((block) =>
      block.toolResult ? [block.toolResult] : [],
    )
    expect(uses[0]?.toolUseId).toBe(reserved)
    expect(new Set(uses.map((use) => use.toolUseId)).size).toBe(3)
    for (const use of uses)
      expect(use.toolUseId).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
    expect(results.map((result) => result.toolUseId)).toEqual(
      uses.map((use) => use.toolUseId),
    )
    expect(uses[1]?.input).toEqual({ text: 'value' })
    expect(history).toEqual(saved)
  })
})

describe('Bedrock Converse source lifecycle', () => {
  it.each([false, true])(
    'tags the actual API before content or failure (failure=%s)',
    async (failure) => {
      class StreamAdapter extends BedrockConverseTextAdapter<'us.amazon.nova-pro-v1:0'> {
        protected override async sendStream(): Promise<
          AsyncIterable<ConverseStreamOutput>
        > {
          if (failure) throw new Error('SDK failed')
          return (async function* () {
            yield {
              contentBlockDelta: {
                contentBlockIndex: 0,
                delta: { text: 'Answer' },
              },
            }
            yield { messageStop: { stopReason: 'end_turn' } }
          })()
        }
      }
      const adapter = new StreamAdapter(
        { apiKey: 'unused' },
        'us.amazon.nova-pro-v1:0',
      )
      const chunks: Array<AdapterYieldChunk> = []
      for await (const chunk of adapter.chatStream({
        model: 'us.amazon.nova-pro-v1:0',
        messages: [{ role: 'user', content: 'Hello' }],
        logger: resolveDebugOption(false),
      }))
        chunks.push(chunk)
      expect(chunks[0]?.metadata).toEqual({
        tanstack: {
          source: {
            provider: 'amazon-bedrock',
            api: 'bedrock-converse-stream',
            model: 'us.amazon.nova-pro-v1:0',
          },
        },
      })
      expect(chunks.at(-1)?.type).toBe(
        failure ? EventType.RUN_ERROR : EventType.RUN_FINISHED,
      )
      expect(chunks.at(-1)).not.toHaveProperty('responseId')
    },
  )
})

describe('Bedrock signed tool-loop replay', () => {
  it('sends every indexed signature and redacted payload in the next request', async () => {
    const requests: Array<ConverseStreamCommandInput> = []
    class LoopAdapter extends BedrockConverseTextAdapter<'us.anthropic.claude-sonnet-4-5-20250929-v1:0'> {
      protected override async sendStream(
        input: ConverseStreamCommandInput,
      ): Promise<AsyncIterable<ConverseStreamOutput>> {
        requests.push(structuredClone(input))
        const events: Array<ConverseStreamOutput> =
          requests.length === 1
            ? [
                {
                  contentBlockDelta: {
                    contentBlockIndex: 0,
                    delta: { reasoningContent: { text: 'First' } },
                  },
                },
                {
                  contentBlockDelta: {
                    contentBlockIndex: 0,
                    delta: { reasoningContent: { signature: 'opaque-first' } },
                  },
                },
                { contentBlockStop: { contentBlockIndex: 0 } },
                {
                  contentBlockStart: {
                    contentBlockIndex: 1,
                    start: { toolUse: { toolUseId: 'tool', name: 'lookup' } },
                  },
                },
                {
                  contentBlockDelta: {
                    contentBlockIndex: 1,
                    delta: { toolUse: { input: '{}' } },
                  },
                },
                { contentBlockStop: { contentBlockIndex: 1 } },
                {
                  contentBlockDelta: {
                    contentBlockIndex: 2,
                    delta: { reasoningContent: { text: 'Second' } },
                  },
                },
                {
                  contentBlockDelta: {
                    contentBlockIndex: 2,
                    delta: { reasoningContent: { signature: 'opaque-second' } },
                  },
                },
                { contentBlockStop: { contentBlockIndex: 2 } },
                {
                  contentBlockDelta: {
                    contentBlockIndex: 3,
                    delta: {
                      reasoningContent: {
                        redactedContent: new Uint8Array([0, 1]),
                      },
                    },
                  },
                },
                {
                  contentBlockDelta: {
                    contentBlockIndex: 3,
                    delta: {
                      reasoningContent: {
                        redactedContent: new Uint8Array([255]),
                      },
                    },
                  },
                },
                { contentBlockStop: { contentBlockIndex: 3 } },
                { messageStop: { stopReason: 'tool_use' } },
              ]
            : [
                {
                  contentBlockDelta: {
                    contentBlockIndex: 0,
                    delta: { text: 'Answer' },
                  },
                },
                { messageStop: { stopReason: 'end_turn' } },
              ]
        return (async function* () {
          for (const event of events) yield event
        })()
      }
    }
    let executions = 0
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up a value',
      inputSchema: { type: 'object', properties: {} },
    }).server(async () => {
      executions++
      return 'Result'
    })
    const history: Array<ModelMessage> = [{ role: 'user', content: 'Hello' }]
    const saved = structuredClone(history)
    const adapter = new LoopAdapter(
      { apiKey: 'unused' },
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    )
    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: history,
      tools: [lookup],
    }))
      chunks.push(chunk)
    expect(executions).toBe(1)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages).toEqual([
      { role: 'user', content: [{ text: 'Hello' }] },
      {
        role: 'assistant',
        content: [
          {
            reasoningContent: {
              reasoningText: { text: 'First', signature: 'opaque-first' },
            },
          },
          { toolUse: { toolUseId: 'tool', name: 'lookup', input: {} } },
          {
            reasoningContent: {
              reasoningText: { text: 'Second', signature: 'opaque-second' },
            },
          },
          {
            reasoningContent: { redactedContent: new Uint8Array([0, 1, 255]) },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            toolResult: {
              toolUseId: 'tool',
              content: [{ text: 'Result' }],
              status: 'success',
            },
          },
          { cachePoint: { type: 'default' } },
        ],
      },
    ])
    const starts = chunks.filter(
      (chunk) => chunk.type === EventType.RUN_STARTED,
    )
    expect(starts).toHaveLength(1)
    for (const start of starts)
      expect(start.metadata?.tanstack?.source).toEqual({
        provider: 'amazon-bedrock',
        api: 'bedrock-converse-stream',
        model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      })
    expect(history).toEqual(saved)
  })
})

describe('Bedrock inherited API identity', () => {
  it('keeps adapter names and distinct APIs with the known provider default', () => {
    const completions = new BedrockTextAdapter(
      { apiKey: 'unused' },
      'openai.gpt-oss-120b-1:0',
    )
    const responses = new BedrockResponsesTextAdapter(
      { apiKey: 'unused' },
      'openai.gpt-oss-120b-1:0',
    )
    expect([
      completions.name,
      completions.api,
      completions.provider,
      completions.inputModalities,
    ]).toEqual(['bedrock', 'openai-completions', 'amazon-bedrock', ['text']])
    expect([
      responses.name,
      responses.api,
      responses.provider,
      responses.inputModalities,
    ]).toEqual([
      'bedrock-responses',
      'openai-responses',
      'amazon-bedrock',
      ['text'],
    ])
  })
})

describe('Bedrock indexed reasoning transitions', () => {
  it.each(['redacted transition', 'out-of-order signatures'])(
    'keeps %s through a real tool loop',
    async (scenario) => {
      const requests: Array<ConverseStreamCommandInput> = []
      const reasoning: Array<ConverseStreamOutput> =
        scenario === 'redacted transition'
          ? [
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: { reasoningContent: { text: 'Private' } },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: {
                    reasoningContent: {
                      signature: 'discard-readable-signature',
                    },
                  },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: {
                    reasoningContent: {
                      redactedContent: new Uint8Array([0, 1]),
                    },
                  },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: {
                    reasoningContent: {
                      redactedContent: new Uint8Array([255]),
                    },
                  },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: {
                    reasoningContent: { signature: 'ignore-after-redaction' },
                  },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 2,
                  delta: {
                    reasoningContent: { text: 'Signed beside redacted' },
                  },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 2,
                  delta: { reasoningContent: { signature: 'opaque-neighbor' } },
                },
              },
              { contentBlockStop: { contentBlockIndex: 2 } },
            ]
          : [
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: { reasoningContent: { text: 'First' } },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 2,
                  delta: { reasoningContent: { text: 'Second' } },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: { reasoningContent: { signature: 'opaque-first' } },
                },
              },
              {
                contentBlockDelta: {
                  contentBlockIndex: 2,
                  delta: { reasoningContent: { signature: 'opaque-second' } },
                },
              },
              { contentBlockStop: { contentBlockIndex: 0 } },
              { contentBlockStop: { contentBlockIndex: 2 } },
              {
                contentBlockDelta: {
                  contentBlockIndex: 0,
                  delta: { reasoningContent: { signature: '-late' } },
                },
              },
            ]
      class IndexedAdapter extends BedrockConverseTextAdapter<'us.anthropic.claude-sonnet-4-5-20250929-v1:0'> {
        protected override async sendStream(
          input: ConverseStreamCommandInput,
        ): Promise<AsyncIterable<ConverseStreamOutput>> {
          requests.push(structuredClone(input))
          const events: Array<ConverseStreamOutput> =
            requests.length === 1
              ? [
                  ...reasoning,
                  {
                    contentBlockStart: {
                      contentBlockIndex: 4,
                      start: { toolUse: { toolUseId: 'tool', name: 'lookup' } },
                    },
                  },
                  {
                    contentBlockDelta: {
                      contentBlockIndex: 4,
                      delta: { toolUse: { input: '{}' } },
                    },
                  },
                  { contentBlockStop: { contentBlockIndex: 4 } },
                  { messageStop: { stopReason: 'tool_use' } },
                ]
              : [
                  {
                    contentBlockDelta: {
                      contentBlockIndex: 0,
                      delta: { text: 'Answer' },
                    },
                  },
                  { messageStop: { stopReason: 'end_turn' } },
                ]
          return (async function* () {
            for (const event of events) yield event
          })()
        }
      }
      let executions = 0
      const lookup = toolDefinition({
        name: 'lookup',
        description: 'Look up a value',
        inputSchema: { type: 'object', properties: {} },
      }).server(async () => {
        executions++
        return 'Result'
      })
      const history: Array<ModelMessage> = [{ role: 'user', content: 'Hello' }]
      const saved = structuredClone(history)
      const adapter = new IndexedAdapter(
        { apiKey: 'unused' },
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      )
      const processor = new StreamProcessor()
      let sawPartialRedaction = false
      for await (const chunk of chat({
        adapter,
        messages: history,
        tools: [lookup],
      })) {
        processor.processChunk(chunk)
        if (
          chunk.type === EventType.REASONING_ENCRYPTED_VALUE &&
          chunk.encryptedValue === 'AAE='
        ) {
          const thinking = processor
            .getMessages()
            .flatMap((message) => message.parts)
            .filter((part) => part.type === 'thinking')
          expect(thinking).toMatchObject([
            {
              type: 'thinking',
              content: '',
              signature: 'AAE=',
              redacted: true,
            },
          ])
          sawPartialRedaction = true
        }
      }
      expect(executions).toBe(1)
      expect(requests).toHaveLength(2)
      const blocks =
        requests[1]?.messages?.flatMap((message) => message.content ?? []) ?? []
      expect(
        blocks.flatMap((block) =>
          block.reasoningContent ? [block.reasoningContent] : [],
        ),
      ).toEqual(
        scenario === 'redacted transition'
          ? [
              { redactedContent: new Uint8Array([0, 1, 255]) },
              {
                reasoningText: {
                  text: 'Signed beside redacted',
                  signature: 'opaque-neighbor',
                },
              },
            ]
          : [
              {
                reasoningText: {
                  text: 'First',
                  signature: 'opaque-first-late',
                },
              },
              { reasoningText: { text: 'Second', signature: 'opaque-second' } },
            ],
      )
      if (scenario === 'redacted transition')
        expect(sawPartialRedaction).toBe(true)
      const copied = JSON.parse(JSON.stringify(processor.getMessages()))
      const restored = new StreamProcessor({ initialMessages: copied })
      const replay = toConverseMessages(restored.toModelMessages(), [], {
        ...context,
        model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      })
      const reasoningBlocks = (messages: typeof replay.messages) =>
        messages
          .flatMap((message) => message.content ?? [])
          .flatMap((block) =>
            block.reasoningContent ? [block.reasoningContent] : [],
          )
      expect(reasoningBlocks(replay.messages)).toEqual(
        blocks.flatMap((block) =>
          block.reasoningContent ? [block.reasoningContent] : [],
        ),
      )
      const snapshot = new StreamProcessor()
      snapshot.processChunk({
        type: EventType.MESSAGES_SNAPSHOT,
        messages: uiMessagesToWire(copied),
      })
      expect(
        reasoningBlocks(
          toConverseMessages(snapshot.toModelMessages(), [], {
            ...context,
            model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
          }).messages,
        ),
      ).toEqual(reasoningBlocks(replay.messages))
      expect(history).toEqual(saved)
    },
  )
})

describe('Bedrock installed SDK Document values', () => {
  it.each([
    { raw: 'null', value: null },
    { raw: 'false', value: false },
    { raw: '0', value: 0 },
    { raw: '[null,1]', value: [null, 1] },
    { raw: '{"nested":null}', value: { nested: null } },
    {
      raw: '{"__proto__":{"polluted":true},"safe":1}',
      value: JSON.parse('{"__proto__":{"polluted":true},"safe":1}'),
    },
    {
      raw: '{"nested":{"__proto__":null,"safe":2}}',
      value: JSON.parse('{"nested":{"__proto__":null,"safe":2}}'),
    },
  ])('preserves $raw in both SDK commands', async ({ raw, value }) => {
    const requests: Array<{ path: string; body: unknown; length?: string }> = []
    const client = new BedrockRuntimeClient({
      region: 'us-east-1',
      maxAttempts: 1,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      requestHandler: {
        async handle(request: {
          body?: unknown
          path: string
          headers: Record<string, string>
        }) {
          if (typeof request.body !== 'string')
            throw new Error('Expected SDK JSON body')
          requests.push({
            path: request.path,
            body: JSON.parse(request.body),
            length: request.headers['content-length'],
          })
          expect(request.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /)
          expect(Number(request.headers['content-length'])).toBe(
            new TextEncoder().encode(request.body).length,
          )
          throw new Error('Transport probe complete')
        },
      },
    })
    class DocumentAdapter extends BedrockConverseTextAdapter<'us.amazon.nova-pro-v1:0'> {
      protected override async getClient(): Promise<BedrockRuntimeClient> {
        return client
      }
      async probeResult(input: ConverseStreamCommandInput, stream: boolean) {
        return stream ? this.sendStream(input) : this.send(input)
      }
    }
    const adapter = new DocumentAdapter(
      { apiKey: 'unused' },
      'us.amazon.nova-pro-v1:0',
    )
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'tool',
            type: 'function',
            function: { name: 'lookup', arguments: raw },
          },
        ],
      },
      { role: 'tool', toolCallId: 'tool', content: 'Result' },
    ]
    const options = {
      model: 'us.amazon.nova-pro-v1:0',
      messages,
      logger: resolveDebugOption(false),
    }
    try {
      await expect(
        adapter.structuredOutput({
          chatOptions: options,
          outputSchema: { type: 'object', properties: {} },
        }),
      ).rejects.toThrow('Transport probe complete')
      const chunks: Array<AdapterYieldChunk> = []
      for await (const chunk of adapter.chatStream(options)) chunks.push(chunk)
      expect(chunks.at(-1)?.type).toBe(EventType.RUN_ERROR)
      expect(requests.map((request) => request.path)).toEqual([
        '/model/us.amazon.nova-pro-v1%3A0/converse',
        '/model/us.amazon.nova-pro-v1%3A0/converse-stream',
      ])
      for (const request of requests) {
        expect(JSON.stringify(request.body)).toContain(
          '"input":' + JSON.stringify(value),
        )
        expect(Object.prototype).not.toHaveProperty('polluted')
        expect(request.body).toMatchObject({
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  toolUse: { toolUseId: 'tool', name: 'lookup', input: value },
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  toolResult: {
                    toolUseId: 'tool',
                    content: [{ text: 'Result' }],
                    status: 'success',
                  },
                },
              ],
            },
          ],
        })
      }
      requests.length = 0
      const resultInput: ConverseStreamCommandInput = {
        modelId: 'us.amazon.nova-pro-v1:0',
        messages: [
          {
            role: 'user',
            content: [
              { toolResult: { toolUseId: 'tool', content: [{ json: value }] } },
            ],
          },
        ],
      }
      for (const stream of [false, true])
        await expect(adapter.probeResult(resultInput, stream)).rejects.toThrow(
          'Transport probe complete',
        )
      expect(requests).toHaveLength(2)
      for (const request of requests) {
        expect(JSON.stringify(request.body)).toContain(
          '"json":' + JSON.stringify(value),
        )
        expect(Object.prototype).not.toHaveProperty('polluted')
      }
    } finally {
      client.destroy()
    }
  })
})

it('marks a late redacted transition even when the encoded signature is unchanged', async () => {
  const events: Array<ConverseStreamOutput> = [
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Private' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'AAH/' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: {
          reasoningContent: { redactedContent: new Uint8Array([0, 1, 255]) },
        },
      },
    },
  ]
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of processConverseStream(
    (async function* () {
      for (const event of events) yield event
    })(),
    () => 'reasoning-id',
    { model: 'model' },
  ))
    chunks.push(chunk)
  const encrypted = chunks.filter(
    (chunk) => chunk.type === EventType.REASONING_ENCRYPTED_VALUE,
  )
  expect(encrypted).toHaveLength(2)
  expect(encrypted[1]).toMatchObject({
    encryptedValue: 'AAH/',
    stepId: expect.stringMatching(/^redacted_thinking-/),
  })
})

it('keeps a signature-only first index before a readable neighbor in durable UI replay', async () => {
  const events: Array<ConverseStreamOutput> = [
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { signature: 'opaque-first' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 2,
        delta: {
          reasoningContent: { text: 'Second' },
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 2,
        delta: { reasoningContent: { signature: 'opaque-second' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'First' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { contentBlockStop: { contentBlockIndex: 2 } },
  ]
  let id = 0
  const processor = new StreamProcessor()
  for await (const raw of processConverseStream(
    (async function* () {
      for (const event of events) yield event
    })(),
    () => 'id-' + id++,
  ))
    for (const chunk of normalizeStreamChunk(raw)) processor.processChunk(chunk)
  expect(
    processor
      .getMessages()[0]
      ?.parts.filter((part) => part.type === 'thinking')
      .map((part) => ({ content: part.content, signature: part.signature })),
  ).toEqual([
    { content: 'First', signature: 'opaque-first' },
    { content: 'Second', signature: 'opaque-second' },
  ])
  expect(processor.toModelMessages()[0]?.thinking).toEqual([
    { content: 'First', signature: 'opaque-first' },
    { content: 'Second', signature: 'opaque-second' },
  ])
})

it('preserves ordinary and forced raw schemas in both installed SDK commands', async () => {
  const schema = JSON.parse(
    '{"type":"object","properties":{"__proto__":{"type":"string"},"safe":{"type":"number","default":0}},"$defs":{"nested":{"default":{"__proto__":null,"safe":false}}},"examples":[null,false,0]}',
  )
  const bodies: Array<string> = []
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    maxAttempts: 1,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: {
      async handle(request: {
        body?: unknown
        path: string
        headers: Record<string, string>
      }) {
        if (typeof request.body !== 'string')
          throw new Error('Expected SDK JSON body')
        bodies.push(request.body)
        expect(request.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /)
        expect(Number(request.headers['content-length'])).toBe(
          new TextEncoder().encode(request.body).length,
        )
        throw new Error('Schema probe complete')
      },
    },
  })
  class SchemaAdapter extends BedrockConverseTextAdapter<'us.amazon.nova-pro-v1:0'> {
    protected override async getClient(): Promise<BedrockRuntimeClient> {
      return client
    }
    async ordinary(stream: boolean) {
      const input = this.buildInput({
        model: 'us.amazon.nova-pro-v1:0',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          {
            name: 'lookup',
            description: 'Look up a value',
            inputSchema: schema,
          },
        ],
        logger: resolveDebugOption(false),
      })
      return stream ? this.sendStream(input) : this.send(input)
    }
  }
  const adapter = new SchemaAdapter(
    { apiKey: 'unused' },
    'us.amazon.nova-pro-v1:0',
  )
  try {
    for (const stream of [false, true])
      await expect(adapter.ordinary(stream)).rejects.toThrow(
        'Schema probe complete',
      )
    const options = {
      chatOptions: {
        model: 'us.amazon.nova-pro-v1:0',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        logger: resolveDebugOption(false),
      },
      outputSchema: schema,
    }
    await expect(adapter.structuredOutput(options)).rejects.toThrow(
      'Schema probe complete',
    )
    for await (const _chunk of adapter.structuredOutputStream(options)) {
    }
    expect(bodies).toHaveLength(4)
    for (const body of bodies)
      expect(body).toContain('"json":' + JSON.stringify(schema))
    expect(Object.prototype).not.toHaveProperty('safe')
  } finally {
    client.destroy()
  }
})
