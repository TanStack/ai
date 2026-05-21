import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, maxIterations } from '@tanstack/ai'
import { toolDefinition } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { z } from 'zod'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Reproduces issue #604: a client `tool_use` followed by a `server_tool_use`
 * (web_fetch) in the same Claude streaming response previously caused the
 * server tool's `input_json_delta`s to be appended onto the client tool's
 * input buffer — producing concatenated JSON that threw in the agent loop's
 * `JSON.parse`. The route runs the Anthropic adapter against a mounted
 * aimock path that emits the exact SSE shape Claude returns, collects all
 * stream chunks, and returns them as JSON for the spec to assert against.
 *
 * Test-only — no production code path should ever set a custom Anthropic
 * baseURL like this.
 */
export const Route = createFileRoute('/api/anthropic-bug-test')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/anthropic-bug-test`,
        })

        // A trivial client tool. The server lookup just echoes back so the
        // agent loop can settle into the follow-up text response.
        const lookupWeather = toolDefinition({
          name: 'lookup_weather',
          description: 'Return the current weather for a city',
          inputSchema: z.object({ location: z.string() }),
        }).server(async ({ location }) => ({ location, summary: 'sunny' }))

        const chunks: Array<unknown> = []
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            tools: [lookupWeather],
            messages: [
              {
                role: 'user',
                content: 'Weather in Berlin and fetch example.com',
              },
            ],
            agentLoopStrategy: maxIterations(3),
          })) {
            chunks.push(chunk)
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              chunks,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ chunks, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
