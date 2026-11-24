import { describe, expect, it } from 'vitest'
import { withDefaultModelOptions } from '../src/activities/default-model-options'

type ModelOptions = {
  provider?: { sort?: string; only?: Array<string> }
  temperature?: number
}

function createOptions(input: {
  defaultModelOptions?: ModelOptions | undefined
  modelOptions?: ModelOptions | undefined
}) {
  return {
    adapter: { name: 'test', defaultModelOptions: input.defaultModelOptions },
    model: 'test-model',
    modelOptions: input.modelOptions,
  }
}

const defaults = {
  provider: { sort: 'latency', only: ['a'] },
  temperature: 0.2,
}

describe('withDefaultModelOptions', () => {
  it('returns the same object when the adapter has no defaults', () => {
    const options = createOptions({ modelOptions: { temperature: 0.9 } })
    expect(withDefaultModelOptions(options)).toBe(options)
  })

  it('uses the defaults when the call sets no modelOptions', () => {
    const result = withDefaultModelOptions(
      createOptions({ defaultModelOptions: defaults }),
    )
    expect(result.modelOptions).toEqual({
      provider: { sort: 'latency', only: ['a'] },
      temperature: 0.2,
    })
  })

  it('uses the defaults when the call sets modelOptions to undefined', () => {
    const result = withDefaultModelOptions(
      createOptions({ defaultModelOptions: defaults, modelOptions: undefined }),
    )
    expect(result.modelOptions).toEqual({
      provider: { sort: 'latency', only: ['a'] },
      temperature: 0.2,
    })
  })

  it('keeps the call modelOptions when the defaults are empty', () => {
    const result = withDefaultModelOptions(
      createOptions({
        defaultModelOptions: {},
        modelOptions: { temperature: 0.9 },
      }),
    )
    expect(result.modelOptions).toEqual({ temperature: 0.9 })
  })

  it('lets a call key win over the default key', () => {
    const result = withDefaultModelOptions(
      createOptions({
        defaultModelOptions: defaults,
        modelOptions: { temperature: 0.9 },
      }),
    )
    expect(result.modelOptions).toEqual({
      provider: { sort: 'latency', only: ['a'] },
      temperature: 0.9,
    })
  })

  it('replaces a nested default key in full, with no deep merge', () => {
    const result = withDefaultModelOptions(
      createOptions({
        defaultModelOptions: defaults,
        modelOptions: { provider: { only: ['b'] } },
      }),
    )
    expect(result.modelOptions).toEqual({
      provider: { only: ['b'] },
      temperature: 0.2,
    })
  })

  it('keeps the other option fields', () => {
    const result = withDefaultModelOptions(
      createOptions({ defaultModelOptions: defaults }),
    )
    expect(result.model).toBe('test-model')
    expect(result.adapter.name).toBe('test')
  })
})
