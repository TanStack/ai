import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  generate3dModel,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'
import { meshy3dModel } from '@tanstack/ai-meshy'
import type { MediaPromptFor, Model3dResult, StreamChunk } from '@tanstack/ai'

const REQUEST_ID = 'req-e2e'
const MODEL_URL = 'https://fal.media/files/e2e/model.glb'
const PREVIEW_URL = 'https://fal.media/files/e2e/preview.png'

/**
 * The request body. `prompt` is the prompt of `generate3dModel`. The two
 * models cover the image field (`input_image_url`) and the mesh field
 * (`mesh_url`).
 */
interface Model3dRequest {
  /** Leave it out for fal. */
  provider?: 'fal'
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

const MESHY_BASE_URL = 'https://api.meshy.ai/openapi'

/**
 * The Meshy request body. Each step runs one Meshy endpoint:
 * - `image-to-3d` (wait): `imageUrl` is the image prompt part.
 * - `rigging` (wait): `jobId` is the Meshy task of the mesh.
 * - `animation` (stream): `jobId` is the Meshy rigging task, and `actionIds`
 *   are the Meshy library animations.
 */
type MeshyModel3dRequest =
  | { provider: 'meshy'; step: 'image-to-3d'; imageUrl: string }
  | { provider: 'meshy'; step: 'rigging'; jobId: string }
  | {
      provider: 'meshy'
      step: 'animation'
      jobId: string
      actionIds: Array<number>
    }

/** One request that the Meshy adapter sent to the fake Meshy. */
interface MeshyRequest {
  method: string
  /** The path after the Meshy base URL. */
  path: string
  /** The JSON body. Only a `POST` has one. */
  body?: unknown
}

/**
 * The task of each Meshy endpoint: the task id that a `POST` creates, and the
 * fields that a `SUCCEEDED` task has.
 */
const MESHY_TASKS = {
  '/v1/image-to-3d': {
    id: 'meshy-mesh-task',
    succeeded: {
      model_urls: {
        glb: 'https://assets.meshy.ai/e2e/mesh.glb',
        fbx: 'https://assets.meshy.ai/e2e/mesh.fbx',
      },
      thumbnail_url: 'https://assets.meshy.ai/e2e/mesh.png',
    },
  },
  '/v1/rigging': {
    id: 'meshy-rig-task',
    succeeded: {
      result: {
        rigged_character_glb_url: 'https://assets.meshy.ai/e2e/rig.glb',
        rigged_character_fbx_url: 'https://assets.meshy.ai/e2e/rig.fbx',
      },
    },
  },
  '/v1/animations': {
    id: 'meshy-anim-task',
    succeeded: {
      result: {
        animation_glb_url: 'https://assets.meshy.ai/e2e/anim.glb',
        animation_fbx_url: 'https://assets.meshy.ai/e2e/anim.fbx',
      },
    },
  },
}

type MeshyTaskPath = keyof typeof MESHY_TASKS

function isMeshyTaskPath(path: string): path is MeshyTaskPath {
  return Object.hasOwn(MESHY_TASKS, path)
}

function meshyNotFound(method: string, path: string) {
  return Response.json(
    { message: `no fake Meshy route for ${method} ${path}` },
    { status: 404 },
  )
}

/**
 * A fake Meshy API behind the `fetch` of the Meshy client. A `POST` to a task
 * endpoint creates its task. The first `GET` of the task answers
 * `IN_PROGRESS`, and every later `GET` answers `SUCCEEDED`. It records each
 * request, so the spec can check the bodies.
 */
function fakeMeshy() {
  const requests: Array<MeshyRequest> = []
  let reads = 0
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const path = request.url.slice(MESHY_BASE_URL.length)
    const text = await request.text()
    requests.push({
      method: request.method,
      path,
      ...(text ? { body: JSON.parse(text) } : {}),
    })

    if (request.method === 'POST') {
      if (!isMeshyTaskPath(path)) return meshyNotFound(request.method, path)
      return Response.json({ result: MESHY_TASKS[path].id }, { status: 202 })
    }

    const endpoint = path.slice(0, path.lastIndexOf('/'))
    if (request.method !== 'GET' || !isMeshyTaskPath(endpoint)) {
      return meshyNotFound(request.method, path)
    }
    const task = MESHY_TASKS[endpoint]
    if (path !== `${endpoint}/${task.id}`) {
      return meshyNotFound(request.method, path)
    }
    reads += 1
    if (reads === 1) {
      return Response.json({ id: task.id, status: 'IN_PROGRESS', progress: 50 })
    }
    return Response.json({
      id: task.id,
      status: 'SUCCEEDED',
      progress: 100,
      ...task.succeeded,
    })
  }
  return { fetch, requests }
}

