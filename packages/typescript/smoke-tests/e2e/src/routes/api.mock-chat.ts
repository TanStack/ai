import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Mock chat scenarios for deterministic E2E testing.
 * Each scenario returns a predefined sequence of AG-UI events.
 */
type ScenarioName =
  | 'simple-text'
  | 'tool-call'
  | 'multi-tool'
  | 'text-tool-text'
  | 'error'

interface MockScenario {
  chunks: Array<StreamChunk>
  delayMs?: number
}

const scenarios: Record<ScenarioName, MockScenario> = {
  'simple-text': {
    chunks: [
      {
        type: 'RUN_STARTED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: 'mock-msg-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'mock-msg-1',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: 'Hello! ',
        content: 'Hello! ',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'mock-msg-1',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: 'This is a mock response.',
        content: 'Hello! This is a mock response.',
      },
      {
        type: 'TEXT_MESSAGE_END',
        messageId: 'mock-msg-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'RUN_FINISHED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
        finishReason: 'stop',
      },
    ],
    delayMs: 10,
  },

  'tool-call': {
    chunks: [
      {
        type: 'RUN_STARTED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'mock-tc-1',
        toolName: 'get_weather',
        model: 'mock-model',
        timestamp: Date.now(),
        index: 0,
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'mock-tc-1',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: '{"city":',
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'mock-tc-1',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: '"New York"}',
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'mock-tc-1',
        toolName: 'get_weather',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'CUSTOM',
        model: 'mock-model',
        timestamp: Date.now(),
        name: 'tool-input-available',
        data: {
          toolCallId: 'mock-tc-1',
          toolName: 'get_weather',
          input: { city: 'New York' },
        },
      },
      {
        type: 'RUN_FINISHED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
        finishReason: 'tool_calls',
      },
    ],
    delayMs: 10,
  },

  'multi-tool': {
    chunks: [
      {
        type: 'RUN_STARTED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'mock-tc-1',
        toolName: 'get_weather',
        model: 'mock-model',
        timestamp: Date.now(),
        index: 0,
      },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'mock-tc-2',
        toolName: 'get_time',
        model: 'mock-model',
        timestamp: Date.now(),
        index: 1,
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'mock-tc-1',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: '{"city":"NYC"}',
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'mock-tc-2',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: '{"timezone":"EST"}',
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'mock-tc-1',
        toolName: 'get_weather',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'mock-tc-2',
        toolName: 'get_time',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'CUSTOM',
        model: 'mock-model',
        timestamp: Date.now(),
        name: 'tool-input-available',
        data: {
          toolCallId: 'mock-tc-1',
          toolName: 'get_weather',
          input: { city: 'NYC' },
        },
      },
      {
        type: 'CUSTOM',
        model: 'mock-model',
        timestamp: Date.now(),
        name: 'tool-input-available',
        data: {
          toolCallId: 'mock-tc-2',
          toolName: 'get_time',
          input: { timezone: 'EST' },
        },
      },
      {
        type: 'RUN_FINISHED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
        finishReason: 'tool_calls',
      },
    ],
    delayMs: 10,
  },

  'text-tool-text': {
    chunks: [
      {
        type: 'RUN_STARTED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: 'mock-msg-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'mock-msg-1',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: 'Let me check the weather for you.',
        content: 'Let me check the weather for you.',
      },
      {
        type: 'TEXT_MESSAGE_END',
        messageId: 'mock-msg-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'mock-tc-1',
        toolName: 'get_weather',
        model: 'mock-model',
        timestamp: Date.now(),
        index: 0,
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'mock-tc-1',
        model: 'mock-model',
        timestamp: Date.now(),
        delta: '{"city":"Paris"}',
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'mock-tc-1',
        toolName: 'get_weather',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'CUSTOM',
        model: 'mock-model',
        timestamp: Date.now(),
        name: 'tool-input-available',
        data: {
          toolCallId: 'mock-tc-1',
          toolName: 'get_weather',
          input: { city: 'Paris' },
        },
      },
      {
        type: 'RUN_FINISHED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
        finishReason: 'tool_calls',
      },
    ],
    delayMs: 10,
  },

  error: {
    chunks: [
      {
        type: 'RUN_STARTED',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
      },
      {
        type: 'RUN_ERROR',
        runId: 'mock-run-1',
        model: 'mock-model',
        timestamp: Date.now(),
        error: {
          message: 'Mock error: Something went wrong',
          code: 'MOCK_ERROR',
        },
      },
    ],
    delayMs: 10,
  },
}

/**
 * Create an async generator from scenario chunks
 */
async function* createMockStream(
  scenario: MockScenario,
): AsyncGenerator<StreamChunk> {
  for (const chunk of scenario.chunks) {
    if (scenario.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, scenario.delayMs))
    }
    yield { ...chunk, timestamp: Date.now() }
  }
}

export const Route = createFileRoute('/api/mock-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        // fetchServerSentEvents wraps the body in a `data` property
        const scenarioName =
          (body.data?.scenario as ScenarioName) ||
          (body.scenario as ScenarioName) ||
          'simple-text'

        const scenario = scenarios[scenarioName]
        if (!scenario) {
          return new Response(
            JSON.stringify({ error: `Unknown scenario: ${scenarioName}` }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        const stream = createMockStream(scenario)
        const abortController = new AbortController()

        // Use the same SSE stream helper as the real API
        const sseStream = toServerSentEventsStream(stream, abortController)

        return new Response(sseStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
