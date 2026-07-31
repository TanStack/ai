import { describe, expect, it } from 'vitest'
import {
  BYTEPLUS_CHAT_MODELS,
  BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES,
  BYTEPLUS_IMAGE_MODELS,
  BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS,
  BYTEPLUS_THINKING_SUMMARY_MODELS,
  BYTEPLUS_VIDEO_DURATIONS,
  BYTEPLUS_VIDEO_MODELS,
  emitsEncryptedContent,
  getBytePlusVideoDurationOptions,
  supportsStructuredOutput,
} from '../src/index'

describe('model lists', () => {
  it('has no duplicate ids across a kind', () => {
    for (const models of [
      BYTEPLUS_CHAT_MODELS,
      BYTEPLUS_VIDEO_MODELS,
      BYTEPLUS_IMAGE_MODELS,
    ]) {
      expect(new Set(models).size).toBe(models.length)
    }
  })

  it('only ships dated model ids', () => {
    for (const model of [
      ...BYTEPLUS_CHAT_MODELS,
      ...BYTEPLUS_VIDEO_MODELS,
      ...BYTEPLUS_IMAGE_MODELS,
    ]) {
      expect(model).toMatch(/-\d{6}$/)
    }
  })

  it('keeps the prefixes the API requires', () => {
    // Seedance 2.0 only resolves with the `dreamina-` prefix, and the 2.1
    // turbo chat model / 5.0 Pro image model echo back the `dola-` prefix.
    for (const model of BYTEPLUS_VIDEO_MODELS) {
      if (model.includes('seedance-2-0')) {
        expect(model.startsWith('dreamina-')).toBe(true)
      }
    }
    expect(BYTEPLUS_CHAT_MODELS).toContain('dola-seed-2-1-turbo-260628')
    expect(BYTEPLUS_IMAGE_MODELS).toContain('dola-seedream-5-0-pro-260628')
  })
})

describe('chat capability sets', () => {
  it('draws thinking-summary models from the chat list', () => {
    for (const model of BYTEPLUS_THINKING_SUMMARY_MODELS) {
      expect(BYTEPLUS_CHAT_MODELS).toContain(model)
      expect(emitsEncryptedContent(model)).toBe(true)
    }
  })

  it('draws structured-output models from the chat list', () => {
    for (const model of BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS) {
      expect(BYTEPLUS_CHAT_MODELS).toContain(model)
      expect(supportsStructuredOutput(model)).toBe(true)
    }
  })

  // The live probe contradicts the BytePlus capability tables for five models,
  // so both directions are pinned here.
  it('excludes the models that reject a JSON schema', () => {
    for (const model of [
      'seed-2-0-lite-260428',
      'seed-2-0-mini-260428',
      'seed-2-0-code-preview-260328',
      'deepseek-v4-pro-260425',
      'deepseek-v4-flash-260425',
      'deepseek-v3-2-251201',
      'gpt-oss-120b-250805',
    ]) {
      expect(supportsStructuredOutput(model)).toBe(false)
    }
  })

  it('includes the models the docs wrongly mark as unsupported', () => {
    for (const model of [
      'seed-2-0-pro-260328',
      'glm-5-2-260617',
      'glm-4-7-251222',
    ]) {
      expect(supportsStructuredOutput(model)).toBe(true)
    }
  })

  it('reports unknown models as unsupported rather than throwing', () => {
    expect(supportsStructuredOutput('not-a-model')).toBe(false)
    expect(emitsEncryptedContent('not-a-model')).toBe(false)
  })
})

describe('video durations', () => {
  it('covers every video model', () => {
    for (const model of BYTEPLUS_VIDEO_MODELS) {
      expect(BYTEPLUS_VIDEO_DURATIONS[model].kind).toBe('range')
    }
  })

  it('encodes the per-family ranges', () => {
    expect(
      getBytePlusVideoDurationOptions('dreamina-seedance-2-0-260128'),
    ).toMatchObject({ min: 4, max: 15 })
    expect(
      getBytePlusVideoDurationOptions('seedance-1-5-pro-251215'),
    ).toMatchObject({ min: 4, max: 12 })
    expect(
      getBytePlusVideoDurationOptions('seedance-1-0-pro-250528'),
    ).toMatchObject({ min: 2, max: 12 })
  })
})

describe('image reference limits', () => {
  it('caps Seedream 5.0 Pro lower than the rest', () => {
    expect(
      BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES['dola-seedream-5-0-pro-260628'],
    ).toBe(10)
    for (const model of BYTEPLUS_IMAGE_MODELS) {
      expect(BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES[model]).toBeGreaterThan(0)
    }
  })
})
