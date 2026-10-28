import { createFileRoute } from '@tanstack/react-router'
import { isAllowedMarbleSplatUrl, safeDownloadName } from '@/lib/marble-splat'

async function proxySplat(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams
  const target = query.get('url')
  if (!target || !isAllowedMarbleSplatUrl(target)) {
    return Response.json({ error: 'Invalid splat URL' }, { status: 400 })
  }

  const upstream = await fetch(target, { redirect: 'follow' })
  if (!isAllowedMarbleSplatUrl(upstream.url)) {
    return Response.json({ error: 'Invalid splat URL' }, { status: 400 })
  }
  if (!upstream.ok || !upstream.body) {
    const status = upstream.status || 502
    if (status === 402 || status === 403) {
      return Response.json(
        { error: 'This World Labs plan cannot export that file' },
        { status },
      )
    }
    return Response.json({ error: 'Splat download failed' }, { status })
  }

  const headers = new Headers()
  headers.set(
    'content-type',
    upstream.headers.get('content-type') ?? 'application/octet-stream',
  )
  const length = upstream.headers.get('content-length')
  if (length) headers.set('content-length', length)
  headers.set('cache-control', 'private, max-age=3600')
  const filename = safeDownloadName(query.get('filename') ?? '')
  if (filename) {
    headers.set('content-disposition', `attachment; filename="${filename}"`)
  }
  return new Response(upstream.body, { status: 200, headers })
}

export const Route = createFileRoute('/api/marble-splat')({
  server: {
    handlers: {
      GET: ({ request }) => proxySplat(request),
    },
  },
})
