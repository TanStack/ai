// Verifies the generative-UI MCP server is a conformant MCP Apps server: an
// external MCP client can discover the create_artifact tool (with its
// _meta.ui.resourceUri linkage), call it, and read the ui://genui/last resource
// back as MCP-Apps HTML. Run while `pnpm dev` is up: node scripts/verify-mcp.mjs
import { createMCPClient } from '@tanstack/ai-mcp'

const URL = process.env.MCP_URL || 'http://localhost:3000/mcp'
const FRAGMENT = `<div style="padding:16px;max-width:360px">
  <h3 style="margin:0 0 8px;font:650 16px system-ui">Emaj7</h3>
  <svg width="220" height="140" viewBox="0 0 220 140"><g stroke="#cbd5e1"><line x1="20" y1="20" x2="200" y2="20"/><line x1="20" y1="60" x2="200" y2="60"/><line x1="20" y1="100" x2="200" y2="100"/></g><circle cx="60" cy="40" r="9" fill="#2563eb"/><circle cx="100" cy="40" r="9" fill="#2563eb"/></svg>
  <p style="font:13px system-ui;color:#64748b">Open Emaj7 voicing.</p>
</div>`

function ok(label, cond) {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) process.exitCode = 1
}

const client = await createMCPClient({ transport: { type: 'http', url: URL } })
try {
  const tools = await client.tools()
  const list = Array.isArray(tools) ? tools : Object.values(tools ?? {})
  const create = list.find((t) => t?.name === 'create_artifact')
  ok('server lists create_artifact', !!create)
  if (process.env.DEBUG) console.log('RAW TOOL:', JSON.stringify(create, null, 1))
  // The client stamps the SEP-1865 _meta.ui.resourceUri as metadata.mcp.uiResourceUri
  // (this is exactly what the host's emitUiResourceIfLinked reads to render).
  const uri =
    create?.metadata?.mcp?.uiResourceUri ??
    create?._meta?.ui?.resourceUri ??
    create?._meta?.['ui/resourceUri']
  ok(`create_artifact is UI-linked (_meta.ui.resourceUri = ${uri})`, uri === 'ui://genui/last')

  const res = await client.callTool('create_artifact', {
    title: 'Emaj7', source: FRAGMENT, fallbackText: 'Emaj7 open voicing chord diagram.',
  })
  const text = JSON.stringify(res)
  ok('create_artifact call succeeded', !text.includes('Build failed') && !res?.isError)

  const read = await client.readResource('ui://genui/last')
  const content = read?.contents?.[0]
  ok('ui://genui/last is text/html;profile=mcp-app', content?.mimeType === 'text/html;profile=mcp-app')
  ok('resource HTML carries the authored fragment', typeof content?.text === 'string' && content.text.includes('Emaj7'))
  ok('resource HTML is MCP-Apps-native (guest adapter inlined)', typeof content?.text === 'string' && /__ogui|ext-apps|PostMessage|mcp/i.test(content.text))

  console.log(process.exitCode ? '\nFAIL' : '\nPASS — external MCP hosts can render generative UI from this server')
} finally {
  await client.close?.()
}
