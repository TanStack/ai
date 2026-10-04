import { createFileRoute } from '@tanstack/react-router'
import { MCPToolFilterError, createMCPClient } from '@tanstack/ai-mcp'

/**
 * `toolName` and the list form of `toolFilter`, against the e2e MCP server.
 * Returns the names the model would see, and the error for a missing name.
 */
export const Route = createFileRoute('/api/mcp-tool-options-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = `${new URL(request.url).origin}/api/mcp-server`

        const named = await createMCPClient({
          transport: { type: 'http', url },
          toolName: (tool) => `mcp__store__${tool.name}`,
          toolFilter: ['get_guitar_price'],
          requestOptions: { timeout: 30_000 },
        })
        const names = (await named.tools()).map((tool) => tool.name)
        await named.close()

        const strict = await createMCPClient({
          transport: { type: 'http', url },
          toolFilter: ['get_guitar_price', 'no_such_tool'],
        })
        let missing: Array<string> = []
        let errorName = ''
        try {
          await strict.tools()
        } catch (error) {
          if (error instanceof MCPToolFilterError) {
            missing = error.missing
            errorName = error.name
          }
        } finally {
          await strict.close()
        }

        return Response.json({ names, missing, errorName })
      },
    },
  },
})
