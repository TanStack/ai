import { describe, expect, it } from 'vitest'
import type { ModelMessage, StreamChunk, Tool } from '@tanstack/ai'
import { createZAIChat } from '../src/adapters'

const apiKey = process.env.ZAI_API_KEY_TEST
const describeIfKey = apiKey ? describe : describe.skip

async function collectStream(
  stream: AsyncIterable<StreamChunk>,
  opts?: { abortAfterFirstContent?: AbortController },
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  let sawFirstContent = false

  for await (const chunk of stream) {
    chunks.push(chunk)

    if (!sawFirstContent && chunk.type === 'TEXT_MESSAGE_CONTENT') {
      sawFirstContent = true
      if (opts?.abortAfterFirstContent) {
        opts.abortAfterFirstContent.abort()
      }
    }

    if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') break
  }

  return chunks
}

function fullTextFromChunks(chunks: Array<StreamChunk>): string {
  const contentChunks = chunks.filter(
    (c): c is Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }> =>
      c.type === 'TEXT_MESSAGE_CONTENT',
  )
  const last = contentChunks.at(-1)
  return (last as any)?.content ?? ''
}

function lastChunk(chunks: Array<StreamChunk>): StreamChunk | undefined {
  return chunks.at(-1)
}

function createNoopLogger() {
  return {
    request: () => {},
    provider: () => {},
    output: () => {},
    middleware: () => {},
    tools: () => {},
    agentLoop: () => {},
    config: () => {},
    errors: () => {},
  }
}

