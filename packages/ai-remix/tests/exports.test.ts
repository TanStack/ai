import { describe, expect, it } from 'vitest'
import {
  createAudioRecorder,
  createByok,
  createChat,
  createGenerateAudio,
  createGenerateImage,
  createGenerateSpeech,
  createGenerateVideo,
  createGeneration,
  createMcpAppBridge,
  createRealtimeChat,
  createSummarize,
  createTranscription,
  createWebMCPTools,
} from '../src/index'

describe('package exports', () => {
  it('exports every create helper as a function', () => {
    expect(createChat).toBeTypeOf('function')
    expect(createByok).toBeTypeOf('function')
    expect(createRealtimeChat).toBeTypeOf('function')
    expect(createMcpAppBridge).toBeTypeOf('function')
    expect(createGeneration).toBeTypeOf('function')
    expect(createGenerateImage).toBeTypeOf('function')
    expect(createGenerateAudio).toBeTypeOf('function')
    expect(createGenerateSpeech).toBeTypeOf('function')
    expect(createGenerateVideo).toBeTypeOf('function')
    expect(createTranscription).toBeTypeOf('function')
    expect(createSummarize).toBeTypeOf('function')
    expect(createAudioRecorder).toBeTypeOf('function')
    expect(createWebMCPTools).toBeTypeOf('function')
  })
})
