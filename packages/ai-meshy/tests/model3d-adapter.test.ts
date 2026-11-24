import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { meshy3dModel } from '../src/adapters/model3d'
import type { MediaPrompt } from '@tanstack/ai'
import type { MeshyModel3dAdapter } from '../src/adapters/model3d'
import type { MeshyClientConfig } from '../src/client'
import type {
  MeshyAiModelFor,
  MeshyModel3dEndpoint,
  MeshyModel3dInputModalities,
  MeshyModel3dProviderOptions,
} from '../src/model-meta'

const logger = resolveDebugOption(false)

const BASE = 'https://api.meshy.ai/openapi'
const IMAGE_URL = 'https://example.com/knight.png'
const MESH_URL = 'https://example.com/knight.glb'

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface MeshyRequest {
  method: string
  url: string
  body: unknown
}

/**
 * A fake Meshy API behind the injected `fetch`. It records every request and
 * answers with `respond`, which gets the request. By default it creates
 * task `task-1`.
 */
function fakeMeshy(
  respond: (request: MeshyRequest) => Response = () =>
    json({ result: 'task-1' }, 202),
) {
  const requests: Array<MeshyRequest> = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const body =
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const request = { method: init?.method ?? 'GET', url: String(input), body }
    requests.push(request)
    return respond(request)
  })
  return { fetch, requests }
}

type AdapterFactory<E extends MeshyModel3dEndpoint> = (
  config: MeshyClientConfig,
) => MeshyModel3dAdapter<E>

/** Creates a job and returns the requests that reached Meshy. */
async function submit<E extends MeshyModel3dEndpoint>(
  makeAdapter: AdapterFactory<E>,
  prompt: MediaPrompt,
  modelOptions?: MeshyModel3dProviderOptions<E>,
) {
  const meshy = fakeMeshy()
  const adapter = makeAdapter({ apiKey: 'key', fetch: meshy.fetch })
  const job = await adapter.create3dModelJob({
    model: adapter.model,
    prompt,
    modelOptions,
    logger,
  })
  expect(job).toEqual({ jobId: 'task-1', model: adapter.model })
  return meshy.requests
}

/** Creates a job that must fail, and returns the error and the requests. */
async function submitError<E extends MeshyModel3dEndpoint>(
  endpoint: E,
  prompt: MediaPrompt,
  modelOptions?: MeshyModel3dProviderOptions<E>,
) {
  const meshy = fakeMeshy()
  const adapter = meshy3dModel(endpoint, { apiKey: 'key', fetch: meshy.fetch })
  const error = await adapter
    .create3dModelJob({
      model: adapter.model,
      prompt,
      modelOptions,
      logger,
    })
    .catch((caught: unknown) => caught)
  return { error, requests: meshy.requests }
}

/** Reads a finished task whose GET body is `task`. */
function resultFor<E extends MeshyModel3dEndpoint>(
  makeAdapter: AdapterFactory<E>,
  task: object,
) {
  const meshy = fakeMeshy(() => json(task))
  return makeAdapter({ apiKey: 'key', fetch: meshy.fetch }).get3dModel('task-9')
}

const text = (content: string) => ({ type: 'text', content }) as const
const image = (value: string) =>
  ({ type: 'image', source: { type: 'url', value } }) as const
const mesh = (value: string) =>
  ({ type: 'model3d', source: { type: 'url', value } }) as const
const meshyTask = (value: string) =>
  ({
    type: 'model3d',
    source: { type: 'file', value, provider: 'meshy' },
  }) as const

const post = (path: string, body: object) => [
  { method: 'POST', url: `${BASE}${path}`, body },
]

