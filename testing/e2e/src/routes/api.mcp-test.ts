import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import type { StreamChunk } from '@tanstack/ai'
import type { MCPClient } from '@tanstack/ai-mcp'
import { createTextAdapter } from '@/lib/providers'

/**
 * Wrap the chat stream so the MCP client is closed only AFTER the stream has
 * fully drained (or errored). Tool calls fire mid-stream, so closing the
 * client earlier would abort an in-flight MCP tool call.
 */
async function* closeMcpOnDrain(
  stream: AsyncIterable<StreamChunk>,
  mcp: MCPClient,
): AsyncGenerator<StreamChunk> {
  try {
    for await (const chunk of stream) {
      yield chunk
    }
  } finally {
    await mcp.close()
  }
}

/**
 * Drives a real `chat()` agent loop whose tools are discovered from the
 * in-process mock MCP server (`api.mcp-server`) via `@tanstack/ai-mcp`.
 *
 * Flow:
 *   1. `createMCPClient({ transport: { type: 'http', url } })` connects to the
 *      mock MCP server at this dev server's own origin.
 *   2. `mcp.tools()` auto-discovers the server's tools (here: `get_guitar_price`)
 *      as TanStack `ServerTool`s whose `execute` proxies to the MCP server.
 *   3. `chat()` runs the OpenAI adapter against aimock. The aimock fixture
 *      emits a `get_guitar_price` tool call; the MCP tool executes for real
 *      against the mock server, returning `{ id, price: 1999 }`; the result is
 *      fed back and the model emits a final answer mentioning the price.
 *   4. The MCP client is closed in `finally` AFTER the stream fully drains —
 *      closing earlier would kill the connection mid tool-call.
 */
export const Route = createFileRoute('/api/mcp-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        // Bridge request cancellation into the chat abort controller so an
        // abort during setup (before the SSE handoff) is observed.
        const onRequestAbort = () => abortController.abort()
        request.signal.addEventListener('abort', onRequestAbort, {
          once: true,
        })

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fp = params.forwardedProps
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

        // The mock MCP server lives at this same dev server's origin.
        const origin = new URL(request.url).origin
        const mcpUrl = `${origin}/api/mcp-server`

        // Held in the outer scope so the catch below can close it on any
        // error path that happens before the SSE stream takes ownership.
        let mcp: MCPClient | undefined
        try {
          mcp = await createMCPClient({
            transport: { type: 'http', url: mcpUrl },
          })

          const tools = await mcp.tools()

          const adapterOptions = createTextAdapter(
            'openai',
            undefined,
            aimockPort,
            testId,
          )

          const stream = chat({
            ...adapterOptions,
            messages: params.messages,
            tools,
            threadId: params.threadId,
            runId: params.runId,
            agentLoopStrategy: maxIterations(5),
            abortController,
          })

          // Close the MCP client only after the SSE stream fully drains —
          // tool calls fire mid-stream, so an early close would abort them.
          return toServerSentEventsResponse(closeMcpOnDrain(stream, mcp), {
            abortController,
          })
        } catch (error) {
          // The stream never took ownership of the client — close it here.
          if (mcp) {
            await mcp.close().catch(() => undefined)
          }
          console.error('[api.mcp-test] Error:', error)
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
