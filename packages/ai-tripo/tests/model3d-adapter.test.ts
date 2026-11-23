import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { tripo3dModel } from '../src/adapters/model3d'
import type { MediaPrompt } from '@tanstack/ai'
import type { TripoModel3dAdapter } from '../src/adapters/model3d'
import type { TripoClientConfig, TripoTask } from '../src/client'
import type {
  TripoModel3dEndpoint,
  TripoModel3dProviderOptions,
  TripoModelFor,
} from '../src/model-meta'

const logger = resolveDebugOption(false)

const BASE = 'https://openapi.tripo3d.ai/v3'
const IMAGE_URL = 'https://example.com/knight.png'
const MESH_URL = 'https://example.com/knight.glb'

function json(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
}

interface TripoRequest {
  method: string
  url: string
  body: unknown
}

/**
 * A fake Tripo API behind the injected `fetch`. It records every request.
 * An upload to `/files` returns `file_abc`, any other POST creates `task-1`,
 * and a GET returns `task`.
 */
function fakeTripo(task: TripoTask = { task_id: 'task-1', status: 'queued' }) {
  const requests: Array<TripoRequest> = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const method = init?.method ?? 'GET'
    const url = String(input)
    const body =
      typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    requests.push({ method, url, body })
    if (url.endsWith('/files')) {
      return json({ code: 0, data: { file_token: 'file_abc' } })
    }
    if (method === 'POST') return json({ code: 0, data: { task_id: 'task-1' } })
    return json({ code: 0, data: task })
  })
  return { fetch, requests }
}

function createJob<E extends TripoModel3dEndpoint, M extends TripoModelFor<E>>(
  adapter: TripoModel3dAdapter<E, M>,
  prompt: MediaPrompt,
  modelOptions?: TripoModel3dProviderOptions<E, M>,
) {
  return adapter.create3dModelJob({
    model: adapter.model,
    prompt,
    modelOptions,
    logger,
  })
}

/** Creates a job and returns the requests that reached Tripo. */
async function submit<
  E extends TripoModel3dEndpoint,
  M extends TripoModelFor<E>,
>(
  makeAdapter: (config: TripoClientConfig) => TripoModel3dAdapter<E, M>,
  prompt: MediaPrompt,
  modelOptions?: TripoModel3dProviderOptions<E, M>,
) {
  const tripo = fakeTripo()
  const adapter = makeAdapter({ apiKey: 'key', fetch: tripo.fetch })
  const job = await createJob(adapter, prompt, modelOptions)
  expect(job).toEqual({ jobId: 'task-1', model: adapter.model })
  return tripo.requests
}

/** Creates a job that must fail, and returns the error and the requests. */
async function submitError<E extends TripoModel3dEndpoint>(
  endpoint: E,
  prompt: MediaPrompt,
) {
  const tripo = fakeTripo()
  const adapter = tripo3dModel(endpoint, { apiKey: 'key', fetch: tripo.fetch })
  const error = await createJob(adapter, prompt).catch(
    (caught: unknown) => caught,
  )
  return { error, requests: tripo.requests }
}

/** Reads finished task `task-9` of an endpoint with this `output`. */
function resultFor(
  endpoint: TripoModel3dEndpoint,
  output: TripoTask['output'],
  status = 'success',
) {
  const tripo = fakeTripo({ task_id: 'task-9', status, output })
  return tripo3dModel(endpoint, {
    apiKey: 'key',
    fetch: tripo.fetch,
  }).get3dModel('task-9')
}

// The `modelOptions` type that `generate3dModel()` reads from an adapter.
type ModelOptionsOf<A extends { '~types': { providerOptions: object } }> =
  A['~types']['providerOptions']

const text = (content: string) => ({ type: 'text', content }) as const
const image = (value: string) =>
  ({ type: 'image', source: { type: 'url', value } }) as const
const dataImage = {
  type: 'image',
  source: { type: 'data', value: 'AAAA', mimeType: 'image/png' },
} as const
const tripoImage = (value: string) =>
  ({
    type: 'image',
    source: { type: 'file', value, provider: 'tripo' },
  }) as const
