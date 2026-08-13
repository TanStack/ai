import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import type { MCPClient } from '@tanstack/ai-mcp'
import { createTextAdapter } from '@/lib/providers'

/**
 * MCP Apps — data plane. Drives a real `chat()` agent loop whose tools are
 * discovered from the in-process MCP Apps server (`api.mcp-apps-server`).
 *
 * The client is passed via `chat({ mcp: { clients: [mcp] } })` (NOT as
 * pre-discovered `tools`) on purpose: only `MCPManager.discover()` binds the
 * client's `readResource` onto the ui-linked tool's metadata, which is what
 * lets `@tanstack/ai` eagerly read `ui://show_widget` and emit the
 * `ui-resource` CUSTOM event after `show_widget` executes. With
 * `connection: 'close'` (default), chat() owns the client lifecycle and closes
 * it once the stream drains, so we don't close it ourselves.
 */
export const Route = createFileRoute('/api/mcp-apps-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const onRequestAbort = () => abortController.abort()
        request.signal.addEventListener('abort', onRequestAbort, { once: true })

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

        const origin = new URL(request.url).origin
        const mcpUrl = `${origin}/api/mcp-apps-server`

        let mcp: MCPClient | undefined
        try {
          mcp = await createMCPClient({
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
            mcp: { clients: [mcp] },
            threadId: params.threadId,
            runId: params.runId,
            agentLoopStrategy: maxIterations(5),
            abortController,
          })

          // chat() owns the MCP client (connection: 'close' default) and closes
          // it after the stream drains, so we don't close it here.
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          if (mcp) {
            await mcp.close().catch(() => undefined)
          }
          console.error('[api.mcp-apps-chat] Error:', error)
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
