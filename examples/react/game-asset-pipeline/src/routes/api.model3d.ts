import { createFileRoute } from '@tanstack/react-router'
import {
  generate3DModel,
  generationParamsFromRequest,
  resolveMediaPrompt,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fal3DModel } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  // ?step=mesh or ?step=retexture
  const step = new URL(request.url).searchParams.get('step')
  const { input, threadId, runId } = await generationParamsFromRequest(
    '3dModel',
    request,
  )
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)

  // The page sends the results of earlier steps as prompt parts.
  const { images, models3d } = resolveMediaPrompt(input.prompt)
  const image = images.at(0)
  const mesh = models3d.at(0)

  // Step 2: the concept image to a low-poly mesh with quad faces and PBR.
  if (step === 'mesh' && image) {
    const stream = generate3DModel({
      adapter: fal3DModel('fal-ai/meshy/v6/image-to-3d', { apiKey }),
      prompt: [image],
      modelOptions: {
        topology: 'quad',
        target_polycount: 10_000,
        enable_pbr: true,
      },
      stream: true,
      threadId,
      runId,
      abortSignal: request.signal,
    })
    return toServerSentEventsResponse(stream)
  }

  // Step 4: paint the same mesh with the skin image.
  if (step === 'retexture' && mesh && image) {
    const stream = generate3DModel({
      adapter: fal3DModel('fal-ai/trellis-2/retexture', { apiKey }),
      prompt: [mesh, image],
      modelOptions: { texture_size: '2048' },
      stream: true,
      threadId,
      runId,
      abortSignal: request.signal,
    })
    return toServerSentEventsResponse(stream)
  }

  return new Response(
    'Unknown step, or a result of an earlier step is missing.',
    {
      status: 400,
    },
  )
}

export const Route = createFileRoute('/api/model3d')({
  server: {
    handlers: {
      POST,
    },
  },
})
