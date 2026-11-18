import { createFileRoute } from '@tanstack/react-router'
import { generate3DModel, toServerSentEventsResponse } from '@tanstack/ai'
import { fal3DModel } from '@tanstack/ai-fal'
import type { MediaPromptFor } from '@tanstack/ai'

const REQUEST_ID = 'req-e2e'
const MODEL_URL = 'https://fal.media/files/e2e/model.glb'
const PREVIEW_URL = 'https://fal.media/files/e2e/preview.png'

/**
 * The request body. `prompt` is the prompt of `generate3DModel`. The two
 * models cover the image field (`input_image_url`) and the mesh field
 * (`mesh_url`).
 */
interface Model3DRequest {
  mode: 'wait' | 'stream'
  model: 'fal-ai/hunyuan3d-v3/image-to-3d' | 'fal-ai/trellis-2/retexture'
  prompt: MediaPromptFor<'image' | 'model3d'>
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * A fake fal queue behind the `fetch` of the fal client. Submit answers with
 * `REQUEST_ID` and keeps the input body. The first status poll answers
 * `IN_PROGRESS` and the next one `COMPLETED`. The result is a Hunyuan3D v3
 * output with `model_glb` and `model_urls`.
 */
function mockFalQueue() {
  const submitted: Array<unknown> = []
  let statusPolls = 0
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (init?.method === 'POST') {
      submitted.push(JSON.parse(String(init.body)))
      return json({ request_id: REQUEST_ID })
    }
    if (url.includes('/status')) {
      statusPolls += 1
      return json(
        statusPolls === 1
          ? { status: 'IN_PROGRESS', logs: [] }
          : { status: 'COMPLETED', logs: [] },
      )
    }
    return json({
      model_glb: {
        url: MODEL_URL,
        file_name: 'model.glb',
        content_type: 'model/gltf-binary',
      },
      model_urls: { glb: { url: MODEL_URL } },
      thumbnail: { url: PREVIEW_URL },
    })
  }
  return { fetch, submitted }
}

export const Route = createFileRoute('/api/3d-model')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: Model3DRequest = await request.json()
        const queue = mockFalQueue()
        const options = {
          adapter: fal3DModel(body.model, {
            apiKey: 'test',
            fetch: queue.fetch,
          }),
          prompt: body.prompt,
          threadId: '3d-model',
          pollInterval: 10,
          debug: false,
        }

        if (body.mode === 'stream') {
          return toServerSentEventsResponse(
            generate3DModel({ ...options, stream: true }),
          )
        }

        try {
          const result = await generate3DModel({ ...options, wait: true })
          // `submitted` is the input fal received, so the spec can check
          // which field each prompt part went to.
          return Response.json({ result, submitted: queue.submitted[0] })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'unknown' },
            { status: 500 },
          )
        }
      },
    },
  },
})
