/**
 * /api/mcp-chat — Managed MCP lifecycle via chat({ mcp }).
 *
 * Demonstrates the chat({ mcp }) prop pattern with MULTIPLE clients:
 *   1. Two MCP clients are created (everything + memory servers, both keyless).
 *   2. They are passed to chat() via mcp.clients — chat() handles tool
 *      discovery and closes both clients when the stream drains (connection: 'close').
 *   3. No manual client.tools() or client.close() calls needed.
 *
 * Uses @modelcontextprotocol/server-everything and @modelcontextprotocol/server-memory
 * (both keyless, via npx). Only OPENAI_API_KEY is required — no MCP-specific keys needed.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { resolveTextAdapter } from '@/lib/mcp-providers'
import { everythingTransport, memoryTransport } from '@/lib/mcp-servers'

export const Route = createFileRoute('/api/mcp-chat')({
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

        try {
          // Connect two keyless MCP servers in parallel.
          // Prefixes disambiguate tools if both servers expose same-named tools.
          // OPENAI_API_KEY is used by the LLM adapter (separate from the
          // keyless MCP server transports which need no credentials).
          // Settle (don't Promise.all) so that if one server fails to connect,
          // the sibling that DID connect is closed before rethrowing — no
          // leaked stdio subprocess. (createMCPClients does this for you;
          // shown manually here because this route demonstrates individual clients.)
          const settled = await Promise.allSettled([
            createMCPClient({
              transport: everythingTransport(),
              prefix: 'everything',
            }),
            createMCPClient({
              transport: memoryTransport(),
              prefix: 'memory',
            }),
          ])
          const rejected = settled.find(
            (r): r is PromiseRejectedResult => r.status === 'rejected',
          )
          if (rejected) {
            await Promise.allSettled(
              settled.map((r) =>
                r.status === 'fulfilled' ? r.value.close() : Promise.resolve(),
              ),
            )
            throw rejected.reason
          }
          const clients = settled.flatMap((r) =>
            r.status === 'fulfilled' ? [r.value] : [],
          )

          // chat() discovers tools from both clients and closes them when the
          // stream drains — connection: 'close' (the default; shown explicitly).
          // The model is encoded in the adapter; do not pass it separately.
          const stream = chat({
            adapter: resolveTextAdapter(params.forwardedProps.provider),
            messages: params.messages,
            mcp: {
              clients,
              connection: 'close',
            },
            agentLoopStrategy: maxIterations(20),
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.mcp-chat] Error:', {
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
