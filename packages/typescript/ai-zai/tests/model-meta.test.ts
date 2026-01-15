import { describe, expect, it } from 'vitest'
import { ZAI_CHAT_MODELS, ZAI_MODEL_META, type ZAIModelMap } from '../src/model-meta'

describe('ZAI model meta', () => {
  it('ZAI_CHAT_MODELS matches ZAI_MODEL_META keys', () => {
    const keys = Object.keys(ZAI_MODEL_META).sort()
    const models = [...ZAI_CHAT_MODELS].sort()
    expect(models).toEqual(keys)
  })

  it('ZAIModelMap includes all supported models', () => {
    type Keys = keyof ZAIModelMap
    const a: Keys = 'glm-4.7'
    const b: Keys = 'glm-4.6v'
    const c: Keys = 'glm-4.6'

    expect([a, b, c].length).toBe(3)

    // @ts-expect-error invalid model name is not part of Keys
    const _invalid: Keys = 'not-a-real-model'
    expect(_invalid).toBe('not-a-real-model')
  })
})