/** Answers with the finished model and the Meshy requests, or the error. */
async function meshyWaitResponse(
  generation: Promise<Model3dResult>,
  requests: Array<MeshyRequest>,
) {
  try {
    const result = await generation
    return Response.json({ result, meshyRequests: requests })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'unknown',
        meshyRequests: requests,
      },
      { status: 500 },
    )
  }
}

/**
 * Passes the stream through. Before `RUN_FINISHED`, it sends a
 * `meshy:requests` custom event with the Meshy requests, so the spec can
 * check them in stream mode too.
 */
async function* withMeshyRequests(
  stream: AsyncIterable<StreamChunk>,
  requests: Array<MeshyRequest>,
) {
  for await (const chunk of stream) {
    if (chunk.type === EventType.RUN_FINISHED) {
      const requestsEvent: StreamChunk = {
        type: EventType.CUSTOM,
        name: 'meshy:requests',
        value: requests,
        timestamp: Date.now(),
      }
      yield requestsEvent
    }
    yield chunk
  }
}

/** Runs one Meshy step against a new fake Meshy. */
function handleMeshy(body: MeshyModel3dRequest) {
  const meshy = fakeMeshy()
  const config = { apiKey: 'meshy-e2e', fetch: meshy.fetch }
  const shared = { threadId: '3d-model-meshy', pollInterval: 10, debug: false }

  switch (body.step) {
    case 'image-to-3d':
      return meshyWaitResponse(
        generate3dModel({
          ...shared,
          adapter: meshy3dModel('image-to-3d', config),
          prompt: [
            { type: 'image', source: { type: 'url', value: body.imageUrl } },
          ],
          wait: true,
        }),
        meshy.requests,
      )
    case 'rigging':
      // A `file` source is a Meshy task id. Rigging sends it as
      // `input_task_id`.
      return meshyWaitResponse(
        generate3dModel({
          ...shared,
          adapter: meshy3dModel('rigging', config),
          prompt: [
            {
              type: 'model3d',
              source: { type: 'file', value: body.jobId, provider: 'meshy' },
            },
          ],
          wait: true,
        }),
        meshy.requests,
      )
    case 'animation': {
      // Animation sends the `file` source as `rig_task_id`.
      const stream = generate3dModel({
        ...shared,
        adapter: meshy3dModel('animation', config),
        prompt: [
          {
            type: 'model3d',
            source: { type: 'file', value: body.jobId, provider: 'meshy' },
          },
        ],
        modelOptions: { action_ids: body.actionIds },
        stream: true,
      })
      return toServerSentEventsResponse(
        withMeshyRequests(stream, meshy.requests),
      )
    }
  }
}

export const Route = createFileRoute('/api/3d-model')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: Model3dRequest | MeshyModel3dRequest = await request.json()
        if (body.provider === 'meshy') return handleMeshy(body)
        const queue = mockFalQueue()
        const options = {
          adapter: fal3dModel(body.model, {
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
            generate3dModel({ ...options, stream: true }),
          )
        }

        try {
          const result = await generate3dModel({ ...options, wait: true })
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