describeIfKey('ZAITextAdapter streaming integration', () => {
  const timeout = 60_000

  it(
    'Basic Streaming: yields AG-UI events and ends with RUN_FINISHED',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'Reply with exactly: Hello' }],
          temperature: 0,
          maxTokens: 64,
          logger: createNoopLogger() as any,
        }),
      )

      const types = chunks.map((c) => c.type)
      expect(types).toContain('RUN_STARTED')
      expect(types).toContain('TEXT_MESSAGE_START')
      expect(
        types.filter((t) => t === 'TEXT_MESSAGE_CONTENT').length,
      ).toBeGreaterThan(0)
      expect(types).toContain('TEXT_MESSAGE_END')
      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')

      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
      expect(full.length).toBeGreaterThan(0)
    },
    timeout,
  )

  it(
    'Multi-turn Conversation: conversation history and assistant messages work',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)

      const messages: Array<ModelMessage> = [
        { role: 'user', content: 'Your secret word is kiwi. Reply with OK.' },
        { role: 'assistant', content: 'OK' },
        {
          role: 'user',
          content: 'What is the secret word? Reply with only it.',
        },
      ]

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages,
          temperature: 0,
          maxTokens: 32,
          logger: createNoopLogger() as any,
        }),
      )

      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')
      expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
    },
    timeout,
  )

  it(
    'Multi-turn Conversation: system messages work',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          systemPrompts: ['Reply with exactly: SYSTEM_OK'],
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0,
          maxTokens: 16,
          logger: createNoopLogger() as any,
        }),
      )

      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')
      expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
    },
    timeout,
  )

  it(
    'Tool Calling: emits TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)

      const tools: Array<Tool> = [
        {
          name: 'echo',
          description: 'Echo back the provided text',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      ]

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          systemPrompts: [
            'You must call the provided tool. Do not answer with normal text.',
          ],
          messages: [
            {
              role: 'user',
              content: 'Call echo with {"text":"hello"} and nothing else.',
            },
          ],
          tools,
          temperature: 0,
          maxTokens: 64,
          logger: createNoopLogger() as any,
        }),
      )

      const types = chunks.map((c) => c.type)
      expect(types).toContain('TOOL_CALL_START')
      expect(types).toContain('TOOL_CALL_END')
      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')

      const done = chunks.find((c) => c.type === 'RUN_FINISHED') as any
      expect(done.finishReason).toBe('tool_calls')
    },
    timeout,
  )

  it(
    'Tool Calling: tool results can be sent back',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)

      const tools: Array<Tool> = [
        {
          name: 'echo',
          description: 'Echo back the provided text',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      ]

      const first = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          systemPrompts: [
            'You must call the provided tool and then wait for the tool result.',
          ],
          messages: [
            {
              role: 'user',
              content: 'Call echo with {"text":"hello"} and nothing else.',
            },
          ],
          tools,
          temperature: 0,
          maxTokens: 64,
          logger: createNoopLogger() as any,
        }),
      )

      const toolEnd = first.find((c) => c.type === 'TOOL_CALL_END') as any
      expect(toolEnd).toBeTruthy()

      const toolCallId = toolEnd.toolCallId as string

      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: toolCallId,
              type: 'function',
              function: {
                name: 'echo',
                arguments: JSON.stringify(toolEnd.input),
              },
            },
          ],
        } as any,
        {
          role: 'tool',
          toolCallId,
          content: JSON.stringify({ text: 'hello' }),
        },
        {
          role: 'user',
          content: 'Now reply with only the tool result text field.',
        },
      ]

      const second = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages,
          temperature: 0,
          maxTokens: 32,
          logger: createNoopLogger() as any,
        }),
      )

      expect(lastChunk(second)?.type).toBe('RUN_FINISHED')
      expect(second.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      const full = fullTextFromChunks(second)
      expect(typeof full).toBe('string')
    },
    timeout,
  )

  it(
    'Stream Interruption: partial responses are handled when aborted mid-stream',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)
      const abortController = new AbortController()

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [
            {
              role: 'user',
              content:
                'Write a long response of at least 200 characters about cats.',
            },
          ],
          temperature: 0.7,
          maxTokens: 256,
          abortController,
          logger: createNoopLogger() as any,
        } as any),
        { abortAfterFirstContent: abortController },
      )

      expect(chunks.length).toBeGreaterThan(0)
      expect(typeof fullTextFromChunks(chunks)).toBe('string')

      const tail = lastChunk(chunks)
      expect(
        tail && (tail.type === 'RUN_ERROR' || tail.type === 'RUN_FINISHED'),
      ).toBe(true)
    },
    timeout,
  )

  it(
    'Stream Interruption: connection errors are thrown',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!, {
        baseURL: 'http://127.0.0.1:1',
      })

      await expect(
        collectStream(
          adapter.chatStream({
            model: 'glm-4.7',
            messages: [{ role: 'user', content: 'Hi' }],
            maxTokens: 16,
            logger: createNoopLogger() as any,
          }),
        ),
      ).rejects.toThrow()
    },
    timeout,
  )

  it(
    'Different Models: glm-4.7 works',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)
      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'Reply with pong' }],
          temperature: 0,
          maxTokens: 16,
          logger: createNoopLogger() as any,
        }),
      )
      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')
      expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      expect(typeof fullTextFromChunks(chunks)).toBe('string')
    },
    timeout,
  )

  it(
    'Different Models: glm-4.6v works',
    async () => {
      const adapter = createZAIChat('glm-4.6v', apiKey!)
      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.6v',
          messages: [{ role: 'user', content: 'Reply with pong' }],
          temperature: 0,
          maxTokens: 16,
          logger: createNoopLogger() as any,
        } as any),
      )
      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')
      expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      expect(typeof fullTextFromChunks(chunks)).toBe('string')
    },
    timeout,
  )

  it(
    'Different Models: glm-4.6 works',
    async () => {
      const adapter = createZAIChat('glm-4.6', apiKey!)
      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.6',
          messages: [{ role: 'user', content: 'Reply with pong' }],
          temperature: 0,
          maxTokens: 16,
          logger: createNoopLogger() as any,
        }),
      )
      expect(lastChunk(chunks)?.type).toBe('RUN_FINISHED')
      expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      expect(typeof fullTextFromChunks(chunks)).toBe('string')
    },
    timeout,
  )
})