describe('meshy3dModel types', () => {
  it('types ai_model per endpoint', () => {
    expectTypeOf<MeshyAiModelFor<'rigging'>>().toBeNever()
    expectTypeOf<MeshyAiModelFor<'retexture'>>().toEqualTypeOf<
      'latest' | 'meshy-7' | 'meshy-6' | 'meshy-6-lite' | 'meshy-n1'
    >()
    const config = { apiKey: 'key' }
    // @ts-expect-error rigging takes no ai_model
    meshy3dModel('rigging', 'meshy-7.1', config)
    // @ts-expect-error retexture does not take meshy-7.1
    meshy3dModel('retexture', 'meshy-7.1', config)
    expect(meshy3dModel('rigging', config).model).toBe('rigging')
  })

  it('derives the prompt modalities from the endpoint routes', () => {
    expectTypeOf<
      MeshyModel3dInputModalities<'text-to-3d-preview'>
    >().toEqualTypeOf<ReadonlyArray<never>>()
    expectTypeOf<MeshyModel3dInputModalities<'remesh'>>().toEqualTypeOf<
      ReadonlyArray<'model3d'>
    >()
    expectTypeOf<MeshyModel3dInputModalities<'retexture'>>().toEqualTypeOf<
      ReadonlyArray<'image' | 'model3d'>
    >()
  })
})

