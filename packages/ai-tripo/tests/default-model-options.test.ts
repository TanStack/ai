import { describe, expect, it } from 'vitest'
import { tripo3dModel } from '../src'

describe('Tripo defaultModelOptions', () => {
  it('model3d adapter stores the defaults', () => {
    const adapter = tripo3dModel('text-to-model', 'v3.1-20260211', {
      apiKey: 'key',
      defaultModelOptions: { quad: true },
    })

    expect(adapter.defaultModelOptions).toEqual({ quad: true })
  })

  it('types the defaults by the model', () => {
    tripo3dModel('text-to-model', 'P1-20260311', {
      apiKey: 'key',
      // @ts-expect-error P1 has no quad
      defaultModelOptions: { quad: true },
    })
    const byDefault = tripo3dModel('text-to-model', {
      apiKey: 'key',
      defaultModelOptions: { quad: true },
    })

    expect(byDefault.defaultModelOptions).toEqual({ quad: true })
  })
})
