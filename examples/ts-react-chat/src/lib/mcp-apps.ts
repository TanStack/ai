/**
 * Shared constants for the MCP Apps demo (`/mcp-apps`).
 *
 * Two MCP servers back the demo:
 *   - a STATIC, display-only widget (an in-process server route, `WEATHER_*`)
 *   - a DYNAMIC, interactive widget — the official Three.js MCP Apps server
 *     (`THREEJS_*`), run as a separate process on :3001 (see the `dev` script).
 *
 * `serverId` on a `ui-resource` part is the client's tool-name prefix, which is
 * how `createMcpAppCallHandler` routes an interactive call back to the right
 * server — so the prefixes here must match on both the chat and call routes.
 */

/** Three.js MCP server's Streamable HTTP endpoint (started via `npm run dev`). */
export const THREEJS_MCP_URL = 'http://localhost:3001/mcp'
export const THREEJS_PREFIX = 'threejs'

/** The in-process static-widget server is reached at the app's own origin. */
export const WEATHER_SERVER_PATH = '/api/mcp-apps-weather-server'
export const WEATHER_PREFIX = 'weather'

/**
 * The sandbox-proxy page `AppRenderer` loads the widget into. It MUST be a
 * different origin than the host page (security boundary), so it's served on
 * its own port by `scripts/serve-sandbox.mjs`, not by Vite. Deploy-time
 * constant — the same for every widget; it is NOT the widget's `ui://` URL.
 */
export const SANDBOX_PROXY_URL = 'http://localhost:8765/sandbox_proxy.html'

/** Suggestion pills shown above the composer to trigger each kind of app. */
export const MCP_APP_SUGGESTIONS = [
  {
    kind: 'static' as const,
    label: '🌤️ Show the weather card (static)',
    prompt: 'Show me the weather card.',
  },
  {
    kind: 'dynamic' as const,
    label: '🧊 Render a rotating 3D cube (interactive)',
    prompt:
      'Use the Three.js tool to render an interactive scene with a single rotating cube.',
  },
]
