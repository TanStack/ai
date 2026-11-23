import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  generate3DModel,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fal3DModel } from '@tanstack/ai-fal'
import { meshy3DModel } from '@tanstack/ai-meshy'
import { tripo3DModel } from '@tanstack/ai-tripo'
import type { MediaPromptFor, Model3DResult, StreamChunk } from '@tanstack/ai'

const REQUEST_ID = 'req-e2e'
const MODEL_URL = 'https://fal.media/files/e2e/model.glb'
const PREVIEW_URL = 'https://fal.media/files/e2e/preview.png'

/**
 * The request body. `prompt` is the prompt of `generate3DModel`. The two
 * models cover the image field (`input_image_url`) and the mesh field
 * (`mesh_url`).
 */
interface Model3DRequest {
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
type MeshyModel3DRequest =
  | { provider: 'meshy'; step: 'image-to-3d'; imageUrl: string }
  | { provider: 'meshy'; step: 'rigging'; jobId: string }
  | {
      provider: 'meshy'
      step: 'animation'
      jobId: string
      actionIds: Array<number>
    }

/** One request that an adapter sent to a fake provider. */
interface ProviderRequest {
  method: string
  /** The path after the provider base URL. */
  path: string
  /** The JSON body. Only a `POST` has one. */
  body?: unknown
}

/** The fake providers. Each name prefixes its requests key and event name. */
type FakeProvider = 'meshy' | 'tripo'

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
  const requests: Array<ProviderRequest> = []
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

/**
 * Answers with the finished model and the provider requests (the
 * `<provider>Requests` key), or the error.
 */
async function waitResponse(
  provider: FakeProvider,
  generation: Promise<Model3DResult>,
  requests: Array<ProviderRequest>,
) {
  const requestsKey = `${provider}Requests`
  try {
    const result = await generation
    return Response.json({ result, [requestsKey]: requests })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'unknown',
        [requestsKey]: requests,
      },
      { status: 500 },
    )
  }
}

/**
 * Passes the stream through. Before `RUN_FINISHED`, it sends a
 * `<provider>:requests` custom event with the provider requests, so the spec
 * can check them in stream mode too.
 */
async function* withProviderRequests(
  provider: FakeProvider,
  stream: AsyncIterable<StreamChunk>,
  requests: Array<ProviderRequest>,
) {
  for await (const chunk of stream) {
    if (chunk.type === EventType.RUN_FINISHED) {
      const requestsEvent: StreamChunk = {
        type: EventType.CUSTOM,
        name: `${provider}:requests`,
        value: requests,
        timestamp: Date.now(),
      }
      yield requestsEvent
    }
    yield chunk
  }
}

