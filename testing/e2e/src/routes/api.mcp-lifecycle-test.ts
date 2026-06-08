import { createFileRoute } from '@tanstack/react-router'
import { chat, chatParamsFromRequestBody, maxIterations } from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import type { StreamChunk } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'

/**
 * Validates `chat({ mcp: { connection } })` lifecycle semantics end-to-end.
 *
 * Runs a real `chat()` agent loop with one MCP client, drains it, then probes
 * the client AFTER the run:
 *   - `connection: 'close'` (default) → chat closed the client → `client.tools()`
 *     now throws → `survivedAfterRun: false`.
 *   - `connection: 'keep-alive'`      → chat left the client open → `client.tools()`
 *     still works → `survivedAfterRun: true` (we then close it ourselves).
 *
 * Returns JSON so the spec can assert the lifecycle deterministically without
 * scraping the SSE stream. The aimock fixture (`fixtures/mcp/lifecycle.json`)
 * returns a plain text turn (no tool call) — the tool isn't needed; only the
 * client lifecycle is under test.
 */
export const Route = createFileRoute('/api/mcp-lifecycle-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const connection =
          fp.connection === 'keep-alive' ? 'keep-alive' : 'close'

        const origin = new URL(request.url).origin
        const mcpUrl = `${origin}/api/mcp-server`

        try {
          const client = await createMCPClient({
            transport: { type: 'http', url: mcpUrl },
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
            mcp: { clients: [client], connection },
            agentLoopStrategy: maxIterations(3),
          })

          // Drain internally so chat()'s mcp dispose (the `finally`) has run by
          // the time we probe the client below.
          for await (const _chunk of stream as AsyncIterable<StreamChunk>) {
            // discard
          }

          let survivedAfterRun = false
          try {
            await client.tools()
            survivedAfterRun = true
          } catch {
            survivedAfterRun = false
          }

          // For keep-alive, chat left the connection open — close it now so the
          // test doesn't leak an MCP connection.
          if (survivedAfterRun) {
            await client.close().catch(() => {})
          }

          return Response.json({ connection, survivedAfterRun })
        } catch (error) {
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
