/**
 * /api/mcp-manual — MANUAL MCP client pattern.
 *
 * Demonstrates the fully-manual use-case:
 *   1. The caller creates the MCP client and owns its lifecycle.
 *   2. Tools are discovered via client.tools() and spread into chat() explicitly.
 *   3. Resources and prompts from the server are fetched and injected into the
 *      conversation as extra context before the user's messages.
 *   4. The MCP client is closed AFTER the SSE stream fully drains (tool calls
 *      fire mid-stream, so an earlier close would abort them).
 *
 * Uses @modelcontextprotocol/server-everything (keyless, via npx) as the MCP
 * server. Only OPENAI_API_KEY is required — no MCP-specific API keys needed.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  createMCPClient,
  mcpPromptToMessages,
  mcpResourceToContentPart,
} from '@tanstack/ai-mcp'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { MCPClient } from '@tanstack/ai-mcp'
import { resolveTextAdapter } from '@/lib/mcp-providers'
import { everythingTransport } from '@/lib/mcp-servers'

/**
 * Wrap the chat stream so the MCP client is closed AFTER the stream has fully
 * drained (or errored). Tool calls fire mid-stream; closing the client earlier
 * would abort any in-flight MCP tool call.
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

export const Route = createFileRoute('/api/mcp-manual')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Capture signal before reading body (it may be aborted after consumption)
        const requestSignal = request.signal

        if (requestSignal.aborted) {
          return new Response(null, { status: 499 }) // 499 = Client Closed Request
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

        // Held in the outer scope so the catch below can close it on any
        // error path that happens before the SSE stream takes ownership.
        let client: MCPClient | undefined
        try {
          // --- MCP: create and connect to the everything server (keyless, stdio) ---
          client = await createMCPClient({
            transport: everythingTransport(),
          })

          // Auto-discover all tools from the MCP server.
          const tools = await client.tools()

          // --- MCP: resources — inject the first resource as context (if any) ---
          const contextMessages: Array<ModelMessage> = []

          try {
            const resources = await client.resources()
            if (resources.length > 0) {
              // Read the first resource and convert each content block to a ContentPart.
              const readResult = await client.readResource(resources[0].uri)
              const parts = readResult.contents.map(mcpResourceToContentPart)
              if (parts.length > 0) {
                contextMessages.push({
                  role: 'user',
                  content: [
                    ...parts,
                    {
                      type: 'text',
                      content:
                        '[MCP resource context injected from server-everything — use this as background information if relevant]',
                    },
                  ],
                })
              }
            }
          } catch {
            // Resources are optional — proceed without them if unavailable.
          }

          // --- MCP: prompts — prepend the first available prompt (if any) ---
          try {
            const availablePrompts = await client.prompts()
            if (availablePrompts.length > 0) {
              const firstPrompt = availablePrompts[0]!
              const promptResult = await client.getPrompt(firstPrompt.name)
              const promptMessages = mcpPromptToMessages(promptResult)
              // Prepend prompt messages before resource context and user messages.
              contextMessages.unshift(...promptMessages)
            }
          } catch {
            // Prompts are optional — proceed without them if unavailable.
          }

          // OPENAI_API_KEY is used by the LLM adapter (separate from the
          // keyless MCP server transport which needs no credentials).
          // The model is encoded in the adapter; do not pass it separately.
          const stream = chat({
            adapter: resolveTextAdapter(params.forwardedProps.provider),
            messages: [...contextMessages, ...params.messages],
            tools,
            agentLoopStrategy: maxIterations(20),
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })

          // Close the MCP client only after the SSE stream fully drains.
          return toServerSentEventsResponse(closeMcpOnDrain(stream, client), {
            abortController,
          })
        } catch (error: any) {
          // The stream never took ownership of the client — close it here so
          // the stdio MCP process isn't leaked.
          if (client) {
            await client.close().catch(() => undefined)
          }
          console.error('[api.mcp-manual] Error:', {
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