/** Runs one Meshy step against a new fake Meshy. */
function handleMeshy(body: MeshyModel3DRequest) {
  const meshy = fakeMeshy()
  const config = { apiKey: 'meshy-e2e', fetch: meshy.fetch }
  const shared = { threadId: '3d-model-meshy', pollInterval: 10, debug: false }

  switch (body.step) {
    case 'image-to-3d':
      return waitResponse(
        'meshy',
        generate3DModel({
          ...shared,
          adapter: meshy3DModel('image-to-3d', config),
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
      return waitResponse(
        'meshy',
        generate3DModel({
          ...shared,
          adapter: meshy3DModel('rigging', config),
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
      const stream = generate3DModel({
        ...shared,
        adapter: meshy3DModel('animation', config),
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
        withProviderRequests('meshy', stream, meshy.requests),
      )
    }
  }
}

const TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3'
const TRIPO_ASSETS = 'https://assets.tripo3d.ai/e2e'

/**
 * The Tripo request body. Each step runs one Tripo endpoint:
 * - `image-to-model` (wait): `imageBase64` is a PNG, so the adapter uploads
 *   it to `POST /files` first.
 * - `rig` (wait): `jobId` is the Tripo task of the mesh.
 * - `retarget` (stream): `jobId` is the Tripo rig task.
 */
type TripoModel3DRequest =
  | { provider: 'tripo'; step: 'image-to-model'; imageBase64: string }
  | { provider: 'tripo'; step: 'rig'; jobId: string }
  | { provider: 'tripo'; step: 'retarget'; jobId: string }

/**
 * The task of each Tripo create endpoint: the task id that a `POST` creates,
 * and the `output` of the task when it is `success`.
 */
const TRIPO_TASKS = {
  '/generation/image-to-model': {
    id: 'tripo-mesh-task',
    output: {
      model_url: `${TRIPO_ASSETS}/mesh.glb`,
      rendered_image_url: `${TRIPO_ASSETS}/mesh.png`,
    },
  },
  '/animations/rig': {
    id: 'tripo-rig-task',
    output: { model_url: `${TRIPO_ASSETS}/rig.glb` },
  },
  '/animations/retarget': {
    id: 'tripo-anim-task',
    output: { model_url: `${TRIPO_ASSETS}/walk.glb` },
  },
}

type TripoTaskPath = keyof typeof TRIPO_TASKS

function isTripoTaskPath(path: string): path is TripoTaskPath {
  return Object.hasOwn(TRIPO_TASKS, path)
}

function tripoNotFound(method: string, path: string) {
  return Response.json(
    {
      code: 4001,
      status: 'error',
      message: `no fake Tripo route for ${method} ${path}`,
    },
    { status: 404 },
  )
}

/**
 * A fake Tripo API behind the `fetch` of the Tripo client. `POST /files`
 * answers with a `file_token`, and a `POST` to a task endpoint creates its
 * task. The first `GET /tasks/{id}` answers `running`, and every later one
 * answers `success`. It records each request, so the spec can check the
 * bodies. For the multipart upload it records the file name, not the bytes.
 */
function fakeTripo() {
  const requests: Array<ProviderRequest> = []
  let reads = 0
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const path = request.url.slice(TRIPO_BASE_URL.length)
    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.startsWith('multipart/form-data')) {
      const file = (await request.formData()).get('file')
      const upload = file instanceof File ? file.name : null
      requests.push({ method: request.method, path, body: { upload } })
      if (request.method !== 'POST' || path !== '/files') {
        return tripoNotFound(request.method, path)
      }
      return Response.json({ code: 0, data: { file_token: 'file_e2e' } })
    }

    const text = await request.text()
    requests.push({
      method: request.method,
      path,
      ...(text ? { body: JSON.parse(text) } : {}),
    })

    if (request.method === 'POST') {
      if (!isTripoTaskPath(path)) return tripoNotFound(request.method, path)
      return Response.json({ code: 0, data: { task_id: TRIPO_TASKS[path].id } })
    }

    const tasks = Object.values(TRIPO_TASKS)
    const task = tasks.find(({ id }) => path === `/tasks/${id}`)
    if (request.method !== 'GET' || !task) {
      return tripoNotFound(request.method, path)
    }
    reads += 1
    if (reads === 1) {
      return Response.json({
        code: 0,
        data: { task_id: task.id, status: 'running', progress: 50 },
      })
    }
    return Response.json({
      code: 0,
      data: {
        task_id: task.id,
        status: 'success',
        progress: 100,
        output: task.output,
      },
    })
  }
  return { fetch, requests }
}

/** Runs one Tripo step against a new fake Tripo. */
function handleTripo(body: TripoModel3DRequest) {
  const tripo = fakeTripo()
  const config = { apiKey: 'tripo-e2e', fetch: tripo.fetch }
  const shared = { threadId: '3d-model-tripo', pollInterval: 10, debug: false }

  switch (body.step) {
    case 'image-to-model':
      // A `data` source is uploaded to `POST /files`. The create body sends
      // the `file_token` as `input`.
      return waitResponse(
        'tripo',
        generate3DModel({
          ...shared,
          adapter: tripo3DModel('image-to-model', config),
          prompt: [
            {
              type: 'image',
              source: {
                type: 'data',
                value: body.imageBase64,
                mimeType: 'image/png',
              },
            },
          ],
          wait: true,
        }),
        tripo.requests,
      )
    case 'rig':
      // A `file` source is a Tripo task id. Rig sends it as `input`.
      return waitResponse(
        'tripo',
        generate3DModel({
          ...shared,
          adapter: tripo3DModel('rig', config),
          prompt: [
            {
              type: 'model3d',
              source: { type: 'file', value: body.jobId, provider: 'tripo' },
            },
          ],
          wait: true,
        }),
        tripo.requests,
      )
    case 'retarget': {
      const stream = generate3DModel({
        ...shared,
        adapter: tripo3DModel('retarget', config),
        prompt: [
          {
            type: 'model3d',
            source: { type: 'file', value: body.jobId, provider: 'tripo' },
          },
        ],
        modelOptions: { animation: 'preset:walk' },
        stream: true,
      })
      return toServerSentEventsResponse(
        withProviderRequests('tripo', stream, tripo.requests),
      )
    }
  }
}

export const Route = createFileRoute('/api/3d-model')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: Model3DRequest | MeshyModel3DRequest | TripoModel3DRequest =
          await request.json()
        if (body.provider === 'meshy') return handleMeshy(body)
        if (body.provider === 'tripo') return handleTripo(body)
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
