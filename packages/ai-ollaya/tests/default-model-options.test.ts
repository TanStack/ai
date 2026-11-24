import { describe, expect, it } from 'vitest'
import { ollayaDecider } from '../src/adapters/evaluate'

describe('Ollaya defaultModelOptions', () => {
  it('evaluate adapter stores the defaults', () => {
    const adapter = ollayaDecider('laya:latest', {
      apiKey: 'test-key',
      defaultModelOptions: { temperature: 0 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0 })
  })
})
