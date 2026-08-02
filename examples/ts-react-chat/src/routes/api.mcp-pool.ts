/**
 * /api/mcp-pool — createMCPClients pool pattern.
 *
 * Demonstrates the createMCPClients() pool API with THREE servers:
 *   1. A pool of three keyless MCP servers is created in one call.
 *   2. createMCPClients() auto-prefixes each server's tools with its config key
 *      (everything_*, memory_*, thinking_*) to prevent name collisions.
 *   3. The pool is passed to chat() via mcp.clients — chat() owns discovery
 *      and closes all three connections when the stream drains (connection: 'close').
 *
 * Uses @modelcontextprotocol/server-everything, @modelcontextprotocol/server-memory,
 * and @modelcontextprotocol/server-sequential-thinking (all keyless, via npx).
 * Only OPENAI_API_KEY is required — no MCP-specific API keys needed.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { resolveTextAdapter } from '@/lib/mcp-providers'
import { createMCPClients } from '@tanstack/ai-mcp'
import {
  everythingTransport,
  memoryTransport,
  sequentialThinkingTransport,
} from '@/lib/mcp-servers'

export const Route = createFileRoute('/api/mcp-pool')({
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
          // createMCPClients connects all three servers in parallel and
          // auto-prefixes tools with the config key (everything_*, memory_*,
          // thinking_*) to prevent collisions.
          // OPENAI_API_KEY is used by the LLM adapter (separate from the
          // keyless MCP server transports which need no credentials).
          const pool = await createMCPClients({
            everything: { transport: everythingTransport() },
            memory: { transport: memoryTransport() },
            thinking: { transport: sequentialThinkingTransport() },
          })

          // chat() manages discovery and closes all pool connections on drain.
          // The model is encoded in the adapter; do not pass it separately.
          const stream = chat({
            adapter: resolveTextAdapter(params.forwardedProps.provider),
            messages: params.messages,
            mcp: {
              clients: [pool],
              connection: 'close',
            },
            agentLoopStrategy: maxIterations(20),
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.mcp-pool] Error:', {
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