describe('meshy3dModel create3dModelJob', () => {
  it('text-to-3d-preview sends prompt, mode preview and ai_model', async () => {
    const requests = await submit(
      (config) => meshy3dModel('text-to-3d-preview', 'meshy-7.1', config),
      'a wooden chest',
      { target_polycount: 20000 },
    )
    expect(requests).toEqual(
      post('/v2/text-to-3d', {
        target_polycount: 20000,
        prompt: 'a wooden chest',
        ai_model: 'meshy-7.1',
        mode: 'preview',
      }),
    )
  })

  it('text-to-3d-refine maps a meshy file source to preview_task_id and text to texture_prompt', async () => {
    const requests = await submit(
      (config) => meshy3dModel('text-to-3d-refine', config),
      [meshyTask('preview-1'), text('old oak, iron bands')],
      { enable_pbr: true },
    )
    expect(requests).toEqual(
      post('/v2/text-to-3d', {
        enable_pbr: true,
        texture_prompt: 'old oak, iron bands',
        preview_task_id: 'preview-1',
        mode: 'refine',
      }),
    )
  })

  it.each([
    ['a url image', image(IMAGE_URL), IMAGE_URL],
    [
      'a data image with its own MIME type',
      {
        type: 'image',
        source: { type: 'data', value: 'AAAA', mimeType: 'image/png' },
      },
      'data:image/png;base64,AAAA',
    ],
  ] as const)('image-to-3d sends %s as image_url', async (_name, part, url) => {
    const requests = await submit(
      (config) => meshy3dModel('image-to-3d', config),
      [part, text('painted steel')],
    )
    expect(requests).toEqual(
      post('/v1/image-to-3d', {
        image_url: url,
        texture_prompt: 'painted steel',
      }),
    )
  })

  it('multi-image-to-3d sends 3 images as image_urls', async () => {
    const requests = await submit(
      (config) => meshy3dModel('multi-image-to-3d', 'meshy-6', config),
      [
        image('https://x/front.png'),
        image('https://x/side.png'),
        image('https://x/back.png'),
      ],
    )
    expect(requests).toEqual(
      post('/v1/multi-image-to-3d', {
        image_urls: [
          'https://x/front.png',
          'https://x/side.png',
          'https://x/back.png',
        ],
        ai_model: 'meshy-6',
      }),
    )
  })

  it.each([
    [
      'one image to image_style_url',
      [image(IMAGE_URL)],
      { image_style_url: IMAGE_URL },
    ],
    [
      'two images to multiview_image_urls',
      [image('https://x/front.png'), image('https://x/back.png')],
      { multiview_image_urls: ['https://x/front.png', 'https://x/back.png'] },
    ],
  ] as const)('retexture maps %s', async (_name, images, fields) => {
    const requests = await submit(
      (config) => meshy3dModel('retexture', 'meshy-n1', config),
      [mesh(MESH_URL), ...images],
    )
    expect(requests).toEqual(
      post('/v1/retexture', {
        ...fields,
        model_url: MESH_URL,
        ai_model: 'meshy-n1',
      }),
    )
  })

  it.each([
    ['a url mesh to model_url', mesh(MESH_URL), { model_url: MESH_URL }],
    [
      'a file source to input_task_id',
      meshyTask('mesh-1'),
      { input_task_id: 'mesh-1' },
    ],
  ] as const)('rigging maps %s', async (_name, part, fields) => {
    const requests = await submit(
      (config) => meshy3dModel('rigging', config),
      [part],
      { height_meters: 1.8 },
    )
    expect(requests).toEqual(
      post('/v1/rigging', { height_meters: 1.8, ...fields }),
    )
  })

  it('animation maps a file source to rig_task_id and keeps action_ids', async () => {
    const requests = await submit(
      (config) => meshy3dModel('animation', config),
      [meshyTask('rig-1')],
      { action_ids: [1, 4] },
    )
    expect(requests).toEqual(
      post('/v1/animations', { action_ids: [1, 4], rig_task_id: 'rig-1' }),
    )
  })

  it('sends a data mesh as application/octet-stream data URI', async () => {
    const requests = await submit(
      (config) => meshy3dModel('remesh', config),
      [
        {
          type: 'model3d',
          source: {
            type: 'data',
            value: 'Z2xURg==',
            mimeType: 'model/gltf-binary',
          },
        },
      ],
    )
    expect(requests).toEqual(
      post('/v1/remesh', {
        model_url: 'data:application/octet-stream;base64,Z2xURg==',
      }),
    )
  })

  it('rejects a file source from another provider', async () => {
    const { error, requests } = await submitError('rigging', [
      {
        type: 'model3d',
        source: { type: 'file', value: 'x', provider: 'fal' },
      },
    ])
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toMatch(/file source was issued by fal/)
    expect(requests).toEqual([])
  })

  const rejectedPrompts: Array<
    [string, MeshyModel3dEndpoint, MediaPrompt, RegExp]
  > = [
    [
      'an image on remesh',
      'remesh',
      [mesh(MESH_URL), image(IMAGE_URL)],
      /remesh takes no image prompt parts/,
    ],
    [
      'text on rigging',
      'rigging',
      [mesh(MESH_URL), text('a knight')],
      /rigging takes no text prompt/,
    ],
    [
      'a url mesh on animation',
      'animation',
      [mesh(MESH_URL)],
      /animation takes the mesh only as a Meshy task id/,
    ],
    [
      'five images on multi-image-to-3d',
      'multi-image-to-3d',
      Array.from({ length: 5 }, () => image(IMAGE_URL)),
      /takes 1 to 4 images \(received 5\)/,
    ],
  ]

  it.each(rejectedPrompts)(
    'throws when an endpoint gets a part it cannot use: %s',
    async (_name, endpoint, prompt, message) => {
      const { error, requests } = await submitError(endpoint, prompt)
      expect(String(error)).toMatch(message)
      expect(requests).toEqual([])
    },
  )

  it('throws before POST when convert target_formats is only blend', async () => {
    const { error, requests } = await submitError('convert', [mesh(MESH_URL)], {
      target_formats: ['blend'],
    })
    expect(String(error)).toMatch(
      /convert with target_formats: \['blend'\] returns no 3D model file/,
    )
    expect(requests).toEqual([])
  })

  it('throws before POST when remesh target_formats is only blend', async () => {
    const { error, requests } = await submitError('remesh', [mesh(MESH_URL)], {
      target_formats: ['blend'],
    })
    expect(String(error)).toMatch(
      /remesh with target_formats: \['blend'\] returns no 3D model file/,
    )
    expect(requests).toEqual([])
  })

  it('sends print-split with target_formats blend, because Meshy always adds a GLB', async () => {
    const requests = await submit(
      (config) => meshy3dModel('print-split', config),
      [meshyTask('mesh-1'), text('head, body, base')],
      { target_formats: ['blend'] },
    )
    expect(requests).toEqual(
      post('/v1/print/split', {
        target_formats: ['blend'],
        prompt: 'head, body, base',
        input_task_id: 'mesh-1',
      }),
    )
  })

  it('refine maps an image part to texture_image_url', async () => {
    const requests = await submit(
      (config) => meshy3dModel('text-to-3d-refine', config),
      [meshyTask('preview-1'), image(IMAGE_URL)],
    )
    expect(requests).toEqual(
      post('/v2/text-to-3d', {
        texture_image_url: IMAGE_URL,
        preview_task_id: 'preview-1',
        mode: 'refine',
      }),
    )
  })

  it('relief maps one image part to image_url', async () => {
    const requests = await submit(
      (config) => meshy3dModel('relief', config),
      [image(IMAGE_URL)],
      { size_mm: 80 },
    )
    expect(requests).toEqual(
      post('/v1/relief', { size_mm: 80, image_url: IMAGE_URL }),
    )
  })

  it('sends model_type smart-topology for meshy-t2.5, and modelOptions wins', async () => {
    const requests = await submit(
      (config) => meshy3dModel('image-to-3d', 'meshy-t2.5', config),
      [image(IMAGE_URL)],
    )
    expect(requests).toEqual(
      post('/v1/image-to-3d', {
        model_type: 'smart-topology',
        image_url: IMAGE_URL,
        ai_model: 'meshy-t2.5',
      }),
    )

    const standard = await submit(
      (config) => meshy3dModel('image-to-3d', 'meshy-t2.5', config),
      [image(IMAGE_URL)],
      { model_type: 'standard' },
    )
    expect(standard[0]?.body).toMatchObject({ model_type: 'standard' })
  })

  it('throws before POST for retexture views without meshy-7 or meshy-n1', async () => {
    const { error, requests } = await submitError('retexture', [
      mesh(MESH_URL),
      image('https://x/front.png'),
      image('https://x/back.png'),
    ])
    expect(String(error)).toMatch(/2 to 4 images needs/)
    expect(requests).toEqual([])
  })

  it('throws before POST for retexture views with a text style', async () => {
    const meshy = fakeMeshy()
    const adapter = meshy3dModel('retexture', 'meshy-7', {
      apiKey: 'key',
      fetch: meshy.fetch,
    })
    const create = adapter.create3dModelJob({
      model: adapter.model,
      prompt: [
        mesh(MESH_URL),
        text('gold'),
        image('https://x/front.png'),
        image('https://x/back.png'),
      ],
      logger,
    })
    await expect(create).rejects.toThrow(/not both/)
    expect(meshy.requests).toEqual([])
  })

  it('throws before POST for retexture with 5 images', async () => {
    const { error, requests } = await submitError('retexture', [
      mesh(MESH_URL),
      ...[1, 2, 3, 4, 5].map((n) => image(`https://x/${n}.png`)),
    ])
    expect(String(error)).toMatch(
      /1 style image or 2 to 4 views \(received 5\)/,
    )
    expect(requests).toEqual([])
  })

  it.each([
    ['print-repair', 'model/gltf+json', 'model/gltf+json'],
    ['print-repair', 'application/octet-stream', 'model/gltf-binary'],
    ['print-multi-color', 'model/gltf-binary', 'model/gltf-binary'],
  ] as const)(
    '%s keeps a %s data mesh as %s',
    async (endpoint, mimeType, sentMimeType) => {
      const requests = await submit(
        (config) => meshy3dModel(endpoint, config),
        [
          {
            type: 'model3d',
            source: { type: 'data', value: 'Z2xURg==', mimeType },
          },
        ],
      )
      expect(requests[0]?.body).toEqual({
        model_url: `data:${sentMimeType};base64,Z2xURg==`,
      })
    },
  )

  it.each([
    ['print-repair', 'model/obj', /only GLB or glTF/],
    ['print-multi-color', 'model/gltf+json', /only GLB as inline data/],
  ] as const)(
    '%s rejects a %s data mesh before POST',
    async (endpoint, mimeType, message) => {
      const { error, requests } = await submitError(endpoint, [
        { type: 'model3d', source: { type: 'data', value: 'eA==', mimeType } },
      ])
      expect(String(error)).toMatch(message)
      expect(requests).toEqual([])
    },
  )

  it('passes the abort signal to the create request', async () => {
    const meshy = fakeMeshy()
    const adapter = meshy3dModel('rigging', {
      apiKey: 'key',
      fetch: meshy.fetch,
    })
    const controller = new AbortController()
    await adapter.create3dModelJob({
      model: adapter.model,
      prompt: [mesh(MESH_URL)],
      logger,
      abortSignal: controller.signal,
    })
    const init = meshy.fetch.mock.calls[0]?.[1]
    controller.abort()
    expect(init?.signal?.aborted).toBe(true)
  })

  it('throws before POST when relief should_generate_model is false', async () => {
    const { error, requests } = await submitError(
      'relief',
      [image(IMAGE_URL)],
      {
        should_generate_model: false,
      },
    )
    expect(String(error)).toMatch(
      /relief with should_generate_model: false returns no 3D model file/,
    )
    expect(requests).toEqual([])
  })
})

