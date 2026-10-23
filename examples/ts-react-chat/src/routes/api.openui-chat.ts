/**
 * /api/openui-chat — data plane for the Open Generative UI Tier F demo.
 *
 * A single local `create_artifact` tool lets the model author a sandboxed-iframe
 * artifact; `@tanstack/ai` reads the authored document off the tool's
 * `metadata.mcp` and emits a `ui-resource` part, which the client renders with
 * the same `MCPAppResource` iframe used for MCP Apps. No MCP server involved.
 *
 * `toolExecution: 'sequential'` keeps the author→emit correlation race-free (see
 * src/lib/openui-tier-f.ts).
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { resolveTextAdapter } from '@/lib/mcp-provider-adapters'
import { TIER_F_SYSTEM_PROMPT, createArtifactTool } from '@/lib/openui-tier-f'

export const Route = createFileRoute('/api/openui-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) return new Response(null, { status: 499 })

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
          const stream = chat({
            adapter: resolveTextAdapter(params.forwardedProps.provider),
            systemPrompts: [TIER_F_SYSTEM_PROMPT],
            messages: params.messages,
            tools: [createArtifactTool()],
            toolExecution: 'sequential',
            agentLoopStrategy: maxIterations(5),
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          if (request.signal.aborted || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
