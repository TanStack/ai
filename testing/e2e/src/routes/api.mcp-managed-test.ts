import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { createTextAdapter } from '@/lib/providers'

/**
 * Drives a real `chat()` agent loop with MCP tool discovery managed entirely
 * by `chat({ mcp })` — the caller does NOT manually call `mcp.tools()` or
 * `mcp.close()`. This verifies that passing `mcp: { clients, connection }` to
 * `chat()` correctly:
 *   1. Auto-discovers tools from the MCP client (here: `get_guitar_price`).
 *   2. Runs the tool inside the agent loop via the aimock fixture.
 *   3. Closes the client after the stream drains (connection: 'close').
 *
 * Contrast with `api.mcp-test.ts` which manually calls `mcp.tools()`, wraps
 * the stream in a `closeMcpOnDrain` generator, and passes `tools` directly.
 */
export const Route = createFileRoute('/api/mcp-managed-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
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

        const fp = params.forwardedProps
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

        // The mock MCP server lives at this same dev server's origin.
        const origin = new URL(request.url).origin
        const mcpServerUrl = `${origin}/api/mcp-server`

        try {
          // Create the MCP client — but do NOT call client.tools() or
          // client.close() here. Pass it to chat({ mcp }) and let chat manage
          // the full lifecycle: discovery, execution, and teardown.
          const client = await createMCPClient({
            transport: { type: 'http', url: mcpServerUrl },
          })

          const adapterOptions = createTextAdapter(
            'openai',
            undefined,
            aimockPort,
            testId,
          )

          const stream = chat({
            ...adapterOptions,
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            mcp: { clients: [client], connection: 'close' },
            agentLoopStrategy: maxIterations(5),
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          console.error('[api.mcp-managed-test] Error:', error)
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
