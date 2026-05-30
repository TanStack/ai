import { describe, expect, it } from 'vitest'
import type OpenAI from 'openai'
import { buildImagesUsage } from '../src/usage'

describe('buildImagesUsage', () => {
  it('returns undefined when the model reports no usage', () => {
    expect(buildImagesUsage(undefined)).toBeUndefined()
    expect(buildImagesUsage(null)).toBeUndefined()
  })

  it('maps token counts and the per-modality input breakdown', () => {
    const usage = {
      input_tokens: 40,
      input_tokens_details: { image_tokens: 30, text_tokens: 10 },
      output_tokens: 100,
      total_tokens: 140,
    } satisfies OpenAI.Images.ImagesResponse['usage']

    expect(buildImagesUsage(usage)).toEqual({
      promptTokens: 40,
      completionTokens: 100,
      totalTokens: 140,
      promptTokensDetails: { textTokens: 10, imageTokens: 30 },
    })
  })

  it('omits zero-valued modality details', () => {
    const usage = {
      input_tokens: 10,
      input_tokens_details: { image_tokens: 0, text_tokens: 10 },
      output_tokens: 0,
      total_tokens: 10,
    } satisfies OpenAI.Images.ImagesResponse['usage']

    expect(buildImagesUsage(usage)).toEqual({
      promptTokens: 10,
      completionTokens: 0,
      totalTokens: 10,
      promptTokensDetails: { textTokens: 10 },
    })
  })

  it('omits promptTokensDetails entirely when no breakdown is present', () => {
    const usage = {
      input_tokens: 10,
      input_tokens_details: { image_tokens: 0, text_tokens: 0 },
      output_tokens: 5,
      total_tokens: 15,
    } satisfies OpenAI.Images.ImagesResponse['usage']

    const result = buildImagesUsage(usage)
    expect(result).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    })
    expect(result?.promptTokensDetails).toBeUndefined()
  })
})
