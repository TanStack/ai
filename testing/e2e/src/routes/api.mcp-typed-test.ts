import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import type { StreamChunk } from '@tanstack/ai'
import type { DescriptorFromServer, MCPClient } from '@tanstack/ai-mcp'
import { createTextAdapter } from '@/lib/providers'
import type { typedServer } from '@/lib/mcp-typed-server'

type TypedClient = MCPClient<DescriptorFromServer<typeof typedServer>>

// The client types come from the server object. The calls go over HTTP.
function connect(request: Request, token: string) {
  const origin = new URL(request.url).origin
  return createMCPClient<typeof typedServer>({
    transport: {
      type: 'http',
      url: `${origin}/api/mcp-typed-server`,
      headers: { Authorization: `Bearer ${token}` },
    },
  })
}

async function* closeMcpOnDrain(
  stream: AsyncIterable<StreamChunk>,
  mcp: TypedClient,
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
 * Uses the tools of `api.mcp-typed-server` with a bearer token.
 *
 * - GET returns the discovered tools, so a test can read `outputSchema`.
 *   It also calls `forecast` with the typed `callTool`.
 * - POST runs chat() with those tools.
 */
export const Route = createFileRoute('/api/mcp-typed-test')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const mcp = await connect(request, 'alice')
        try {
          const tools = await mcp.tools()
          const forecast = await mcp.callTool('forecast', { city: 'Paris' })
          // `structuredContent` is typed as the tool output: string.
          const forecastText: string | undefined = forecast.structuredContent
          const brief = await mcp.getPrompt('trip_brief', { city: 'Paris' })
          return Response.json({
            tools: tools.map((tool) => ({
              name: tool.name,
              outputSchema: tool.outputSchema ?? null,
            })),
            forecast: forecastText ?? null,
            brief: brief.messages,
          })
        } finally {
          await mcp.close()
        }
      },
      POST: async ({ request }) => {
        const params = await chatParamsFromRequestBody(await request.json())
        const fp = params.forwardedProps
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined
        const token = typeof fp.token === 'string' ? fp.token : 'alice'

        let mcp: TypedClient | undefined
        try {
          mcp = await connect(request, token)
          const stream = chat({
            ...createTextAdapter('openai', undefined, aimockPort, testId),
            messages: params.messages,
            tools: await mcp.tools(),
            threadId: params.threadId,
            runId: params.runId,
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
