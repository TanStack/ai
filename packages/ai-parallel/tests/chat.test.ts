import { describe, expect, it } from 'vitest'
import { chat } from '@tanstack/ai'
import type { AnyTextAdapter } from '@tanstack/ai'
import { parallelSearchTool } from '../src/tool'
import { fetchCall, mockFetch, searchResponse } from './test-utils'

describe('Parallel Search inside chat()', () => {
  it('executes a real native server tool and returns its sources to the model', async () => {
    const fetchMock = mockFetch(
      searchResponse([
        {
          url: 'https://example.com/evidence',
          title: 'Current evidence',
          excerpts: ['The cited answer.'],
        },
      ]),
    )
    const search = parallelSearchTool({
      apiKey: 'test-key',
      fetch: fetchMock,
      mode: 'fast',
    })
    const calls: Array<{
      messages: Array<{ role: string; content?: unknown }>
    }> = []
    let iteration = 0
    const adapter = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {
        providerOptions: {},
        inputModalities: ['text'],
        messageMetadataByModality: {
          text: undefined,
          image: undefined,
          audio: undefined,
          video: undefined,
          document: undefined,
        },
        toolCapabilities: [],
        toolCallMetadata: undefined,
        systemPromptMetadata: undefined,
      },
      chatStream: (options: {
        messages: Array<{ role: string; content?: unknown }>
      }) => {
        calls.push(options)
        const currentIteration = iteration++
        return (async function* () {
          const timestamp = Date.now()
          yield {
            type: 'RUN_STARTED',
            runId: 'run_test',
            threadId: 'thread_test',
            timestamp,
          }

          if (currentIteration === 0) {
            yield {
              type: 'TOOL_CALL_START',
              toolCallId: 'call_search',
              toolCallName: 'parallel_search',
              timestamp,
            }
            yield {
              type: 'TOOL_CALL_ARGS',
              toolCallId: 'call_search',
              delta: '{"query":"latest AI research"}',
              timestamp,
            }
            yield {
              type: 'RUN_FINISHED',
              runId: 'run_test',
              threadId: 'thread_test',
              metadata: { tanstack: { finishReason: 'tool_calls' } },
              timestamp,
            }
            return
          }

          yield {
            type: 'TEXT_MESSAGE_START',
            messageId: 'message_test',
            role: 'assistant',
            timestamp,
          }
          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'message_test',
            delta: 'The source confirms the answer.',
            timestamp,
          }
          yield {
            type: 'TEXT_MESSAGE_END',
            messageId: 'message_test',
            timestamp,
          }
          yield {
            type: 'RUN_FINISHED',
            runId: 'run_test',
            threadId: 'thread_test',
            metadata: { tanstack: { finishReason: 'stop' } },
            timestamp,
          }
        })()
      },
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    const result = await chat({
      adapter,
      tools: [search],
      messages: [{ role: 'user', content: 'Find the latest research.' }],
      stream: false,
    })

    expect(result).toBe('The source confirms the answer.')
    expect(fetchCall(fetchMock).body).toEqual({
      search_queries: ['latest AI research'],
      mode: 'fast',
    })
    expect(calls).toHaveLength(2)
    const toolResult = calls[1]?.messages.find(
      (message) => message.role === 'tool',
    )
    expect(JSON.stringify(toolResult)).toContain('https://example.com/evidence')
  })
})
