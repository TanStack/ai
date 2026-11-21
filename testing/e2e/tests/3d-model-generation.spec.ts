import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const IMAGE_URL = 'https://example.com/chair.png'
const MESH_URL = 'https://example.com/chair.glb'
const IMAGE_TO_3D = 'fal-ai/hunyuan3d-v3/image-to-3d'
const RETEXTURE = 'fal-ai/trellis-2/retexture'

const imagePart = {
  type: 'image',
  source: { type: 'url', value: IMAGE_URL },
} as const
const meshPart = {
  type: 'model3d',
  source: { type: 'url', value: MESH_URL },
} as const

// The fake Meshy in the route creates these task ids (see the route file).
const MESHY_MESH_TASK = 'meshy-mesh-task'
const MESHY_RIG_TASK = 'meshy-rig-task'
const MESHY_ANIM_TASK = 'meshy-anim-task'
const MESHY_ASSETS = 'https://assets.meshy.ai/e2e'

interface StreamEvent {
  type: string
  name?: unknown
  value?: unknown
}

function isStreamEvent(value: unknown): value is StreamEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function parseSse(body: string) {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line): unknown => JSON.parse(line.slice('data:'.length).trim()))
    .filter(isStreamEvent)
}

function customEvents(events: Array<StreamEvent>) {
  return events.flatMap((event) =>
    event.type === 'CUSTOM' ? [{ name: event.name, value: event.value }] : [],
  )
}

/** The `GET` requests that read a Meshy task `count` times. */
function meshyTaskReads(path: string, count: number) {
  return Array.from({ length: count }, () => ({ method: 'GET', path }))
}

/** The Meshy steps that the route runs in wait mode. */
type MeshyWaitStep =
  | { step: 'image-to-3d'; imageUrl: string }
  | { step: 'rigging'; jobId: string }

/** Posts one Meshy step and returns the status and the JSON body. */
async function postMeshyWait(request: APIRequestContext, data: MeshyWaitStep) {
  const res = await request.post('/api/3d-model', {
    data: { provider: 'meshy', ...data },
  })
  const body: unknown = await res.json()
  return { status: res.status(), body }
}

interface WaitBody {
  result?: { url: string; format: string; jobId: string }
  submitted?: Record<string, string>
  error?: string
}

/** Runs a `wait` request and returns the parsed JSON body. */
async function generateAndWait(
  request: APIRequestContext,
  model: string,
  prompt: ReadonlyArray<typeof imagePart | typeof meshPart>,
) {
  const res = await request.post('/api/3d-model', {
    data: { mode: 'wait', model, prompt },
  })
  const body: WaitBody = await res.json()
  expect(body.error ?? null).toBeNull()
  expect(res.status()).toBe(200)
  return body
}

test.describe('generate3DModel activity (fal)', () => {
  test('wait mode returns a GLB and sends the image as input_image_url', async ({
    request,
  }) => {
    const body = await generateAndWait(request, IMAGE_TO_3D, [imagePart])

    expect(body.result?.jobId).toBe('req-e2e')
    expect(body.result?.url).toBe('https://fal.media/files/e2e/model.glb')
    expect(body.result?.url.endsWith('.glb')).toBe(true)
    expect(body.result?.format).toBe('glb')
    expect(body.submitted).toEqual({ input_image_url: IMAGE_URL })
  })

  test('stream mode sends progress, then the result, then RUN_FINISHED', async ({
    request,
  }) => {
    const res = await request.post('/api/3d-model', {
      data: { mode: 'stream', model: IMAGE_TO_3D, prompt: [imagePart] },
    })
    expect(res.status()).toBe(200)
    const text = await res.text()

    const progressAt = text.indexOf('generation:progress')
    const resultAt = text.indexOf('generation:result')
    expect(progressAt).toBeGreaterThan(-1)
    expect(resultAt).toBeGreaterThan(progressAt)
    expect(text).toContain('https://fal.media/files/e2e/model.glb')
    expect(text).not.toContain('RUN_ERROR')
    expect(parseSse(text).at(-1)?.type).toBe('RUN_FINISHED')
  })

  test('sends a model3d prompt part to TRELLIS-2 retexture as mesh_url', async ({
    request,
  }) => {
    const body = await generateAndWait(request, RETEXTURE, [
      meshPart,
      imagePart,
    ])

    expect(body.submitted).toEqual({ mesh_url: MESH_URL, image_url: IMAGE_URL })
    expect(body.result?.format).toBe('glb')
  })
})

