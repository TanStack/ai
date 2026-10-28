// Serves the MCP Apps sandbox-proxy page on its OWN origin (port 8765),
// separate from the Vite dev server (port 3000). This cross-origin split is a
// hard requirement of `@mcp-ui/client`'s `AppRenderer`: the proxy runs a
// security self-test that fails if it shares an origin with the host page, so
// it cannot be served from Vite's own `public/`. The proxy file itself
// (public/sandbox_proxy.html) is the official one from modelcontextprotocol/
// inspector and only trusts http(s)://localhost embedders.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const PORT = 8765
const html = readFileSync(
  new URL('../public/sandbox_proxy.html', import.meta.url),
)

createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Don't let a stale copy mask edits to the proxy during development.
  res.setHeader('Cache-Control', 'no-store')
  res.end(html)
}).listen(PORT, () => {
  console.log(
    `[mcp-apps] sandbox proxy → http://localhost:${PORT}/sandbox_proxy.html`,
  )
})