const mesh = (value: string) =>
  ({ type: 'model3d', source: { type: 'url', value } }) as const
const dataMesh = {
  type: 'model3d',
  source: { type: 'data', value: 'Z2xURg==', mimeType: 'model/gltf-binary' },
} as const
const tripoTask = (value: string) =>
  ({
    type: 'model3d',
    source: { type: 'file', value, provider: 'tripo' },
  }) as const

const post = (path: string, body: object) => ({
  method: 'POST',
  url: `${BASE}${path}`,
  body,
})

describe('tripo3dModel types', () => {
  it('types modelOptions by the model', () => {
    const config = { apiKey: 'key' }
    const p1 = tripo3dModel('text-to-model', 'P1-20260311', config)
    const v31 = tripo3dModel('text-to-model', 'v3.1-20260211', config)
    const byDefault = tripo3dModel('text-to-model', config)
    // @ts-expect-error P1 has no quad
    const p1Options: ModelOptionsOf<typeof p1> = { quad: true }
    const v31Options: ModelOptionsOf<typeof v31> = { quad: true }
    const defaultOptions: ModelOptionsOf<typeof byDefault> = { quad: true }
    expect([p1Options, v31Options, defaultOptions]).toHaveLength(3)
    expectTypeOf(byDefault).toEqualTypeOf<
      TripoModel3dAdapter<'text-to-model', 'v3.1-20260211'>
    >()
    expectTypeOf(tripo3dModel('rig', config)).toEqualTypeOf<
      TripoModel3dAdapter<'rig', 'v1.0-20240301'>
    >()
    // @ts-expect-error convert has no model choice
    tripo3dModel('convert', 'v3.1-20260211', config)
    expect(tripo3dModel('convert', config).model).toBe('convert')
  })
})