test.describe('generate3DModel activity (meshy)', () => {
  test('image-to-3d waits for the task and sends the image as image_url', async ({
    request,
  }) => {
    const answer = await postMeshyWait(request, {
      step: 'image-to-3d',
      imageUrl: IMAGE_URL,
    })

    expect(answer).toEqual({
      status: 200,
      body: {
        result: {
          jobId: MESHY_MESH_TASK,
          url: `${MESHY_ASSETS}/mesh.glb`,
          format: 'glb',
          files: [
            { url: `${MESHY_ASSETS}/mesh.glb`, role: 'base', format: 'glb' },
            { url: `${MESHY_ASSETS}/mesh.fbx`, role: 'base', format: 'fbx' },
          ],
          previewImageUrl: `${MESHY_ASSETS}/mesh.png`,
        },
        // Create, then IN_PROGRESS, SUCCEEDED, and the read of the result.
        meshyRequests: [
          {
            method: 'POST',
            path: '/v1/image-to-3d',
            body: { image_url: IMAGE_URL },
          },
          ...meshyTaskReads(`/v1/image-to-3d/${MESHY_MESH_TASK}`, 3),
        ],
      },
    })
  })

  test('rigging sends the mesh task id as input_task_id', async ({
    request,
  }) => {
    const answer = await postMeshyWait(request, {
      step: 'rigging',
      jobId: MESHY_MESH_TASK,
    })

    expect(answer).toEqual({
      status: 200,
      body: {
        result: {
          jobId: MESHY_RIG_TASK,
          url: `${MESHY_ASSETS}/rig.glb`,
          format: 'glb',
          files: [
            { url: `${MESHY_ASSETS}/rig.glb`, role: 'rigged', format: 'glb' },
            { url: `${MESHY_ASSETS}/rig.fbx`, role: 'rigged', format: 'fbx' },
          ],
        },
        meshyRequests: [
          {
            method: 'POST',
            path: '/v1/rigging',
            body: { input_task_id: MESHY_MESH_TASK },
          },
          ...meshyTaskReads(`/v1/rigging/${MESHY_RIG_TASK}`, 3),
        ],
      },
    })
  })

  test('animation streams the clip and sends rig_task_id and action_ids', async ({
    request,
  }) => {
    const res = await request.post('/api/3d-model', {
      data: {
        provider: 'meshy',
        step: 'animation',
        jobId: MESHY_RIG_TASK,
        actionIds: [1, 4],
      },
    })
    expect(res.status()).toBe(200)
    const events = parseSse(await res.text())

    expect(customEvents(events)).toEqual([
      {
        name: 'generation:progress',
        value: { progress: 50, message: 'processing' },
      },
      {
        name: 'generation:progress',
        value: { progress: 100, message: 'completed' },
      },
      {
        name: 'generation:result',
        value: {
          jobId: MESHY_ANIM_TASK,
          url: `${MESHY_ASSETS}/anim.glb`,
          format: 'glb',
          files: [
            {
              url: `${MESHY_ASSETS}/anim.glb`,
              role: 'animation',
              format: 'glb',
            },
            {
              url: `${MESHY_ASSETS}/anim.fbx`,
              role: 'animation',
              format: 'fbx',
            },
          ],
        },
      },
      {
        name: 'meshy:requests',
        value: [
          {
            method: 'POST',
            path: '/v1/animations',
            body: { rig_task_id: MESHY_RIG_TASK, action_ids: [1, 4] },
          },
          ...meshyTaskReads(`/v1/animations/${MESHY_ANIM_TASK}`, 3),
        ],
      },
    ])
    expect(events.at(-1)?.type).toBe('RUN_FINISHED')
  })
})
