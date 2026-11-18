import { describe, expect, expectTypeOf, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { fal3DModel } from '../src/adapters/model3d'
import type { MediaPrompt } from '@tanstack/ai'
import type {
  Fal3DModel,
  Fal3DModelProviderOptions,
  Fal3DPromptModalitiesFor,
} from '../src/model-meta'

const logger = resolveDebugOption(false)

const IMAGE_URL = 'https://example.com/chair.png'
const MESH_URL = 'https://example.com/chair.glb'

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

/**
 * A fake fal queue behind the injected `fetch`. Submit answers with request
 * `req-1` and records the input body. Status answers with `status`, the
 * result with `result`, and cancel records the URL.
 */
function falQueue(answers: { status?: unknown; result?: Response } = {}) {
  const submitted: Array<unknown> = []
  const cancels: Array<string> = []
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.endsWith('/cancel')) {
      cancels.push(url)
      return Promise.resolve(json({ status: 'CANCELLATION_REQUESTED' }))
    }
    if (init?.method === 'POST') {
      submitted.push(JSON.parse(String(init.body)))
      return Promise.resolve(json({ request_id: 'req-1' }))
    }
    if (url.includes('/status')) return Promise.resolve(json(answers.status))
    return Promise.resolve(answers.result ?? json({}))
  }
  return { fetch, submitted, cancels }
}

function adapterFor<TModel extends Fal3DModel>(
  model: TModel,
  queue: ReturnType<typeof falQueue>,
) {
  return fal3DModel(model, { apiKey: 'test-key', fetch: queue.fetch })
}

/** Submits `prompt` to `model` and returns the input body fal received. */
async function submittedInput<TModel extends Fal3DModel>(
  model: TModel,
  prompt: MediaPrompt,
  modelOptions?: Fal3DModelProviderOptions<TModel>,
) {
  const queue = falQueue()
  const job = await adapterFor(model, queue).create3DModelJob({
    model,
    prompt,
    modelOptions,
    logger,
  })
  expect(job).toEqual({ jobId: 'req-1', model })
  return queue.submitted[0]
}

/** Reads a finished job whose result body is `output`. */
function resultFor(output: unknown, init?: ResponseInit) {
  const queue = falQueue({ result: json(output, init) })
  return adapterFor('fal-ai/hunyuan3d-v3/image-to-3d', queue).get3DModel(
    'req-1',
  )
}

const image = (value: string) =>
  ({ type: 'image', source: { type: 'url', value } }) as const
const mesh = (value: string) =>
  ({ type: 'model3d', source: { type: 'url', value } }) as const

describe('fal3DModel types', () => {
  it('removes the prompt-routed fields from modelOptions', () => {
    expectTypeOf<
      Fal3DModelProviderOptions<'fal-ai/hunyuan3d-v3/image-to-3d'>
    >().not.toHaveProperty('input_image_url')
    expectTypeOf<
      Fal3DModelProviderOptions<'fal-ai/hunyuan3d-v3/image-to-3d'>
    >().toHaveProperty('face_count')
    expectTypeOf<
      Fal3DModelProviderOptions<'fal-ai/trellis-2/retexture'>
    >().not.toHaveProperty('mesh_url')
    expectTypeOf<
      Fal3DModelProviderOptions<'fal-ai/trellis-2/retexture'>
    >().not.toHaveProperty('image_url')
  })

  it('derives the prompt modalities from the endpoint input', () => {
    expectTypeOf<
      Fal3DPromptModalitiesFor<'fal-ai/hunyuan3d-v3/image-to-3d'>
    >().toEqualTypeOf<ReadonlyArray<'image'>>()
    expectTypeOf<
      Fal3DPromptModalitiesFor<'fal-ai/trellis-2/retexture'>
    >().toEqualTypeOf<ReadonlyArray<'image' | 'model3d'>>()
  })
})

