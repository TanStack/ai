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

// A Meshy job can take more than the default 10 minutes when the fal queue
// is busy.
const timeout = 20 * 60_000

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

  // Step 2: the concept image to a low-poly mesh with PBR textures. Meshy
  // Smart Topology keeps to the triangle budget. @fal-ai/client has no types
  // for this model, so modelOptions is not typed here.
  if (step === 'mesh' && image) {
    const stream = generate3DModel({
      adapter: fal3DModel('meshy/t2.5/image-to-3d', { apiKey }),
      prompt: [image],
      modelOptions: { target_polycount: 10_000, enable_pbr: true },
      stream: true,
      timeout,
      threadId,
      runId,
      abortSignal: request.signal,
    })
    return toServerSentEventsResponse(stream)
  }

  // Step 4: paint the same mesh with the skin image. The UVs stay the same.
  if (step === 'retexture' && mesh && image) {
    const stream = generate3DModel({
      adapter: fal3DModel('meshy/v7/retexture', { apiKey }),
      prompt: [mesh, image],
      modelOptions: { enable_pbr: true, texture_resolution: '2k' },
      stream: true,
      timeout,
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
