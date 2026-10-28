import { createFileRoute } from '@tanstack/react-router'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { allowedFalLiveVideoProxyTarget } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'

// Director WMA auth stays on the server (`Key ${apiKey}`). The allowlist
// is an SSRF gate: the browser must not send a JWT as Key credentials,
// and this route must not run arbitrary fal apps.

async function proxyFal(request: Request): Promise<Response> {
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)

  const target = request.headers.get('x-fal-target-url')
  if (!target) {
    return Response.json({ error: 'Missing x-fal-target-url' }, { status: 400 })
  }
  const url = allowedFalLiveVideoProxyTarget(target)
  if (!url) {
    return Response.json({ error: 'Invalid fal target' }, { status: 400 })
  }

  const headers = new Headers()
  headers.set('Authorization', `Key ${apiKey}`)
  headers.set(
    'Content-Type',
    request.headers.get('content-type') ?? 'application/json',
  )
  headers.set('Accept', request.headers.get('accept') ?? 'application/json')

  const init: RequestInit = { method: request.method, headers }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  const response = await fetch(url, init)
  const out = new Headers()
  const contentType = response.headers.get('content-type')
  if (contentType) out.set('content-type', contentType)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: out,
  })
}

export const Route = createFileRoute('/api/fal/proxy')({
  server: {
    handlers: {
      GET: ({ request }) => proxyFal(request),
      POST: ({ request }) => proxyFal(request),
    },
  },
})