describe('fal3DModel create3DModelJob', () => {
  it('sends an image-to-3D image as input_image_url next to modelOptions', async () => {
    const input = await submittedInput(
      'fal-ai/hunyuan3d-v3/image-to-3d',
      [image(IMAGE_URL)],
      { face_count: 50000, generate_type: 'LowPoly' },
    )
    expect(input).toEqual({
      input_image_url: IMAGE_URL,
      face_count: 50000,
      generate_type: 'LowPoly',
    })
  })

  it('sends the mesh and the reference image to TRELLIS-2 retexture', async () => {
    const input = await submittedInput('fal-ai/trellis-2/retexture', [
      mesh(MESH_URL),
      image(IMAGE_URL),
    ])
    expect(input).toEqual({ mesh_url: MESH_URL, image_url: IMAGE_URL })
  })

  it.each([
    [
      'a data source as a data URL',
      { type: 'data', value: 'AAAA', mimeType: 'image/png' },
      'data:image/png;base64,AAAA',
    ],
    [
      'a fal file source as its storage URL',
      {
        type: 'file',
        value: 'https://fal.media/files/chair.png',
        provider: 'fal',
      },
      'https://fal.media/files/chair.png',
    ],
  ] as const)('sends %s', async (_name, source, expected) => {
    const input = await submittedInput('fal-ai/hunyuan3d-v3/image-to-3d', [
      { type: 'image', source },
    ])
    expect(input).toEqual({ input_image_url: expected })
  })

  const rejectedPrompts: Array<[string, Fal3DModel, MediaPrompt, RegExp]> = [
    [
      'a text prompt to an endpoint with no text field',
      'fal-ai/hunyuan3d-v3/image-to-3d',
      'a wooden chair',
      /fal-ai\/hunyuan3d-v3\/image-to-3d takes no text prompt/,
    ],
    [
      'a mesh to an endpoint with no mesh field',
      'fal-ai/hunyuan3d-v3/image-to-3d',
      [mesh(MESH_URL)],
      /fal-ai\/hunyuan3d-v3\/image-to-3d takes no model3d prompt part/,
    ],
    [
      'two meshes',
      'fal-ai/trellis-2/retexture',
      [mesh(MESH_URL), mesh(MESH_URL)],
      /takes one model3d prompt part \(received 2\)/,
    ],
    [
      'an image to an endpoint that takes no image parts',
      'fal-ai/hunyuan3d-v3/text-to-3d',
      [image(IMAGE_URL)],
      /fal-ai\/hunyuan3d-v3\/text-to-3d takes no image prompt parts/,
    ],
  ]

  it.each(rejectedPrompts)(
    'rejects %s without a request',
    async (_name, model, prompt, message) => {
      const queue = falQueue()
      const run = adapterFor(model, queue).create3DModelJob({
        model,
        prompt,
        logger,
      })
      await expect(run).rejects.toThrow(message)
      expect(queue.submitted).toEqual([])
    },
  )
})

describe('fal3DModel get3DModelStatus', () => {
  it.each([
    [{ status: 'IN_QUEUE', queue_position: 2 }, { status: 'pending' }],
    [{ status: 'IN_PROGRESS', logs: [] }, { status: 'processing' }],
    [{ status: 'COMPLETED', logs: [] }, { status: 'completed' }],
    [
      { status: 'COMPLETED', logs: [], error: 'GPU out of memory' },
      { status: 'failed', error: 'GPU out of memory' },
    ],
  ])('maps fal status %o', async (falStatus, expected) => {
    const queue = falQueue({ status: falStatus })
    const status = await adapterFor('fal-ai/trellis-2', queue).get3DModelStatus(
      'req-1',
    )
    expect(status).toEqual({ jobId: 'req-1', ...expected })
  })
})

