import { createFileRoute } from '@tanstack/react-router'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const Route = createFileRoute('/api/load-trace')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const traceId = url.searchParams.get('id')

          if (!traceId) {
            return new Response(JSON.stringify({ error: 'Missing trace ID' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const traceDir = path.join(process.cwd(), 'test-traces')
          const traceFile = path.join(traceDir, `${traceId}.json`)

          if (!fs.existsSync(traceFile)) {
            return new Response(
              JSON.stringify({ error: 'Trace file not found' }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const traceData = fs.readFileSync(traceFile, 'utf-8')
          return new Response(traceData, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('[API] Error loading trace:', error)
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to load trace' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
