import { describe, it, expect } from 'vitest'
import { defineModelMeta } from '../src/model-meta/define'
import type { ModelMeta, Modality } from '../src/model-meta/types'

describe('defineModelMeta', () => {
  it('should return the meta object unchanged for valid input', () => {
    const meta = defineModelMeta({
      name: 'gpt-4o',
      supports: {
        input: ['text', 'image'] as Array<Modality>,
        output: ['text'] as Array<Modality>,
      },
    })
    expect(meta.name).toBe('gpt-4o')
    expect(meta.supports.input).toEqual(['text', 'image'])
  })

  it('should accept optional fields', () => {
    const meta = defineModelMeta({
      name: 'gpt-4o',
      supports: {
        input: ['text'] as Array<Modality>,
        output: ['text'] as Array<Modality>,
        features: ['streaming', 'function_calling'],
      },
      context_window: 128000,
      max_output_tokens: 16384,
      knowledge_cutoff: '2024-10',
      pricing: {
        input: { normal: 2.5, cached: 1.25 },
        output: { normal: 10.0 },
      },
    })
    expect(meta.context_window).toBe(128000)
    expect(meta.pricing?.input.cached).toBe(1.25)
  })

  it('should throw for negative pricing', () => {
    expect(() =>
      defineModelMeta({
        name: 'test',
        supports: {
          input: ['text'] as Array<Modality>,
          output: ['text'] as Array<Modality>,
        },
        pricing: {
          input: { normal: -1 },
          output: { normal: 1 },
        },
      })
    ).toThrow('pricing')
  })

  it('should throw for zero context window', () => {
    expect(() =>
      defineModelMeta({
        name: 'test',
        supports: {
          input: ['text'] as Array<Modality>,
          output: ['text'] as Array<Modality>,
        },
        context_window: 0,
      })
    ).toThrow('context_window')
  })

  it('should throw for empty input modalities', () => {
    expect(() =>
      defineModelMeta({
        name: 'test',
        supports: {
          input: [] as Array<Modality>,
          output: ['text'] as Array<Modality>,
        },
      })
    ).toThrow('input')
  })
})
