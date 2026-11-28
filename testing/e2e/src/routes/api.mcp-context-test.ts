import { createFileRoute } from '@tanstack/react-router'
import { chat, EventType } from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  StreamChunk,
} from '@tanstack/ai'

/**
 * Proves `chat({ mcp: { attachResources, prompts, maxTools } })` resolves
 * MCP context into the model-facing messages and applies the tool budget.
 *
 * Uses a synthetic adapter (no aimock) so the prompt-prepended transcript
 * cannot break fixture matching. Middleware captures the post-merge messages
 * and tool list; the route returns JSON.
 */
const adapter: AnyTextAdapter = {
  kind: 'text',
  name: 'mcp-context-e2e',
  model: 'mcp-context-e2e',
  '~types': {
    providerOptions: {},
    inputModalities: ['text'],
    messageMetadataByModality: {},
    toolCapabilities: [],
    toolCallMetadata: undefined,
    systemPromptMetadata: undefined,
  },
  async *chatStream(options): AsyncGenerator<StreamChunk> {
    const runId = options.runId ?? 'mcp-context-run'
    const threadId = options.threadId ?? 'mcp-context-thread'
    const messageId = `${runId}-message`
    const model = 'mcp-context-e2e'
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: 'ok',
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      model,
      finishReason: 'stop',
      timestamp: Date.now(),
    }
  },
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
}

export const Route = createFileRoute('/api/mcp-context-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = new URL(request.url).origin
        const client = await createMCPClient({
          transport: {
            type: 'http',
            url: `${origin}/api/mcp-server`,
          },
        })

        let captured:
          | {
              messageText: string
              toolNames: Array<string>
            }
          | undefined

        const capture: ChatMiddleware = {
          name: 'capture-mcp-context',
          onConfig(ctx, config) {
            if (ctx.phase !== 'beforeModel') return
            captured = {
              messageText: JSON.stringify(config.messages ?? []),
              // After LazyToolManager: eager MCP tools + discovery tool only.
              toolNames: (config.tools ?? []).map((t) => t.name),
            }
          },
        }

        try {
          await chat({
            adapter,
            threadId: 'mcp-context-e2e',
            messages: [
              {
                role: 'user',
                content: '[mcp-context] describe the catalog',
              },
            ],
            mcp: {
              clients: [client],
              connection: 'close',
              attachResources: { uris: ['guitar://catalog'] },
              prompts: { name: 'recommend_guitar' },
              maxTools: 1,
              rankTools: 'annotation',
            },
            middleware: [capture],
            stream: false,
          })
        } catch (error) {
          await client.close().catch(() => {})
          const message =
            error instanceof Error ? error.message : 'mcp-context-test failed'
          return Response.json({ error: message }, { status: 500 })
        }

        if (!captured) {
          return Response.json(
            { error: 'middleware did not capture MCP context' },
            { status: 500 },
          )
        }

        return Response.json(captured)
      },
    },
  },
})
