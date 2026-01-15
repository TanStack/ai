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

    if (!sawFirstContent && chunk.type === 'content') {
      sawFirstContent = true
      if (opts?.abortAfterFirstContent) {
        opts.abortAfterFirstContent.abort()
      }
    }

    if (chunk.type === 'done' || chunk.type === 'error') break
  }

  return chunks
}

function fullTextFromChunks(chunks: Array<StreamChunk>): string {
  const contentChunks = chunks.filter(
    (c): c is Extract<StreamChunk, { type: 'content' }> => c.type === 'content',
  )
  const last = contentChunks.at(-1)
  return last?.content ?? ''
}

function lastChunk(chunks: Array<StreamChunk>): StreamChunk | undefined {
  return chunks.at(-1)
}

describeIfKey('ZAITextAdapter streaming integration', () => {
  const timeout = 60_000

  it(
    'Basic Streaming: yields content chunks, accumulates content, and ends with done',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!)

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'Reply with exactly: Hello' }],
          temperature: 0,
          maxTokens: 64,
        }),
      )

      const contentChunks = chunks.filter((c) => c.type === 'content')
      expect(contentChunks.length).toBeGreaterThan(0)
      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
      expect(full).toBe((contentChunks.at(-1) as any).content)

      for (const c of contentChunks) {
        expect(typeof (c as any).delta).toBe('string')
        expect(typeof (c as any).content).toBe('string')
        expect((c as any).content.length).toBeGreaterThanOrEqual(
          ((c as any).delta as string).length,
        )
      }

      expect(lastChunk(chunks)?.type).toBe('done')
      expect(chunks.at(0)?.type).toBe('content')
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
        { role: 'user', content: 'What is the secret word? Reply with only it.' },
      ]

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages,
          temperature: 0,
          maxTokens: 32,
        }),
      )

      expect(lastChunk(chunks)?.type).toBe('done')
      expect(chunks.some((c) => c.type === 'error')).toBe(false)
      const contentChunks = chunks.filter((c) => c.type === 'content')
      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
      if (contentChunks.length) {
        expect(full).toBe((contentChunks.at(-1) as any).content)
      }
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
        }),
      )

      expect(lastChunk(chunks)?.type).toBe('done')
      expect(chunks.some((c) => c.type === 'error')).toBe(false)
      const contentChunks = chunks.filter((c) => c.type === 'content')
      const full = fullTextFromChunks(chunks)
      expect(typeof full).toBe('string')
      if (contentChunks.length) {
        expect(full).toBe((contentChunks.at(-1) as any).content)
      }
    },
    timeout,
  )

  it(
    'Tool Calling: sends tool definitions and yields tool_call chunks',
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
        }),
      )

      const toolCalls = chunks.filter((c) => c.type === 'tool_call') as any[]
      expect(toolCalls.length).toBeGreaterThan(0)
      expect(toolCalls[0].toolCall.type).toBe('function')
      expect(toolCalls[0].toolCall.function.name).toBe('echo')
      expect(lastChunk(chunks)?.type).toBe('done')
      expect((lastChunk(chunks) as any).finishReason).toBe('tool_calls')
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
        }),
      )

      const toolCall = first.find((c) => c.type === 'tool_call') as any
      expect(toolCall).toBeTruthy()

      const toolCallId = toolCall.toolCall.id as string

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
                arguments: toolCall.toolCall.function.arguments,
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
        }),
      )

      expect(lastChunk(second)?.type).toBe('done')
      expect(second.some((c) => c.type === 'error')).toBe(false)
      const contentChunks = second.filter((c) => c.type === 'content')
      const full = fullTextFromChunks(second)
      expect(typeof full).toBe('string')
      if (contentChunks.length) {
        expect(full).toBe((contentChunks.at(-1) as any).content)
      }
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
        } as any),
        { abortAfterFirstContent: abortController },
      )

      expect(chunks.length).toBeGreaterThan(0)
      expect(typeof fullTextFromChunks(chunks)).toBe('string')

      const tail = lastChunk(chunks)
      expect(tail && (tail.type === 'error' || tail.type === 'done')).toBe(true)
    },
    timeout,
  )

  it(
    'Stream Interruption: connection errors yield error chunks',
    async () => {
      const adapter = createZAIChat('glm-4.7', apiKey!, {
        baseURL: 'http://127.0.0.1:1',
      })

      const chunks = await collectStream(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'Hi' }],
          maxTokens: 16,
        }),
      )

      expect(chunks).toHaveLength(1)
      expect(chunks[0]?.type).toBe('error')
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
        }),
      )
      expect(lastChunk(chunks)?.type).toBe('done')
      expect(chunks.some((c) => c.type === 'error')).toBe(false)
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
        } as any),
      )
      expect(lastChunk(chunks)?.type).toBe('done')
      expect(chunks.some((c) => c.type === 'error')).toBe(false)
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
        }),
      )
      expect(lastChunk(chunks)?.type).toBe('done')
      expect(chunks.some((c) => c.type === 'error')).toBe(false)
      expect(typeof fullTextFromChunks(chunks)).toBe('string')
    },
    timeout,
  )
})

