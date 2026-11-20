import { describe, expect, it } from 'vitest'
import {
  useChat,
  useRealtimeChat,
  useMcpAppBridge,
  useRegisterWebMCPTools,
  usePageWebMCPTools,
  useGeneration,
  useGenerateImage,
  useGenerate3DModel,
  useGenerateAudio,
  useGenerateSpeech,
  useGenerateVideo,
  useTranscription,
  useSummarize,
  useAudioRecorder,
} from '@tanstack/ai-octane'

describe('package exports', () => {
  it('exports every ported hook as a function', () => {
    for (const hook of [
      useChat,
      useRealtimeChat,
      useMcpAppBridge,
      useRegisterWebMCPTools,
      usePageWebMCPTools,
      useGeneration,
      useGenerateImage,
      useGenerate3DModel,
      useGenerate3DModel,
      useGenerateAudio,
      useGenerateSpeech,
      useGenerateVideo,
      useTranscription,
      useSummarize,
      useAudioRecorder,
    ]) {
      expect(hook).toBeTypeOf('function')
    }
  })
})
