import { createFileRoute } from '@tanstack/react-router'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { falByok } from '@tanstack/ai-fal/byok'

const ALLOWED_HOSTS = new Set(['wma.fal.run', 'fal.run', 'queue.fal.run'])

function allowedTarget(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (!ALLOWED_HOSTS.has(url.hostname)) return null
  return url
}

async function proxyFal(request: Request): Promise<Response> {
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)

  const target = request.headers.get('x-fal-target-url')
  if (!target) {
    return Response.json({ error: 'Missing x-fal-target-url' }, { status: 400 })
  }
  const url = allowedTarget(target)
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
