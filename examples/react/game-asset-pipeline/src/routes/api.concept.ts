import { createFileRoute } from '@tanstack/react-router'
import {
  generateImage,
  generationParamsFromRequest,
  resolveMediaPrompt,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  // Unwrap the prompt the hook POSTed. Then read the fal key.
  const { input, threadId, runId } = await generationParamsFromRequest(
    'image',
    request,
  )
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)

  const { text, images } = resolveMediaPrompt(input.prompt)
  const image = images.at(0)
  if (!text) return new Response('Describe the object.', { status: 400 })

  // The skin step sends the concept image too. flux-2/edit changes the
  // look, and keeps the shape and the view of the object.
  const stream = image
    ? generateImage({
        adapter: falImage('fal-ai/flux-2/edit', { apiKey }),
        prompt: [
          {
            type: 'text',
            content: `${text}. Keep the same object, shape, camera view, and plain white background.`,
          },
          image,
        ],
        stream: true,
        threadId,
        runId,
      })
    : // One object, a plain background, a three-quarter view.
      // An image like this gives the image-to-3D model a clean mesh.
      generateImage({
        adapter: falImage('fal-ai/flux-2', { apiKey }),
        prompt: `${text}. Single game asset, three-quarter view, centered, full object in frame, plain white background, no shadow.`,
        stream: true,
        threadId,
        runId,
      })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/concept')({
  server: {
    handlers: {
      POST,
    },
  },
})
