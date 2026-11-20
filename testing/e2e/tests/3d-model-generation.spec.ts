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

    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
    const lastEvent: { type: string } = JSON.parse(events[events.length - 1]!)
    expect(lastEvent.type).toBe('RUN_FINISHED')
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
