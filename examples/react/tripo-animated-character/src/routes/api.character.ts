import { createFileRoute } from '@tanstack/react-router'
import {
  generate3dModel,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

// One POST runs one step. The page sends the step in the body and a string
// prompt: the text for the 'model' step, or the Tripo task id of the step
// before it for the 'rig' and 'animate' steps. tripo3dModel() reads
// TRIPO_API_KEY from the server environment.
export async function POST({ request }: { request: Request }) {
  const params = await generationParamsFromRequest('3dModel', request).catch(
    () => null,
  )
  if (!params) return new Response('Invalid request body.', { status: 400 })

  const { input, forwardedProps, threadId, runId } = params
  const { step } = forwardedProps
  const { prompt } = input
  const hasPrompt = typeof prompt === 'string' && prompt.trim() !== ''
  if (!hasPrompt) {
    return new Response('The prompt must be a non-empty string.', {
      status: 400,
    })
  }

  switch (step) {
    // Step 1: text to a 3D model.
    case 'model': {
      const stream = generate3dModel({
        adapter: tripo3dModel('text-to-model'),
        prompt,
        stream: true,
        threadId,
        runId,
        abortSignal: request.signal,
      })
      return toServerSentEventsResponse(stream)
    }
    // Step 2: add a skeleton. The 'preset:walk' animation of step 3 is a
    // preset for the v3.0 rig, so this step asks for that rig model. The
    // model goes in as its Tripo task id.
    case 'rig': {
      const stream = generate3dModel({
        adapter: tripo3dModel('rig', 'v3.0-20260909'),
        prompt: [
          {
            type: 'model3d',
            source: { type: 'file', value: prompt, provider: 'tripo' },
          },
        ],
        // A GLB file, because <model-viewer> shows GLB.
        modelOptions: { out_format: 'glb' },
        stream: true,
        threadId,
        runId,
        abortSignal: request.signal,
      })
      return toServerSentEventsResponse(stream)
    }
    // Step 3: put the walk animation on the rig. Retarget takes the rig
    // only as its Tripo task id. 'animate_in_place' keeps the character in the
    // middle of the viewer. Without it, the walk moves the character out.
    case 'animate': {
      const stream = generate3dModel({
        adapter: tripo3dModel('retarget'),
        prompt: [
          {
            type: 'model3d',
            source: { type: 'file', value: prompt, provider: 'tripo' },
          },
        ],
        modelOptions: { animation: 'preset:walk', animate_in_place: true },
        stream: true,
        threadId,
        runId,
        abortSignal: request.signal,
      })
      return toServerSentEventsResponse(stream)
    }
    default:
      return new Response("The step must be 'model', 'rig', or 'animate'.", {
        status: 400,
      })
  }
}

export const Route = createFileRoute('/api/character')({
  server: {
    handlers: {
      POST,
    },
  },
})
