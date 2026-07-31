import { createFileRoute } from '@tanstack/react-router'
import {
  createMCPClient,
  mcpPromptToMessages,
  mcpResourceToContentPart,
} from '@tanstack/ai-mcp'
import type { McpToolMetadata } from '@tanstack/ai-mcp'

/**
 * Capability-probe endpoint for the in-process MCP server (`api.mcp-server`).
 *
 * Connects via `@tanstack/ai-mcp`, then lists + reads the server's tools,
 * resources, and prompts — converting resources/prompts through the public
 * `mcpResourceToContentPart` / `mcpPromptToMessages` helpers. Returns the
 * result as JSON so a spec can validate the resource/prompt read+convert path
 * end-to-end against a real Streamable-HTTP MCP server, with no LLM involved.
 *
 * `toolMeta` additionally carries each discovered tool's forwarded MCP
 * metadata (display `title` + behavior `annotations`), proving the server's
 * hints survive discovery and reach the host.
 *
 * No aimock dependency: this exercises only the MCP client surface.
 */
export const Route = createFileRoute('/api/mcp-status-test')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin
        const mcpUrl = `${origin}/api/mcp-server`

        const client = await createMCPClient({
          transport: { type: 'http', url: mcpUrl },
        })
        try {
          const discovered = await client.tools()
          const tools = discovered.map((t) => t.name)
          // The server's display title + behavior annotations, as forwarded
          // onto `metadata.mcp` by discovery. `metadata` is `Record<string,
          // any>`, so annotate the read with the public `McpToolMetadata`
          // shape instead of casting.
          const toolMeta = discovered.map((t) => {
            const mcp: McpToolMetadata | undefined = t.metadata?.mcp
            return {
              name: t.name,
              title: mcp?.title,
              annotations: mcp?.annotations,
            }
          })

          const resourceList = await client.resources().catch(() => [])
          const resourceContent: Array<unknown> = []
          for (const r of resourceList) {
            const read = await client.readResource(r.uri)
            for (const c of read.contents) {
              resourceContent.push(mcpResourceToContentPart(c))
            }
          }

          const promptList = await client.prompts().catch(() => [])
          const promptMessages: Array<unknown> = []
          for (const p of promptList) {
            const got = await client.getPrompt(p.name)
            promptMessages.push(...mcpPromptToMessages(got))
          }

          return Response.json({
            tools,
            toolMeta,
            resources: resourceList.map((r) => r.uri),
            prompts: promptList.map((p) => p.name),
            resourceContent,
            promptMessages,
          })
        } finally {
          await client.close()
        }
      },
    },
  },
})
