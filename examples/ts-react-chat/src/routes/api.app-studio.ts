import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import { withLocks } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
import {
  APP_STUDIO_SYSTEM_PROMPT,
  buildAppStudioAdapter,
  buildAppStudioSandbox,
  makeExposePreviewTool,
  missingAppStudioEnv,
  tanstackStartRecipe,
} from '../lib/app-studio'
import {
  appStudioInstances,
  appStudioLocks,
  appStudioSnapshots,
} from '../lib/app-studio-store'

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    statusText: error.slice(0, 64),
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/app-studio')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const missing = missingAppStudioEnv()
        if (missing.length > 0) {
          return jsonError(
            500,
            `Missing required env: ${missing.join(', ')}. Set it and restart the dev server.`,
          )
        }

        let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch {
          return jsonError(400, 'invalid JSON body')
        }
        const snapshots = appStudioSnapshots()
        const instances = appStudioInstances()
        const locks = appStudioLocks()
        const sandbox = buildAppStudioSandbox()
        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort())

        const stream = chat({
          adapter: buildAppStudioAdapter(),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          systemPrompts: [APP_STUDIO_SYSTEM_PROMPT],
          tools: [
            tanstackStartRecipe,
            makeExposePreviewTool(sandbox, params.threadId, {
              store: instances,
              locks,
            }),
          ],
          middleware: [
            withPersistence(snapshots.persistence),
            withLocks(locks),
            withSandbox(sandbox, { instances, snapshots }),
          ],
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
      GET: ({ request }) => {
        return reconstructChat(appStudioSnapshots().persistence, request, {
          authorize: async (threadId) => threadId.length > 0,
        })
      },
    },
  },
})