describe('meshy3dModel get3dModelStatus', () => {
  it.each([
    [
      { status: 'PENDING', progress: 0 },
      { status: 'pending', progress: 0 },
    ],
    [
      { status: 'IN_PROGRESS', progress: 40 },
      { status: 'processing', progress: 40 },
    ],
    [
      { status: 'SUCCEEDED', progress: 100 },
      { status: 'completed', progress: 100 },
    ],
    [
      { status: 'FAILED', progress: 0, task_error: { message: 'Bad mesh' } },
      { status: 'failed', progress: 0, error: 'Bad mesh' },
    ],
  ] as const)('maps status %o', async (task, expected) => {
    const meshy = fakeMeshy(() => json({ id: 'task-9', ...task }))
    const adapter = meshy3dModel('animation', {
      apiKey: 'key',
      fetch: meshy.fetch,
    })

    const status = await adapter.get3dModelStatus('task-9')

    expect(status).toEqual({ jobId: 'task-9', ...expected })
    expect(meshy.requests).toEqual([
      { method: 'GET', url: `${BASE}/v1/animations/task-9`, body: undefined },
    ])
  })
})

describe('meshy3dModel get3dModel', () => {
  it('get3dModel picks the GLB and lists every format and texture', async () => {
    const result = await resultFor(
      (config) => meshy3dModel('image-to-3d', config),
      {
        id: 'task-9',
        status: 'SUCCEEDED',
        model_urls: {
          fbx: 'https://m/a.fbx',
          glb: 'https://m/a.glb',
          obj: 'https://m/a.obj',
          mtl: 'https://m/a.mtl',
          usdz: '',
          pre_remeshed_glb: 'https://m/raw.glb',
        },
        texture_urls: [
          {
            base_color: 'https://m/base.png',
            normal: 'https://m/normal.png',
            metallic: '',
          },
        ],
        thumbnail_url: 'https://m/thumb.png',
      },
    )

    expect(result).toEqual({
      jobId: 'task-9',
      url: 'https://m/a.glb',
      format: 'glb',
      previewImageUrl: 'https://m/thumb.png',
      files: [
        { url: 'https://m/a.glb', format: 'glb', role: 'base' },
        { url: 'https://m/a.fbx', format: 'fbx', role: 'base' },
        { url: 'https://m/a.obj', format: 'obj', role: 'base' },
        { url: 'https://m/raw.glb', format: 'glb', role: 'base' },
        { url: 'https://m/a.mtl', role: 'texture' },
        { url: 'https://m/base.png', role: 'texture' },
        { url: 'https://m/normal.png', role: 'texture' },
      ],
    })
  })

  it('get3dModel maps rigging result with roles and skips empty quadruped URLs', async () => {
    const result = await resultFor(
      (config) => meshy3dModel('rigging', config),
      {
        id: 'task-9',
        status: 'SUCCEEDED',
        result: {
          rigged_character_fbx_url: 'https://m/rig.fbx',
          rigged_character_glb_url: 'https://m/rig.glb',
          basic_animations: {
            walking_glb_url: 'https://m/walk.glb',
            walking_fbx_url: '',
            walking_armature_glb_url: '',
            running_glb_url: '',
            running_fbx_url: '',
            running_armature_glb_url: '',
          },
        },
      },
    )

    expect(result).toEqual({
      jobId: 'task-9',
      url: 'https://m/rig.glb',
      format: 'glb',
      files: [
        { url: 'https://m/rig.glb', format: 'glb', role: 'rigged' },
        { url: 'https://m/rig.fbx', format: 'fbx', role: 'rigged' },
        { url: 'https://m/walk.glb', format: 'glb', role: 'animation' },
      ],
    })
  })

  it('get3dModel maps the animation and post-process files', async () => {
    const result = await resultFor(
      (config) => meshy3dModel('animation', config),
      {
        id: 'task-9',
        status: 'SUCCEEDED',
        result: {
          animation_fbx_url: 'https://m/anim.fbx',
          animation_glb_url: 'https://m/anim.glb',
          processed_usdz_url: 'https://m/anim.usdz',
        },
      },
    )

    expect(result).toEqual({
      jobId: 'task-9',
      url: 'https://m/anim.glb',
      format: 'glb',
      files: [
        { url: 'https://m/anim.glb', format: 'glb', role: 'animation' },
        { url: 'https://m/anim.fbx', format: 'fbx', role: 'animation' },
        { url: 'https://m/anim.usdz', format: 'usdz', role: 'animation' },
      ],
    })
  })

  it('get3dModel returns 3mf for print-multi-color', async () => {
    const result = await resultFor(
      (config) => meshy3dModel('print-multi-color', config),
      {
        id: 'task-9',
        status: 'SUCCEEDED',
        model_urls: { '3mf': 'https://m/print.3mf' },
      },
    )

    expect(result).toEqual({
      jobId: 'task-9',
      url: 'https://m/print.3mf',
      format: '3mf',
      files: [{ url: 'https://m/print.3mf', format: '3mf', role: 'base' }],
    })
  })

  it('get3dModel throws the task_error message for a FAILED task', async () => {
    const result = resultFor((config) => meshy3dModel('remesh', config), {
      id: 'task-9',
      status: 'FAILED',
      task_error: { message: 'Mesh has no faces' },
    })

    await expect(result).rejects.toThrow(
      'meshy: remesh task task-9 failed: Mesh has no faces',
    )
  })

  it('get3dModel throws when a SUCCEEDED task has no model file', async () => {
    const result = resultFor((config) => meshy3dModel('remesh', config), {
      id: 'task-9',
      status: 'SUCCEEDED',
      model_urls: { glb: '' },
    })

    await expect(result).rejects.toThrow(
      'meshy: task task-9 returned no 3D model file.',
    )
  })
})

