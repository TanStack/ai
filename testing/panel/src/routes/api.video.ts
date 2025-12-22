import { createFileRoute } from '@tanstack/react-router'
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

type Action = 'create' | 'status' | 'url'

export const Route = createFileRoute('/api/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const action: Action = body.action || 'create'

        try {
          const adapter = openaiVideo('sora-2')

          switch (action) {
            case 'create': {
              const { prompt, size = '1280x720', seconds = 8 } = body

              const result = await generateVideo({
                adapter,
                prompt,
                size,
                duration: seconds,
              })

              return new Response(
                JSON.stringify({
                  action: 'create',
                  jobId: result.jobId,
                  model: result.model,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }

            case 'status': {
              const { jobId } = body

              if (!jobId) {
                return new Response(
                  JSON.stringify({
                    error: 'jobId is required for status check',
                  }),
                  {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                  },
                )
              }

              const result = await getVideoJobStatus({
                adapter,
                jobId,
              })

              return new Response(
                JSON.stringify({
                  action: 'status',
                  jobId: result.jobId,
                  status: result.status,
                  progress: result.progress,
                  error: result.error,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }

            case 'url': {
              const { jobId } = body

              if (!jobId) {
                return new Response(
                  JSON.stringify({
                    error: 'jobId is required for URL retrieval',
                  }),
                  {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                  },
                )
              }

              const result = await adapter.getVideoUrl(jobId)

              return new Response(
                JSON.stringify({
                  action: 'url',
                  jobId: result.jobId,
                  url: result.url,
                  expiresAt: result.expiresAt?.toISOString(),
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }

            default:
              return new Response(
                JSON.stringify({
                  error: `Unknown action: ${action}. Valid actions: create, status, url`,
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
          }
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
            }),
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
