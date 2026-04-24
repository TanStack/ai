import {
  createOpenaiImage,
  createOpenaiSpeech,
  createOpenaiTranscription,
  createOpenaiVideo,
} from '@tanstack/ai-openai'
import { createGeminiImage } from '@tanstack/ai-gemini'
import {
  createGrokImage,
  createGrokSpeech,
  createGrokTranscription,
} from '@tanstack/ai-grok'
import type { Provider } from '@/lib/types'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function llmockBase(aimockPort?: number): string {
  if (aimockPort) return `http://127.0.0.1:${aimockPort}`
  return LLMOCK_DEFAULT_BASE
}

function openaiUrl(aimockPort?: number): string {
  return `${llmockBase(aimockPort)}/v1`
}

function testHeaders(testId?: string): Record<string, string> | undefined {
  return testId ? { 'X-Test-Id': testId } : undefined
}

export function createImageAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiImage('gpt-image-1', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    gemini: () =>
      createGeminiImage('gemini-2.0-flash', DUMMY_KEY, {
        httpOptions: { baseUrl: llmockBase(aimockPort), headers },
      }),
    grok: () =>
      createGrokImage('grok-2-image-1212', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory) throw new Error(`No image adapter for provider: ${provider}`)
  return factory()
}

export function createTTSAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiSpeech('tts-1', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    grok: () =>
      createGrokSpeech('grok-tts', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory) throw new Error(`No TTS adapter for provider: ${provider}`)
  return factory()
}

export function createTranscriptionAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiTranscription('whisper-1', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    grok: () =>
      createGrokTranscription('grok-stt', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory)
    throw new Error(`No transcription adapter for provider: ${provider}`)
  return factory()
}

export function createVideoAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiVideo('sora-2', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory) throw new Error(`No video adapter for provider: ${provider}`)
  return factory()
}
