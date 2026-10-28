import { describe, expect, it } from 'vitest'
import {
  ZAI_CHAT_MODELS,
  ZAI_MODEL_META,
  ZAI_MODEL_REASONING,
  ZAI_MODEL_INPUT_MODALITIES,
  type ZAIChatModelProviderOptionsByName,
} from '../src/model-meta'

describe('ZAI model meta', () => {
  it('ZAI_CHAT_MODELS matches ZAI_MODEL_META keys', () => {
    const keys = Object.keys(ZAI_MODEL_META).sort()
    const models = [...ZAI_CHAT_MODELS].sort()
    expect(models).toEqual(keys)
  })

  it('ZAIChatModelProviderOptionsByName includes all supported models', () => {
    type Keys = keyof ZAIChatModelProviderOptionsByName
    const a: Keys = 'glm-5.2'
    const b: Keys = 'glm-4.7'
    const c: Keys = 'glm-4.6v'

    expect([a, b, c].length).toBe(3)

    // @ts-expect-error invalid model name is not part of Keys
    const _invalid: Keys = 'not-a-real-model'
    expect(_invalid).toBe('not-a-real-model')
  })

  it('glm-5.2 is the previous flagship: 1M context, high/max reasoning', () => {
    const meta = ZAI_MODEL_META['glm-5.2']
    expect(meta.context_window).toBe(1_000_000)
    expect(meta.max_output_tokens).toBe(131_072)
    expect(ZAI_MODEL_REASONING['glm-5.2']).toEqual({
      levels: { high: 'high', max: 'max' },
      budget: false,
    })
  })

  it('glm-5.3 is text-only with low/high/max reasoning', () => {
    const meta = ZAI_MODEL_META['glm-5.3']
    expect(meta.context_window).toBe(1_000_000)
    expect(meta.max_output_tokens).toBe(128_000)
    expect(meta.pricing.input.normal).toBe(1.4)
    expect(meta.supports.input).toEqual(['text'])
    expect(ZAI_MODEL_REASONING['glm-5.3']).toEqual({
      levels: { low: 'low', high: 'high', max: 'max' },
      budget: false,
    })
  })

  it('glm-5.3-flash is multimodal with max-only reasoning', () => {
    const meta = ZAI_MODEL_META['glm-5.3-flash']
    expect(meta.context_window).toBe(1_000_000)
    expect(meta.max_output_tokens).toBe(128_000)
    expect(meta.pricing.input.normal).toBe(0.15)
    expect(meta.supports.input).toEqual(['text', 'image', 'video'])
    expect(ZAI_MODEL_REASONING['glm-5.3-flash']).toEqual({
      levels: { max: 'max' },
      budget: false,
    })
  })

  it('only vision models accept image input', () => {
    expect(ZAI_MODEL_INPUT_MODALITIES['glm-5.3']).toEqual(['text'])
    expect(ZAI_MODEL_INPUT_MODALITIES['glm-5.3-flash']).toContain('image')
    expect(ZAI_MODEL_INPUT_MODALITIES['glm-5.2']).toEqual(['text'])
    expect(ZAI_MODEL_INPUT_MODALITIES['glm-4.6v']).toContain('image')
    expect(ZAI_MODEL_INPUT_MODALITIES['glm-5v-turbo']).toContain('video')
  })
})
