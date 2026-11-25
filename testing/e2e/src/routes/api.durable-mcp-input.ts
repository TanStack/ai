import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type {
  AnyTextAdapter,
  ToolExecutionContext,
  ToolInputResponse,
} from '@tanstack/ai'

const persistence = memoryPersistence()
const requestSchema = z.object({
  threadId: z.string(),
  runId: z.string(),
  parentRunId: z.string().optional(),
  resume: z
    .array(
      z.object({
        interruptId: z.string(),
        status: z.enum(['resolved', 'cancelled']),
        payload: z.unknown().optional(),
      }),
    )
    .optional(),
})

export const Route = createFileRoute('/api/durable-mcp-input')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = requestSchema.parse(await request.json())
        const toolCallId = `ask-city-${params.threadId}`
        const responses: Array<ToolInputResponse | undefined> = []
        // Provider-free adapter; both requests use the real persistence middleware.
        const adapter: AnyTextAdapter = {
          kind: 'text',
          name: 'fixed',
          model: 'test-model',
          '~types': {},
          async *chatStream() {
            yield {
              type: 'RUN_STARTED',
              threadId: params.threadId,
              runId: params.runId,
              timestamp: 1,
            }
            if (!params.parentRunId) {
              yield {
                type: 'TOOL_CALL_START',
                toolCallId,
                toolCallName: 'ask_city',
                timestamp: 1,
              }
              yield {
                type: 'TOOL_CALL_ARGS',
                toolCallId,
                delta: '{}',
                timestamp: 1,
              }
            }
            yield {
              type: 'RUN_FINISHED',
              threadId: params.threadId,
              runId: params.runId,
              finishReason: params.parentRunId ? 'stop' : 'tool_calls',
              timestamp: 1,
            }
          },
          structuredOutput: async () => ({ data: {}, rawText: '{}' }),
        } as unknown as AnyTextAdapter
        const events = []
        for await (const event of chat({
          ...params,
          adapter,
          messages: params.parentRunId
            ? []
            : [{ role: 'user', content: 'Ask for a city' }],
          tools: [
            {
              name: 'ask_city',
              description: 'Ask for a city',
              execute: (_args: unknown, ctx?: ToolExecutionContext) => {
                responses.push(ctx?.inputResponse)
                if (ctx?.inputResponse) return ctx.inputResponse
                throw {
                  name: 'MCPInputRequiredError',
                  kind: 'form',
                  request: { message: 'Which city?' },
                }
              },
            },
          ],
          middleware: [withPersistence(persistence)],
          debug: false,
        }))
          events.push(event)
        return Response.json({
          events,
          responses,
          pending: await persistence.stores.interrupts!.listPending(
            params.threadId,
          ),
          run: await persistence.stores.runs!.get(params.runId),
        })
      },
    },
  },
})
