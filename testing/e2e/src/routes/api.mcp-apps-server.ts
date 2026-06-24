import { createFileRoute } from '@tanstack/react-router'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

/**
 * In-process mock MCP server exercising the **MCP Apps** plumbing.
 *
 * Mirrors `api.mcp-server`, but its single tool `show_widget` LINKS a UI
 * resource via `_meta.ui.resourceUri = 'ui://show_widget'`, and the matching
 * `ui://show_widget` resource is registered with `text/html` content. This is
 * the data half of MCP Apps:
 *
 *   - When `chat()` discovers this tool through `@tanstack/ai-mcp` and the tool
 *     executes, `@tanstack/ai` eagerly reads the linked `ui://` resource and
 *     emits a `ui-resource` CUSTOM event so a `UIResourcePart` lands on the
 *     assistant message. The HTML carries the distinctive token
 *     `MCP_APPS_WIDGET_OK` so the spec can assert the widget HTML survived the
 *     read → CUSTOM event → stream path.
 *   - The same tool is the interactive half: a POST to
 *     `api.mcp-apps-call` (mounting `createMcpAppCallHandler`) proxies
 *     `callTool('show_widget')` here and gets back the structured result
 *     carrying `MCP_APPS_CALL_OK`.
 *
 * Stateless mode (no `sessionIdGenerator`): a fresh server + transport per
 * request, matching `api.mcp-server`.
 */
const WIDGET_URI = 'ui://show_widget'
const WIDGET_HTML =
  '<!doctype html><html><body><div id="widget">MCP_APPS_WIDGET_OK</div></body></html>'

function createMockAppsMcpServer(): McpServer {
  const server = new McpServer({
    name: 'mcp-apps-mock',
    version: '0.0.1',
  })

  // A tool that links a ui:// resource via the MCP Apps `_meta.ui.resourceUri`
  // convention. `@tanstack/ai-mcp` discovery stamps this onto the ServerTool's
  // `metadata.mcp.uiResourceUri`, which drives the ui-resource emit at runtime.
  const widgetTool = server.registerTool(
    'show_widget',
    {
      description: 'Render a widget for the given title',
      inputSchema: { title: z.string() },
      outputSchema: { title: z.string(), status: z.string() },
    },
    ({ title }) => {
      const payload = { title, status: 'MCP_APPS_CALL_OK' }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    },
  )
  // `registerTool`'s config doesn't accept `_meta` directly in the SDK; the
  // RegisteredTool exposes `_meta` as a mutable property surfaced at list time.
  widgetTool._meta = { ui: { resourceUri: WIDGET_URI } }

  // The linked ui:// resource — its HTML is what the client widget would
  // render. We only assert OUR plumbing carries this HTML, not that any
  // third-party renderer mounts it.
  server.registerResource(
    'show_widget_ui',
    WIDGET_URI,
    { description: 'Widget UI for show_widget', mimeType: 'text/html' },
    () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: 'text/html',
          text: WIDGET_HTML,
        },
      ],
    }),
  )

  return server
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createMockAppsMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp-apps-server')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
