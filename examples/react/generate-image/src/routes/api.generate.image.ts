import { createFileRoute } from '@tanstack/react-router'
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterImage } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  const { input, threadId, runId } = await generationParamsFromRequest(
    'image',
    request,
  )
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)
  if (typeof input.prompt !== 'string') {
    return new Response('This route accepts a text prompt only.', {
      status: 400,
    })
  }

  const stream = generateImage({
    adapter: createOpenRouterImage('google/gemini-3.1-flash-image', apiKey),
    prompt: input.prompt,
    stream: true,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/generate/image')({
  server: {
    handlers: {
      POST,
    },
  },
})