describe('fal3DModel get3DModel', () => {
  it('maps a Hunyuan3D v3 output with model_glb and model_urls', async () => {
    const result = await resultFor({
      model_glb: {
        url: 'https://fal.media/files/a/model.glb',
        content_type: 'model/gltf-binary',
        file_name: 'model.glb',
      },
      model_urls: {
        glb: { url: 'https://fal.media/files/a/model.glb' },
        obj: { url: 'https://fal.media/files/a/model.obj' },
        fbx: { url: 'https://fal.media/files/a/model.fbx' },
      },
      thumbnail: { url: 'https://fal.media/files/a/preview.png' },
    })
    expect(result).toEqual({
      jobId: 'req-1',
      url: 'https://fal.media/files/a/model.glb',
      format: 'glb',
      files: [
        {
          url: 'https://fal.media/files/a/model.glb',
          format: 'glb',
          role: 'base',
          contentType: 'model/gltf-binary',
        },
        {
          url: 'https://fal.media/files/a/model.fbx',
          format: 'fbx',
          role: 'base',
        },
        {
          url: 'https://fal.media/files/a/model.obj',
          format: 'obj',
          role: 'base',
        },
      ],
      previewImageUrl: 'https://fal.media/files/a/preview.png',
    })
  })

  it('maps a Rodin output with model_mesh and keeps the texture images', async () => {
    const result = await resultFor({
      model_mesh: { url: 'https://fal.media/files/b/mesh.glb' },
      seed: 7,
      textures: [
        {
          url: 'https://fal.media/files/b/albedo.png',
          content_type: 'image/png',
        },
      ],
    })
    expect(result).toEqual({
      jobId: 'req-1',
      url: 'https://fal.media/files/b/mesh.glb',
      format: 'glb',
      files: [
        {
          url: 'https://fal.media/files/b/mesh.glb',
          format: 'glb',
          role: 'base',
        },
        {
          url: 'https://fal.media/files/b/albedo.png',
          role: 'texture',
          contentType: 'image/png',
        },
      ],
    })
  })

  it('keeps the Meshy texture_urls sets as texture files', async () => {
    const result = await resultFor({
      model_glb: { url: 'https://fal.media/files/h/model.glb' },
      texture_urls: [
        {
          base_color: { url: 'https://fal.media/files/h/base_color.png' },
          normal: { url: 'https://fal.media/files/h/normal.png' },
        },
      ],
    })
    expect(result.files).toEqual([
      {
        url: 'https://fal.media/files/h/model.glb',
        format: 'glb',
        role: 'base',
      },
      { url: 'https://fal.media/files/h/base_color.png', role: 'texture' },
      { url: 'https://fal.media/files/h/normal.png', role: 'texture' },
    ])
  })

  it('keeps the Hunyuan3D rapid texture and MTL files as texture files', async () => {
    const result = await resultFor({
      model_urls: { obj: { url: 'https://fal.media/files/i/model.obj' } },
      texture: { url: 'https://fal.media/files/i/texture.png' },
      material_mtl: { url: 'https://fal.media/files/i/material.mtl' },
    })
    expect(result).toEqual({
      jobId: 'req-1',
      url: 'https://fal.media/files/i/model.obj',
      format: 'obj',
      files: [
        {
          url: 'https://fal.media/files/i/model.obj',
          format: 'obj',
          role: 'base',
        },
        { url: 'https://fal.media/files/i/texture.png', role: 'texture' },
        { url: 'https://fal.media/files/i/material.mtl', role: 'texture' },
      ],
    })
  })

  it('prefers the Tripo PBR model and keeps the base model', async () => {
    const result = await resultFor({
      base_model: { url: 'https://fal.media/files/c/base.glb' },
      pbr_model: { url: 'https://fal.media/files/c/pbr.glb' },
      rendered_image: { url: 'https://fal.media/files/c/render.webp' },
      task_id: 'tripo-1',
    })
    expect(result).toEqual({
      jobId: 'req-1',
      url: 'https://fal.media/files/c/pbr.glb',
      format: 'glb',
      files: [
        {
          url: 'https://fal.media/files/c/pbr.glb',
          format: 'glb',
          role: 'pbr',
        },
        {
          url: 'https://fal.media/files/c/base.glb',
          format: 'glb',
          role: 'base',
        },
      ],
      previewImageUrl: 'https://fal.media/files/c/render.webp',
    })
  })

  it('maps the Meshy v6 rigged and animation files with their roles', async () => {
    const result = await resultFor({
      model_glb: { url: 'https://fal.media/files/d/model.glb' },
      model_urls: { glb: { url: 'https://fal.media/files/d/model.glb' } },
      rigged_character_glb: { url: 'https://fal.media/files/d/rigged.glb' },
      rigged_character_fbx: { url: 'https://fal.media/files/d/rigged.fbx' },
      animation_glb: { url: 'https://fal.media/files/d/dance.glb' },
      basic_animations: {
        walking_glb: { url: 'https://fal.media/files/d/walking.glb' },
        running_fbx: { url: 'https://fal.media/files/d/running.fbx' },
      },
    })
    expect(result.url).toBe('https://fal.media/files/d/model.glb')
    expect(result.files).toEqual([
      {
        url: 'https://fal.media/files/d/model.glb',
        format: 'glb',
        role: 'base',
      },
      {
        url: 'https://fal.media/files/d/rigged.glb',
        format: 'glb',
        role: 'rigged',
      },
      {
        url: 'https://fal.media/files/d/rigged.fbx',
        format: 'fbx',
        role: 'rigged',
      },
      {
        url: 'https://fal.media/files/d/dance.glb',
        format: 'glb',
        role: 'animation',
      },
      {
        url: 'https://fal.media/files/d/walking.glb',
        format: 'glb',
        role: 'animation',
      },
      {
        url: 'https://fal.media/files/d/running.fbx',
        format: 'fbx',
        role: 'animation',
      },
    ])
  })

  it.each([
    [
      'model_urls with only OBJ and FBX',
      {
        model_urls: {
          obj: { url: 'https://fal.media/files/e/model.obj' },
          fbx: { url: 'https://fal.media/files/e/model.fbx' },
        },
      },
      { url: 'https://fal.media/files/e/model.fbx', format: 'fbx' },
    ],
    [
      'an OBJ model_mesh',
      { model_mesh: { url: 'https://fal.media/files/e/mesh.obj' } },
      { url: 'https://fal.media/files/e/mesh.obj', format: 'obj' },
    ],
  ])('picks the best file with no GLB: %s', async (_name, output, expected) => {
    const result = await resultFor(output)
    expect({ url: result.url, format: result.format }).toEqual(expected)
  })

  it('throws when the output has no mesh file', async () => {
    await expect(
      resultFor({ images: [{ url: 'https://fal.media/files/f/view.png' }] }),
    ).rejects.toThrow('fal: job req-1 returned no 3D model file')
  })

  it('reports the billable units from fal as usage', async () => {
    const result = await resultFor(
      { model_glb: { url: 'https://fal.media/files/g/model.glb' } },
      {
        headers: {
          'x-fal-request-id': 'req-usage',
          'x-fal-billable-units': '3',
        },
      },
    )
    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      billed: { quantity: 3, unit: 'units' },
    })
  })

  it.each([
    [
      'a 422 field error',
      422,
      {
        detail: [
          {
            loc: ['body', 'input_image_url'],
            msg: 'Unsupported image format',
            type: 'value_error',
          },
        ],
      },
      'body.input_image_url: Unsupported image format',
    ],
    [
      'a string detail',
      400,
      { detail: 'Mesh has no faces' },
      'Mesh has no faces',
    ],
  ])('surfaces the fal message of %s', async (_name, status, body, message) => {
    await expect(resultFor(body, { status })).rejects.toThrow(message)
  })
})

describe('fal3DModel cancel3DModelJob', () => {
  it('cancels the job with the fal queue cancel endpoint', async () => {
    const queue = falQueue()
    await adapterFor('fal-ai/hunyuan3d-v3/image-to-3d', queue).cancel3DModelJob(
      'req-1',
    )
    expect(queue.cancels).toEqual([
      'https://queue.fal.run/fal-ai/hunyuan3d-v3/requests/req-1/cancel',
    ])
  })
})
