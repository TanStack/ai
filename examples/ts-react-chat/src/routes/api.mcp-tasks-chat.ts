/**
 * /api/mcp-tasks-chat — task-required MCP tool execution via chat({ mcp }).
 *
 * Connects to the in-process Streamable HTTP MCP server at
 * `/api/mcp-tasks-server` (same origin), whose only tool declares
 * `execution.taskSupport: 'required'`. `@tanstack/ai-mcp` detects this during
 * discovery and routes the call through the SDK's experimental task flow
 * (create task → poll status → fetch result) instead of ordinary `tools/call`.
 *
 * From chat()'s perspective nothing changes — the tool call resolves like any
 * other, just ~4 seconds later while the UI shows the pending tool call.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { resolveTextAdapter } from '@/lib/mcp-provider-adapters'

export const Route = createFileRoute('/api/mcp-tasks-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal

        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        let client
        try {
          // The task server is hosted by this same dev server — derive its
          // URL from the incoming request so the demo works on any port.
          const origin = new URL(request.url).origin
          client = await createMCPClient({
            transport: { type: 'http', url: `${origin}/api/mcp-tasks-server` },
          })

          // chat() discovers the task-required tool and closes the client
          // when the stream drains — connection: 'close' (the default; shown
          // explicitly). The model is encoded in the adapter.
          const stream = chat({
            adapter: resolveTextAdapter(params.forwardedProps.provider),
            messages: params.messages,
            mcp: {
              clients: [client],
              connection: 'close',
            },
            agentLoopStrategy: maxIterations(20),
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          // chat() only owns the client once the stream is consumed — if
          // setup throws before the response is returned, close it here.
          if (client) await client.close().catch(() => {})
          console.error('[api.mcp-tasks-chat] Error:', {
            message: error?.message,
            name: error?.name,
            stack: error?.stack,
          })
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({ error: error.message || 'An error occurred' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