describe('meshy3dModel cancel3dModelJob', () => {
  const TASK_URL = `${BASE}/v1/rigging/task-9`
  const RUNNING = 'Meshy task task-9 is already running and cannot be canceled'

  /** A fake Meshy where GET answers `status` and DELETE answers `onDelete`. */
  function cancelWith(status: string, onDelete: () => Response) {
    const meshy = fakeMeshy((request) =>
      request.method === 'DELETE' ? onDelete() : json({ id: 'task-9', status }),
    )
    const cancel = meshy3dModel('rigging', {
      apiKey: 'key',
      fetch: meshy.fetch,
    }).cancel3dModelJob('task-9')
    return { cancel, requests: meshy.requests }
  }

  it('cancel deletes a PENDING task', async () => {
    const { cancel, requests } = cancelWith(
      'PENDING',
      () => new Response(null, { status: 200 }),
    )
    await cancel
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET ${TASK_URL}`,
      `DELETE ${TASK_URL}`,
    ])
  })

  it('cancel throws for a running task and sends no DELETE', async () => {
    const { cancel, requests } = cancelWith('IN_PROGRESS', () => json({}))
    await expect(cancel).rejects.toThrow(RUNNING)
    expect(requests.map((r) => r.method)).toEqual(['GET'])
  })

  it('cancel keeps a finished task: no DELETE', async () => {
    const { cancel, requests } = cancelWith('SUCCEEDED', () => json({}))
    await cancel
    expect(requests.map((r) => r.method)).toEqual(['GET'])
  })

  it('cancel throws a clear error when the task starts before the DELETE (409)', async () => {
    const { cancel, requests } = cancelWith('PENDING', () =>
      json({ message: 'Task is running' }, 409),
    )
    await expect(cancel).rejects.toThrow(RUNNING)
    expect(requests.map((r) => r.method)).toEqual(['GET', 'DELETE'])
  })
})
