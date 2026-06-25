import { describe, expect, it } from 'vitest'
import {
  TWELVELABS_CHAT_MODELS,
  TWELVELABS_EMBEDDING_MODELS,
} from '../src/model-meta'

describe('TwelveLabs model metadata', () => {
  it('exposes the Pegasus chat models', () => {
    expect(TWELVELABS_CHAT_MODELS).toContain('pegasus1.5')
    expect(TWELVELABS_CHAT_MODELS).toContain('pegasus1.2')
  })

  it('exposes the Marengo embedding model', () => {
    expect(TWELVELABS_EMBEDDING_MODELS).toContain('marengo3.0')
  })
})