describe('tripo3dModel create3dModelJob', () => {
  it('text-to-model sends the prompt and the default model', async () => {
    const requests = await submit(
      (config) => tripo3dModel('text-to-model', config),
      'a wooden chest',
      { face_limit: 20000 },
    )
    expect(requests).toEqual([
      post('/generation/text-to-model', {
        face_limit: 20000,
        prompt: 'a wooden chest',
        model: 'v3.1-20260211',
      }),
    ])
  })

  it('text-to-model sends an explicit model', async () => {
    const requests = await submit(
      (config) => tripo3dModel('text-to-model', 'P1-20260311', config),
      'a wooden chest',
    )
    expect(requests).toEqual([
      post('/generation/text-to-model', {
        prompt: 'a wooden chest',
        model: 'P1-20260311',
      }),
    ])
  })

  it.each([
    ['a url image', image(IMAGE_URL), IMAGE_URL],
    ['a tripo file source', tripoImage('image-task-1'), 'image-task-1'],
  ] as const)(
    'image-to-model sends %s as input',
    async (_name, part, input) => {
      const requests = await submit(
        (config) => tripo3dModel('image-to-model', config),
        [part],
      )
      expect(requests).toEqual([
        post('/generation/image-to-model', { input, model: 'v3.1-20260211' }),
      ])
    },
  )

  it('uploads a data image and sends its file_token, not a data URI', async () => {
    const requests = await submit(
      (config) => tripo3dModel('image-to-model', config),
      [dataImage],
    )
    expect(requests.map((request) => request.url)).toEqual([
      `${BASE}/files`,
      `${BASE}/generation/image-to-model`,
    ])
    expect(requests[1]?.body).toEqual({
      input: 'file_abc',
      model: 'v3.1-20260211',
    })
  })

  it.each([
    [
      '2 views padded to 4',
      [image('https://x/front.png'), image('https://x/left.png')],
      ['https://x/front.png', 'https://x/left.png', '', ''],
    ],
    [
      '4 views in order',
      [
        image('https://x/front.png'),
        image('https://x/left.png'),
        image('https://x/back.png'),
        image('https://x/right.png'),
      ],
      [
        'https://x/front.png',
        'https://x/left.png',
        'https://x/back.png',
        'https://x/right.png',
      ],
    ],
    [
      'one image-to-multiview task',
      [tripoImage('multiview-1')],
      [{ task_id: 'multiview-1' }],
    ],
  ] as const)('multiview-to-model sends %s', async (_name, images, inputs) => {
    const requests = await submit(
      (config) => tripo3dModel('multiview-to-model', config),
      [...images],
    )
    expect(requests).toEqual([
      post('/generation/multiview-to-model', {
        inputs,
        model: 'v3.1-20260211',
      }),
    ])
  })

  it.each([
    ['text only', [text('worn leather')], { text: 'worn leather' }],
    [
      'text and a style image',
      [text('cyberpunk'), image(IMAGE_URL)],
      { text: 'cyberpunk', style_image: { url: IMAGE_URL } },
    ],
    [
      'one tripo image',
      [tripoImage('file_ref')],
      { image: { file_token: 'file_ref' } },
    ],
    [
      'two images',
      [image('https://x/front.png'), image('https://x/left.png')],
      { images: ['https://x/front.png', 'https://x/left.png', '', ''] },
    ],
  ] as const)(
    'texture maps %s to texture_prompt',
    async (_name, parts, texturePrompt) => {
      const requests = await submit(
        (config) => tripo3dModel('texture', 'v3.5-20260815', config),
        [tripoTask('mesh-1'), ...parts],
        { pbr: true },
      )
      expect(requests).toEqual([
        post('/models/texture', {
          pbr: true,
          input: 'mesh-1',
          texture_prompt: texturePrompt,
          model: 'v3.5-20260815',
        }),
      ])
    },
  )

  it.each(['rig', 'convert', 'decimate', 'uv', 'segment'] as const)(
    '%s sends the mesh as input with no model',
    async (endpoint) => {
      const requests = await submit(
        (config) => tripo3dModel(endpoint, config),
        [mesh(MESH_URL)],
      )
      expect(requests).toEqual([
        post(
          {
            rig: '/animations/rig',
            convert: '/models/convert',
            decimate: '/mesh/decimate',
            uv: '/mesh/uv',
            segment: '/mesh/segment',
          }[endpoint],
          { input: MESH_URL },
        ),
      ])
    },
  )

  it('uploads a data mesh and sends its file_token', async () => {
    const requests = await submit(
      (config) => tripo3dModel('rig', 'v3.0-20260909', config),
      [dataMesh],
      { rig_type: 'others' },
    )
    expect(requests[1]).toEqual(
      post('/animations/rig', {
        rig_type: 'others',
        input: 'file_abc',
        model: 'v3.0-20260909',
      }),
    )
  })

  it('retarget sends the rig task id', async () => {
    const requests = await submit(
      (config) => tripo3dModel('retarget', config),
      [tripoTask('rig-1')],
      { animation: 'preset:walk' },
    )
    expect(requests).toEqual([
      post('/animations/retarget', {
        animation: 'preset:walk',
        input: 'rig-1',
      }),
    ])
  })

  it('rejects convert texture_packaging zip before any request', async () => {
    const tripo = fakeTripo()
    const adapter = tripo3dModel('convert', {
      apiKey: 'key',
      fetch: tripo.fetch,
    })
    const error = await createJob(adapter, [mesh(MESH_URL)], {
      format: 'FBX',
      texture_packaging: 'zip',
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toMatch(
      /convert with texture_packaging: 'zip' is not supported/,
    )
    expect(tripo.requests).toEqual([])
  })

  const rejectedPrompts: Array<
    [string, TripoModel3dEndpoint, MediaPrompt, RegExp]
  > = [
    [
      'a url mesh on retarget',
      'retarget',
      [mesh(MESH_URL)],
      /retarget takes the mesh only as a Tripo task id/,
    ],
    [
      'a data mesh on retarget',
      'retarget',
      [dataMesh],
      /retarget takes the mesh only as a Tripo task id/,
    ],
    [
      'text on image-to-model',
      'image-to-model',
      [image(IMAGE_URL), text('a knight')],
      /image-to-model takes no text prompt/,
    ],
    [
      'an image on rig',
      'rig',
      [mesh(MESH_URL), image(IMAGE_URL)],
      /rig takes no image prompt parts/,
    ],
    [
      'a mesh on text-to-model',
      'text-to-model',
      [text('a chest'), mesh(MESH_URL)],
      /text-to-model takes no model3d prompt part/,
    ],
    [
      'a video part',
      'convert',
      [
        mesh(MESH_URL),
        { type: 'video', source: { type: 'url', value: 'https://x/a.mp4' } },
      ],
      /takes text, image, and model3d prompt parts only/,
    ],
    [
      'an empty text-to-model prompt',
      'text-to-model',
      '',
      /text-to-model needs a text prompt/,
    ],
    [
      'two images on image-to-model',
      'image-to-model',
      [image(IMAGE_URL), image(IMAGE_URL)],
      /image-to-model takes one image \(received 2\)/,
    ],
    [
      'one url image on multiview-to-model',
      'multiview-to-model',
      [image(IMAGE_URL)],
      /multiview-to-model takes 2 to 4 images/,
    ],
    [
      'no mesh on convert',
      'convert',
      [],
      /convert takes one model3d prompt part \(received 0\)/,
    ],
    [
      'text with two images on texture',
      'texture',
      [tripoTask('mesh-1'), text('oak'), image(IMAGE_URL), image(IMAGE_URL)],
      /texture takes a text with at most one style image/,
    ],
    [
      'a data image next to a mesh on rig',
      'rig',
      [mesh(MESH_URL), dataImage],
      /rig takes no image prompt parts/,
    ],
  ]

  it.each(rejectedPrompts)(
    'rejects %s before any request',
    async (_name, endpoint, prompt, message) => {
      const { error, requests } = await submitError(endpoint, prompt)
      expect(error).toBeInstanceOf(Error)
      expect(String(error)).toMatch(message)
      expect(requests).toEqual([])
    },
  )
})

describe('tripo3dModel get3dModelStatus', () => {
  it('maps the Tripo task status', async () => {
    const tripo = fakeTripo({
      task_id: 'task 1',
      status: 'running',
      progress: 40,
    })
    const adapter = tripo3dModel('rig', { apiKey: 'key', fetch: tripo.fetch })

    const status = await adapter.get3dModelStatus('task 1')

    expect(status).toEqual({
      jobId: 'task 1',
      status: 'processing',
      progress: 40,
    })
    expect(tripo.requests[0]?.url).toBe(`${BASE}/tasks/task%201`)
  })
})

describe('tripo3dModel get3dModel', () => {
  it('maps model_url, a signed URL, and the preview image', async () => {
    const result = await resultFor('image-to-model', {
      model_url: 'https://cdn.tripo3d.ai/out/model.FBX?sig=abc.glb#x',
      rendered_image_url: 'https://cdn.tripo3d.ai/out/preview.png',
    })
    expect(result).toEqual({
      jobId: 'task-9',
      url: 'https://cdn.tripo3d.ai/out/model.FBX?sig=abc.glb#x',
      format: 'fbx',
      files: [
        {
          url: 'https://cdn.tripo3d.ai/out/model.FBX?sig=abc.glb#x',
          role: 'base',
          format: 'fbx',
        },
      ],
      previewImageUrl: 'https://cdn.tripo3d.ai/out/preview.png',
    })
  })

  it('reads a result with only model_urls as animation files', async () => {
    const result = await resultFor('retarget', {
      model_urls: [
        'https://cdn.tripo3d.ai/out/walk.fbx?sig=1',
        'https://cdn.tripo3d.ai/out/run.glb?sig=2',
      ],
    })
    expect(result).toEqual({
      jobId: 'task-9',
      url: 'https://cdn.tripo3d.ai/out/run.glb?sig=2',
      format: 'glb',
      files: [
        {
          url: 'https://cdn.tripo3d.ai/out/walk.fbx?sig=1',
          role: 'animation',
          format: 'fbx',
        },
        {
          url: 'https://cdn.tripo3d.ai/out/run.glb?sig=2',
          role: 'animation',
          format: 'glb',
        },
      ],
    })
  })

  it('gives each output field its role and skips a repeated URL', async () => {
    const result = await resultFor('rig', {
      model_url: 'https://cdn.tripo3d.ai/out/rigged.glb',
      pbr_model: 'https://cdn.tripo3d.ai/out/rigged.glb',
      base_model: 'https://cdn.tripo3d.ai/out/base.obj',
      seg_model_url: 'https://cdn.tripo3d.ai/out/seg.glb',
      uv_render_url: 'https://cdn.tripo3d.ai/out/uv.webp',
    })
    expect(result.files).toEqual([
      {
        url: 'https://cdn.tripo3d.ai/out/rigged.glb',
        role: 'rigged',
        format: 'glb',
      },
      {
        url: 'https://cdn.tripo3d.ai/out/base.obj',
        role: 'base',
        format: 'obj',
      },
      {
        url: 'https://cdn.tripo3d.ai/out/seg.glb',
        role: 'part',
        format: 'glb',
      },
      { url: 'https://cdn.tripo3d.ai/out/uv.webp', role: 'texture' },
    ])
  })

  it('marks segment model_url as part', async () => {
    const onlyModelUrl = await resultFor('segment', {
      model_url: 'https://cdn.tripo3d.ai/out/parts.glb',
    })
    expect(onlyModelUrl.files).toEqual([
      {
        url: 'https://cdn.tripo3d.ai/out/parts.glb',
        role: 'part',
        format: 'glb',
      },
    ])

    const both = await resultFor('segment', {
      model_url: 'https://cdn.tripo3d.ai/out/model.glb',
      seg_model_url: 'https://cdn.tripo3d.ai/out/seg.glb',
    })
    expect(both.files).toEqual([
      {
        url: 'https://cdn.tripo3d.ai/out/model.glb',
        role: 'part',
        format: 'glb',
      },
      {
        url: 'https://cdn.tripo3d.ai/out/seg.glb',
        role: 'part',
        format: 'glb',
      },
    ])
  })

  it.each([
    [{ format: 'FBX' as const }, 'fbx'],
    [{ format: 'GLTF' as const, quad: true }, 'fbx'],
    [{ format: 'OBJ' as const }, 'obj'],
  ])(
    'reads an extensionless convert URL as the requested format %s',
    async (modelOptions, format) => {
      const tripo = fakeTripo({
        task_id: 'task-1',
        status: 'success',
        output: { model_url: 'https://cdn.tripo3d.ai/out/converted-model' },
      })
      const adapter = tripo3dModel('convert', {
        apiKey: 'key',
        fetch: tripo.fetch,
      })
      await createJob(adapter, [mesh(MESH_URL)], modelOptions)
      const result = await adapter.get3dModel('task-1')
      expect(result.format).toBe(format)
      expect(result.files).toEqual([
        {
          url: 'https://cdn.tripo3d.ai/out/converted-model',
          role: 'base',
          format,
        },
      ])
    },
  )

  it('throws when the task has no 3D model file', async () => {
    await expect(
      resultFor('uv', { uv_render_url: 'https://cdn.tripo3d.ai/out/uv.webp' }),
    ).rejects.toThrow('tripo: task task-9 returned no 3D model file.')
  })

  it('throws with the Tripo message for a failed task', async () => {
    const tripo = fakeTripo({
      task_id: 'task-9',
      status: 'failed',
      error_message: 'mesh has no skeleton',
    })
    const adapter = tripo3dModel('retarget', {
      apiKey: 'key',
      fetch: tripo.fetch,
    })
    await expect(adapter.get3dModel('task-9')).rejects.toThrow(
      'tripo: retarget task task-9 failed: mesh has no skeleton',
    )
  })
})
