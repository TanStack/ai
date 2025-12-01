import { createFileRoute } from '@tanstack/react-router'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const Route = createFileRoute('/api/list-traces')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const traceDir = path.join(process.cwd(), 'test-traces')

          // Check if directory exists
          if (!fs.existsSync(traceDir)) {
            return new Response(JSON.stringify({ traces: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          // Read all files in the directory
          const files = fs.readdirSync(traceDir)

          // Filter for JSON files and extract metadata
          const traces = files
            .filter((file) => file.endsWith('.json'))
            .map((file) => {
              try {
                const filePath = path.join(traceDir, file)
                const stats = fs.statSync(filePath)
                const content = fs.readFileSync(filePath, 'utf-8')
                const data = JSON.parse(content)

                return {
                  id: data.id || file.replace('.json', ''),
                  filename: file,
                  timestamp: data.timestamp || stats.mtime.toISOString(),
                  provider: data.provider,
                  model: data.model,
                  size: stats.size,
                  chunkCount: data.chunks?.length || 0,
                }
              } catch (error) {
                console.error(`Failed to read trace file ${file}:`, error)
                return null
              }
            })
            .filter((trace) => trace !== null)
            .sort((a, b) => {
              // Sort by timestamp, newest first
              return (
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
              )
            })

          return new Response(JSON.stringify({ traces }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('[API] Error listing traces:', error)
          return new Response(
            JSON.stringify({ error: error.message || 'Failed to list traces' }),
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
