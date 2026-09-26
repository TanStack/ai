import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, toolDefinition } from '@tanstack/ai'
import { BedrockConverseTextAdapter } from '@tanstack/ai-bedrock'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { z } from 'zod'
import type { ResolvedBedrockAuth } from '@tanstack/ai-bedrock'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'
// Haiku 4.5 supports prompt caching on system prompts, messages, and tools.
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

/**
 * `@aws-sdk/client-bedrock-runtime` defaults to HTTP/2 for streaming calls and
 * aimock speaks HTTP/1.1, so the E2E client pins the HTTP/1.1 handler. The
 * adapter's request building and stream decoding are untouched.
 */
class Http1ConverseAdapter extends BedrockConverseTextAdapter<typeof MODEL> {
  protected override buildClientConfig(
    resolved: ResolvedBedrockAuth,
    region: string,
    endpoint: string | undefined,
  ) {
    return {
      ...super.buildClientConfig(resolved, region, endpoint),
      requestHandler: new NodeHttpHandler(),
    }
  }
}

export const Route = createFileRoute('/api/bedrock-converse-cache')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = new Http1ConverseAdapter(
          {
            apiKey: DUMMY_KEY,
            baseURL: `${LLMOCK_DEFAULT_BASE}/bedrock-converse-cache`,
            region: 'us-east-1',
          },
          MODEL,
        )
        const lookup = toolDefinition({
          name: 'lookup',
          description: 'Looks nothing up.',
          inputSchema: z.object({ query: z.string() }),
          outputSchema: z.string(),
          metadata: { cachePoint: { type: 'default' } },
        }).server(async () => '')

        let text = ''
        let usage: Record<string, unknown> | undefined
        let runError: string | undefined
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            systemPrompts: [
              {
                content: 'Stable instructions.',
                metadata: { cachePoint: { type: 'default' } },
              },
            ],
            tools: [lookup],
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    content: 'go',
                    metadata: { cachePoint: { type: 'default' } },
                  },
                ],
              },
            ],
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
            if (chunk.type === 'RUN_FINISHED') {
              usage = chunk.usage as Record<string, unknown> | undefined
            }
            // The adapter reports SDK failures as RUN_ERROR instead of throwing.
            if (chunk.type === 'RUN_ERROR') runError = chunk.message
          }
          if (runError !== undefined) throw new Error(runError)
          return new Response(
            JSON.stringify({ ok: true, observed: JSON.parse(text), usage }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
