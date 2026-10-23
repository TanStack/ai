/**
 * /api/openui-live?source=NAME&params=JSON — SSE stream for a Tier F live data
 * source. Emits each value as `data: {json}\n\n`; tears the source down when the
 * client disconnects. See src/lib/openui-live.ts.
 */
import { createFileRoute } from '@tanstack/react-router'
import { getDataSource } from '@/lib/openui-live'

function parseParams(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export const Route = createFileRoute('/api/openui-live')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const source = getDataSource(url.searchParams.get('source') ?? '')
        if (!source) return new Response('Unknown source', { status: 404 })

        const params = parseParams(url.searchParams.get('params'))
        const encoder = new TextEncoder()

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const cleanup = source.run(params, (value) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
              )
            })
            request.signal.addEventListener('abort', () => {
              cleanup()
              try {
                controller.close()
              } catch {
                // already closed
              }
            })
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
