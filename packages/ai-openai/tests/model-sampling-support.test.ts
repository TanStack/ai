import { describe, expect, it } from 'vitest'
import { openAIModelRejectsSamplingParams } from '../src/model-meta'

describe('openAIModelRejectsSamplingParams', () => {
  it('flags o-series and GPT-5 reasoning models', () => {
    for (const model of [
      'o1',
      'o1-pro',
      'o3',
      'o3-mini',
      'o4-mini',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-pro',
      'gpt-5.1',
      'gpt-5.2',
      'gpt-5.2-pro',
      'gpt-5.5',
      'gpt-5.5-pro',
      'gpt-5.6',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.1-codex-mini',
      'codex-mini-latest',
    ]) {
      expect(openAIModelRejectsSamplingParams(model), model).toBe(true)
    }
  })

  it('leaves chat-latest and pre-5 chat models alone', () => {
    for (const model of [
      'gpt-5-chat-latest',
      'gpt-5.1-chat-latest',
      'gpt-5.2-chat-latest',
      'gpt-chat-latest',
      'chatgpt-4o-latest',
      'gpt-4.1',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-3.5-turbo',
    ]) {
      expect(openAIModelRejectsSamplingParams(model), model).toBe(false)
    }
  })
})
