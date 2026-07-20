import { createFileRoute } from '@tanstack/react-router'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

/**
 * In-process MCP server for the **STATIC** half of the MCP Apps demo.
 *
 * `show_weather_card` links a `ui://weather/card` resource via the MCP Apps
 * `_meta.ui.resourceUri` convention. When `chat()` discovers and runs the tool,
 * `@tanstack/ai` reads the linked resource and streams a `ui-resource` part to
 * the client, which renders the HTML below in a sandboxed iframe.
 *
 * The widget is display-only: self-contained HTML/CSS with no app-bridge, so it
 * never calls a tool back. (The Three.js server is the interactive counterpart.)
 * Served stateless — a fresh server + transport per request.
 */
const CARD_URI = 'ui://weather/card'

// A self-contained, display-only forecast card. No script, no app-bridge — it
// just renders. (A static MCP App is server-provided display UI.)
const CARD_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        background: transparent;
      }
      .card {
        max-width: 420px;
        margin: 4px auto;
        padding: 20px 22px;
        border-radius: 18px;
        color: #fff;
        background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 60%, #38bdf8 100%);
        box-shadow: 0 10px 30px rgba(2, 132, 199, 0.35);
      }
      .top { display: flex; align-items: center; justify-content: space-between; }
      .city { font-size: 20px; font-weight: 600; }
      .desc { font-size: 13px; opacity: 0.85; }
      .now { display: flex; align-items: center; gap: 12px; margin: 14px 0 18px; }
      .temp { font-size: 52px; font-weight: 700; line-height: 1; }
      .sun { filter: drop-shadow(0 2px 6px rgba(0,0,0,0.2)); }
      .days { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
      .day {
        text-align: center;
        background: rgba(255, 255, 255, 0.14);
        border-radius: 12px;
        padding: 10px 4px;
      }
      .day .dow { font-size: 11px; opacity: 0.85; }
      .day .hi { font-size: 14px; font-weight: 600; margin-top: 4px; }
      .day .lo { font-size: 12px; opacity: 0.75; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="top">
        <div>
          <div class="city">San Francisco</div>
          <div class="desc">Partly cloudy · feels like 17°</div>
        </div>
        <svg class="sun" width="56" height="56" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="5" fill="#fde68a" />
          <g stroke="#fde68a" stroke-width="2" stroke-linecap="round">
            <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" />
          </g>
        </svg>
      </div>
      <div class="now">
        <div class="temp">18°</div>
        <div class="desc">High 21° · Low 13°<br />Wind 12 km/h · Humidity 64%</div>
      </div>
      <div class="days">
        <div class="day"><div class="dow">MON</div><div class="hi">21°</div><div class="lo">13°</div></div>
        <div class="day"><div class="dow">TUE</div><div class="hi">19°</div><div class="lo">12°</div></div>
        <div class="day"><div class="dow">WED</div><div class="hi">22°</div><div class="lo">14°</div></div>
        <div class="day"><div class="dow">THU</div><div class="hi">20°</div><div class="lo">13°</div></div>
        <div class="day"><div class="dow">FRI</div><div class="hi">23°</div><div class="lo">15°</div></div>
      </div>
    </div>
  </body>
</html>`

function createWeatherMcpServer(): McpServer {
  const server = new McpServer({ name: 'mcp-apps-weather', version: '0.0.1' })

  const tool = server.registerTool(
    'show_weather_card',
    {
      description:
        'Show a visual weather forecast card for a city as an interactive UI widget.',
      inputSchema: {
        city: z.string().describe('City to show the forecast for'),
      },
      outputSchema: { city: z.string(), summary: z.string() },
    },
    ({ city }) => {
      const payload = {
        city,
        summary: `Rendered the weather card for ${city}.`,
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    },
  )
  // The SDK surfaces `_meta` as a mutable property read at list time; this is
  // the MCP Apps link from the tool to its UI resource.
  tool._meta = { ui: { resourceUri: CARD_URI } }

  server.registerResource(
    'weather_card_ui',
    CARD_URI,
    { description: 'Weather forecast card UI', mimeType: 'text/html' },
    () => ({
      contents: [{ uri: CARD_URI, mimeType: 'text/html', text: CARD_HTML }],
    }),
  )

  return server
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createWeatherMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp-apps-weather-server')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
