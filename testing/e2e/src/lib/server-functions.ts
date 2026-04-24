import { createServerFn } from '@tanstack/react-start'
import {
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
  getVideoJobStatus,
} from '@tanstack/ai'
import {
  createImageAdapter,
  createTTSAdapter,
  createTranscriptionAdapter,
  createVideoAdapter,
} from '@/lib/media-providers'
import type { Provider } from '@/lib/types'

export const generateImageFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      prompt: string
      provider: Provider
      numberOfImages?: number
      aimockPort?: number
      testId?: string
    }) => {
      if (!data.prompt.trim()) throw new Error('Prompt is required')
      if (!data.provider) throw new Error('Provider is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
    const adapter = createImageAdapter(
      data.provider,
      data.aimockPort,
      data.testId,
    )
    return generateImage({
      adapter,
      prompt: data.prompt,
      numberOfImages: data.numberOfImages ?? 1,
    })
  })

export const generateSpeechFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      text: string
      voice?: string
      provider: Provider
      aimockPort?: number
      testId?: string
    }) => {
      if (!data.text.trim()) throw new Error('Text is required')
      if (!data.provider) throw new Error('Provider is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
    const adapter = createTTSAdapter(
      data.provider,
      data.aimockPort,
      data.testId,
    )
    return generateSpeech({
      adapter,
      text: data.text,
      voice: data.voice,
    })
  })

export const generateTranscriptionFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      audio: string
      language?: string
      provider: Provider
      aimockPort?: number
      testId?: string
    }) => {
      if (!data.audio) throw new Error('Audio is required')
      if (!data.provider) throw new Error('Provider is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
    const adapter = createTranscriptionAdapter(
      data.provider,
      data.aimockPort,
      data.testId,
    )
    return generateTranscription({
      adapter,
      audio: data.audio,
      language: data.language,
    })
  })

export const generateVideoFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      prompt: string
      provider: Provider
      aimockPort?: number
      testId?: string
    }) => {
      if (!data.prompt.trim()) throw new Error('Prompt is required')
      if (!data.provider) throw new Error('Provider is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
    const adapter = createVideoAdapter(
      data.provider,
      data.aimockPort,
      data.testId,
    )
    // Non-streaming: create job, poll until complete, return result with URL
    const { jobId } = await generateVideo({
      adapter,
      prompt: data.prompt,
    })
    // Poll for completion (aimock returns completed immediately)
    const result = await getVideoJobStatus({ adapter, jobId })
    return {
      jobId,
      status: result.status,
      url: result.url,
    }
  })
