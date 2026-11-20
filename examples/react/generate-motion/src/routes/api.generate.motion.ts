import { createFileRoute } from '@tanstack/react-router'
import {
  generateMotion,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  // Unwrap the prompt and duration the hook POSTed. Then read the fal key.
  const { input, threadId, runId } = await generationParamsFromRequest(
    'motion',
    request,
  )
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)
  if (typeof input.prompt !== 'string') {
    return new Response('This route accepts a text prompt only.', {
      status: 400,
    })
  }

  // Submit the job to fal Hunyuan Motion. stream: true polls the job and
  // sends each status to the page over SSE. The last event holds the files.
  const stream = generateMotion({
    adapter: falMotion('fal-ai/hunyuan-motion', { apiKey }),
    prompt: input.prompt,
    duration: typeof input.duration === 'number' ? input.duration : undefined,
    stream: true,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/generate/motion')({
  server: {
    handlers: {
      POST,
    },
  },
})
