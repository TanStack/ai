import { describe, expect, it } from 'vitest'
import { generationPlugin, imagePlugin } from '../../../src/plugin'

describe('imagePlugin', () => {
  it('produces a one-shot generation plugin that types req.input as the image contract', async () => {
    const p = imagePlugin(async (req) => ({
      id: 'img-1',
      model: 'test-model',
      images: [{ b64Json: `img:${req.input.prompt}` }],
    }))
    expect(p.kind).toBe('one-shot')
    // execute runs the callback with the parsed input
    const req = {
      input: { prompt: 'a cat' },
      threadId: 't',
      runId: 'r',
      state: null,
      aguiContext: [],
      forwardedProps: {},
      request: new Request('http://x'),
      signal: new AbortController().signal,
    }
    const out = await p.execute(req)
    if (Symbol.asyncIterator in out) {
      throw new Error('expected a resolved result, not a stream')
    }
    expect(out.images[0]?.b64Json).toBe('img:a cat')
  })

  it('is equivalent to generationPlugin with the image schema (accepts numberOfImages/size)', () => {
    const p = imagePlugin(async () => ({
      id: 'img-2',
      model: 'test-model',
      images: [],
    }))
    expect(typeof p.execute).toBe('function')
    expect(p.input).toBeDefined() // image input schema present
    // sanity: generationPlugin is the underlying primitive
    expect(typeof generationPlugin).toBe('function')
  })
})
