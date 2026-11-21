import { createFileRoute } from '@tanstack/react-router'
import {
  generate3dModel,
  generationParamsFromRequest,
  resolveMediaPrompt,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { meshy3dModel } from '@tanstack/ai-meshy'
import { meshyByok } from '@tanstack/ai-meshy/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

// A Meshy job can take more than the default 10 minutes when the queue is
// busy.
const timeout = 20 * 60_000

// "Double Combo Attack", a biped action from the Meshy animation library:
// https://docs.meshy.ai/en/api/animation-library
const animationActionId = 92

export async function POST({ request }: { request: Request }) {
  // ?step=mesh, ?step=retexture, ?step=rig, or ?step=animate
  const step = new URL(request.url).searchParams.get('step')
  const { input, threadId, runId } = await generationParamsFromRequest(
    '3dModel',
    request,
  )
  // Steps 2 and 4 run on fal. Steps 5 and 6 call Meshy directly.
  const isMeshyStep = step === 'rig' || step === 'animate'
  const provider = isMeshyStep ? meshyByok : falByok
  const apiKey = getByokKey(request, provider)
  if (!apiKey) return byokMissing(provider)

  // The page sends the results of earlier steps as prompt parts.
  const { images, models3d } = resolveMediaPrompt(input.prompt)
  const image = images.at(0)
  const mesh = models3d.at(0)

  // Step 2: the concept image to a low-poly mesh with PBR textures. Meshy
  // Smart Topology keeps to the triangle budget. @fal-ai/client has no types
  // for this model, so modelOptions is not typed here.
  if (step === 'mesh' && image) {
    const stream = generate3dModel({
      adapter: fal3dModel('meshy/t2.5/image-to-3d', { apiKey }),
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
    const stream = generate3dModel({
      adapter: fal3dModel('meshy/v7/retexture', { apiKey }),
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

  // Step 5: add a skeleton to the retextured mesh (a URL). The result also
  // has basic walk and run animations, as files with the role 'animation'.
  if (step === 'rig' && mesh) {
    const stream = generate3dModel({
      adapter: meshy3dModel('rigging', { apiKey }),
      prompt: [mesh],
      modelOptions: { height_meters: 1.8 },
      stream: true,
      timeout,
      threadId,
      runId,
      abortSignal: request.signal,
    })
    return toServerSentEventsResponse(stream)
  }

  // Step 6: apply one library animation to the rig. The page sends the
  // rigging job as a model3d part with a Meshy file source.
  if (step === 'animate' && mesh) {
    const stream = generate3dModel({
      adapter: meshy3dModel('animation', { apiKey }),
      prompt: [mesh],
      modelOptions: { action_id: animationActionId },
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
