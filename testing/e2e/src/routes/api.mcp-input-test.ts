import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient, isMCPInputRequiredError } from '@tanstack/ai-mcp'
import type { AnyTool, StreamChunk } from '@tanstack/ai'
import type { MCPClient } from '@tanstack/ai-mcp'
import { createTextAdapter } from '@/lib/providers'

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
 * Give each input request of `tool` the interrupt `reason`. The thrown
 * value keeps its MCP input-required shape.
 */
function withInterruptReason(tool: AnyTool, reason: string): AnyTool {
  const { execute } = tool
  if (!execute) return tool
  return {
    ...tool,
    execute: async (args, context) => {
      try {
        return await execute(args, context)
      } catch (error) {
        if (isMCPInputRequiredError(error)) Object.assign(error, { reason })
        throw error
      }
    },
  }
}

/**
 * Runs `chat()` with the tools of `api.mcp-input-server`.
 *
 * The first request pauses with an `mcp_input` interrupt.
 * A second request with `parentRunId` and `resume` sends the answer.
 * The tool then runs again and returns the forecast.
 * `forwardedProps.interruptReason` sets the reason of the pause.
 */
export const Route = createFileRoute('/api/mcp-input-test')({
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
        const origin = new URL(request.url).origin

        let mcp: MCPClient | undefined
        try {
          mcp = await createMCPClient({
            transport: { type: 'http', url: `${origin}/api/mcp-input-server` },
          })
          const reason =
            typeof fp.interruptReason === 'string'
              ? fp.interruptReason
              : undefined
          const mcpTools = await mcp.tools()
          const tools = reason
            ? mcpTools.map((tool) => withInterruptReason(tool, reason))
            : mcpTools
          const stream = chat({
            ...createTextAdapter('openai', undefined, aimockPort, testId),
            messages: params.messages,
            tools,
            threadId: params.threadId,
            runId: params.runId,
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            ...(params.resume ? { resume: params.resume } : {}),
            agentLoopStrategy: maxIterations(5),
          })
          return toServerSentEventsResponse(closeMcpOnDrain(stream, mcp))
        } catch (error) {
          if (mcp) await mcp.close().catch(() => undefined)
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
