import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
  getVideoJobStatus,
  summarize,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  openaiImage,
  openaiSpeech,
  openaiTranscription,
  openaiSummarize,
  openaiVideo,
} from '@tanstack/ai-openai'

// =============================================================================
// Direct server functions (non-streaming, return the result directly)
// =============================================================================

export const generateImageFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      prompt: z.string(),
      numberOfImages: z.number().optional(),
      size: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    return generateImage({
      adapter: openaiImage('gpt-image-1'),
      prompt: data.prompt,
      numberOfImages: data.numberOfImages,
      size: data.size as any,
    })
  })

export const generateSpeechFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      voice: z.string().optional(),
      format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
    }),
  )
  .handler(async ({ data }) => {
    return generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: data.text,
      voice: data.voice,
      format: data.format,
    })
  })

export const transcribeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      audio: z.string(),
      language: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    return generateTranscription({
      adapter: openaiTranscription('whisper-1'),
      audio: data.audio,
      language: data.language,
    })
  })

export const summarizeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      maxLength: z.number().optional(),
      style: z.enum(['bullet-points', 'paragraph', 'concise']).optional(),
    }),
  )
  .handler(async ({ data }) => {
    return summarize({
      adapter: openaiSummarize('gpt-4o-mini'),
      text: data.text,
      maxLength: data.maxLength,
      style: data.style,
    })
  })

export const generateVideoFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      prompt: z.string(),
      size: z.string().optional(),
      duration: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const adapter = openaiVideo('sora-2')

    // Create the job
    const { jobId } = await generateVideo({
      adapter,
      prompt: data.prompt,
      size: data.size as any,
      duration: data.duration,
    })

    // Poll until complete (max 10 minutes)
    const MAX_POLLS = 120
    let polls = 0
    let status = await getVideoJobStatus({ adapter, jobId })
    while (status.status !== 'completed' && status.status !== 'failed') {
      if (++polls > MAX_POLLS) {
        throw new Error('Video generation timed out')
      }
      await new Promise((r) => setTimeout(r, 5000))
      status = await getVideoJobStatus({ adapter, jobId })
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Video generation failed')
    }

    if (!status.url) {
      throw new Error('Video generation completed but no URL was provided')
    }

    return {
      jobId,
      status: 'completed' as const,
      url: status.url,
    }
  })

// =============================================================================
// Streaming server functions (return SSE Response for client-side parsing)
// Used with: fetchServerSentEvents((input) => streamFn({ data: input }))
// =============================================================================

export const generateImageStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      prompt: z.string(),
      numberOfImages: z.number().optional(),
      size: z.string().optional(),
    }),
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateImage({
        adapter: openaiImage('gpt-image-1'),
        prompt: data.prompt,
        numberOfImages: data.numberOfImages,
        size: data.size as any,
        stream: true,
      }),
    )
  })

export const generateSpeechStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      voice: z.string().optional(),
      format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
    }),
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateSpeech({
        adapter: openaiSpeech('tts-1'),
        text: data.text,
        voice: data.voice,
        format: data.format,
        stream: true,
      }),
    )
  })

export const transcribeStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      audio: z.string(),
      language: z.string().optional(),
    }),
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateTranscription({
        adapter: openaiTranscription('whisper-1'),
        audio: data.audio,
        language: data.language,
        stream: true,
      }),
    )
  })

export const summarizeStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      maxLength: z.number().optional(),
      style: z.enum(['bullet-points', 'paragraph', 'concise']).optional(),
    }),
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      summarize({
        adapter: openaiSummarize('gpt-4o-mini'),
        text: data.text,
        maxLength: data.maxLength,
        style: data.style,
        stream: true,
      }),
    )
  })

export const generateVideoStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      prompt: z.string(),
      size: z.string().optional(),
      duration: z.number().optional(),
    }),
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateVideo({
        adapter: openaiVideo('sora-2'),
        prompt: data.prompt,
        size: data.size as any,
        duration: data.duration,
        stream: true,
      }),
    )
  })
