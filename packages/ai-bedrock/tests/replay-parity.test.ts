import { BedrockTextAdapter } from '../src/adapters/text'
import { BedrockResponsesTextAdapter } from '../src/adapters/responses-text'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../src/adapters/converse-text'
import { describe, expect, it } from 'vitest'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { toConverseMessages } from '../src/converse/message-converter'
import { processConverseStream } from '../src/converse/stream-processor'
import type {
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import type { AdapterYieldChunk, ModelMessage } from '@tanstack/ai'

const context = {
  model: 'anthropic.claude-sonnet-4-6',
}

describe('Bedrock replay parity', () => {
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
          { content: 'First', signature: 'opaque-first' },
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
    expect(toConverseMessages(history, ['System'], context)).toEqual({
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
        { model: 'us.amazon.nova-pro-v1:0' },
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
            function: { name: 'lookup', arguments: '{"text":"value"}' },
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
    expect([completions.name, completions.api, completions.provider]).toEqual([
      'bedrock',
      'openai-completions',
      'amazon-bedrock',
    ])
    expect([responses.name, responses.api, responses.provider]).toEqual([
      'bedrock-responses',
      'openai-responses',
      'amazon-bedrock',
    ])
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
