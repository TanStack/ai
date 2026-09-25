import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toolDefinition,
} from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { webFetchTool } from '@tanstack/ai-anthropic/tools'
import { z } from 'zod'
import type { UIMessage } from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Reproduces issue #604 against the real `webFetchTool()` surface: a user
 * client tool mixed with `webFetchTool()` previously broke when Claude
 * returned a `tool_use` followed by a `server_tool_use` (web_fetch) in the
 * same streaming response — the server tool's `input_json_delta`s appended
 * onto the client tool's input buffer, and the agent loop's `JSON.parse`
 * threw on the concatenated JSON.
 *
 * The route runs the Anthropic adapter against a mounted aimock path that
 * emits the exact SSE shape Claude returns (aimock doesn't natively model
 * `server_tool_use` blocks). Test-only — no production code path should set
 * a custom Anthropic baseURL like this.
 */
export const Route = createFileRoute('/api/anthropic-bug-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/anthropic-bug-test`,
        })

        if (
          new URL(request.url).searchParams.get('case') === 'thinking-order'
        ) {
          const messages: Array<UIMessage> = [
            {
              id: 'initial-user-message',
              role: 'user',
              parts: [{ type: 'text', content: 'Research top AI companies' }],
            },
            {
              id: 'assistant-message',
              role: 'assistant',
              parts: [
                {
                  type: 'thinking',
                  content: 'First signed thinking block',
                  signature: 'signature-1',
                },
                {
                  type: 'tool-call',
                  id: 'srvtoolu_search',
                  name: 'web_search',
                  arguments: '{"query":"top AI companies"}',
                  state: 'input-complete',
                  metadata: {
                    providerExecuted: true,
                    anthropic: {
                      serverToolType: 'web_search',
                      resultBlockType: 'web_search_tool_result',
                      result: [
                        {
                          type: 'web_search_result',
                          title: 'Example result',
                          url: 'https://example.com',
                          encrypted_content: 'opaque-provider-payload',
                        },
                      ],
                    },
                  },
                },
                {
                  type: 'thinking',
                  content: 'Second signed thinking block',
                  signature: 'signature-2',
                },
                {
                  type: 'tool-call',
                  id: 'toolu_create_block',
                  name: 'createBlock',
                  arguments: '{"block":{"type":"entity-grid"}}',
                  state: 'complete',
                  output: { ok: true },
                },
                {
                  type: 'tool-result',
                  toolCallId: 'toolu_create_block',
                  content: '{"ok":true}',
                  state: 'complete',
                },
              ],
            },
            {
              id: 'follow-up-user-message',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  content: '[thinking-tool-order] continue',
                },
              ],
            },
          ]

          const chunks: Array<unknown> = []
          try {
            for await (const chunk of chat({
              ...createChatOptions({ adapter }),
              messages,
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
        }

        // A trivial client tool the user might pair with webFetchTool(). The
        // server lookup just echoes back so the agent loop can settle into
        // the follow-up text response.
        const lookupWeather = toolDefinition({
          name: 'lookup_weather',
          description: 'Return the current weather for a city',
          inputSchema: z.object({ location: z.string() }),
        }).server(async ({ location }) => ({ location, summary: 'sunny' }))

        const chunks: Array<unknown> = []
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            // The real bug surface: a user tool + webFetchTool() in the same
            // request. Pre-fix this combination caused
            // "Failed to parse tool arguments as JSON" in the agent loop.
            tools: [lookupWeather, webFetchTool()],
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
