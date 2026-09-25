import { createFileRoute } from '@tanstack/react-router'
import { buildAppStudioSandbox } from '../lib/app-studio'
import { forkStudioThreads } from '../lib/app-studio-fork'
import {
  appStudioInstances,
  appStudioLocks,
  appStudioSnapshots,
} from '../lib/app-studio-store'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/app-studio-fork')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json(400, { error: 'invalid JSON body' })
        }
        if (body === null || typeof body !== 'object') {
          return json(400, { error: 'invalid JSON body' })
        }
        const threadId = Reflect.get(body, 'threadId')
        const label = Reflect.get(body, 'label')
        const countValue = Reflect.get(body, 'count')
        if (typeof threadId !== 'string' || threadId.length === 0) {
          return json(400, { error: 'threadId is required' })
        }
        const count = countValue === 2 ? 2 : 1
        try {
          const result = await forkStudioThreads({
            snapshots: appStudioSnapshots(),
            threadId,
            runId: `studio-fork-${crypto.randomUUID()}`,
            count,
            sandbox: buildAppStudioSandbox(),
            instances: appStudioInstances(),
            locks: appStudioLocks(),
            ...(typeof label === 'string' && label.length > 0 ? { label } : {}),
          })
          return json(200, result)
        } catch (error) {
          return json(409, {
            error: error instanceof Error ? error.message : 'fork failed',
          })
        }
      },
    },
  },
})
