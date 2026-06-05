import { describe, expect, it } from 'vitest'

import { openaiChatEndpointSchemaMap } from '../src/providers/openai/chat/endpoint-schema-map.js'
import { openaiChatEndpointZodMap } from '../src/providers/openai/chat/endpoint-zod-map.js'
import { openaiAudioEndpointSchemaMap } from '../src/providers/openai/audio/endpoint-schema-map.js'
import { openaiImageEndpointSchemaMap } from '../src/providers/openai/image/endpoint-schema-map.js'
import { anthropicChatEndpointZodMap } from '../src/providers/anthropic/chat/endpoint-zod-map.js'
import { elevenlabsAudioEndpointZodMap } from '../src/providers/elevenlabs/audio/endpoint-zod-map.js'
import { geminiVideoEndpointSchemaMap } from '../src/providers/gemini/video/endpoint-schema-map.js'

describe('activity grouping', () => {
  it('groups OpenAI endpoints by activity', () => {
    expect(openaiChatEndpointSchemaMap).toHaveProperty(['chat/completions'])
    expect(openaiChatEndpointSchemaMap).toHaveProperty(['responses'])
    expect(openaiAudioEndpointSchemaMap).toHaveProperty(['audio/speech'])
    expect(openaiAudioEndpointSchemaMap).toHaveProperty([
      'audio/transcriptions',
    ])
    expect(openaiImageEndpointSchemaMap).toHaveProperty(['images/generations'])
    // Activity groups don't bleed into each other.
    expect(openaiChatEndpointSchemaMap).not.toHaveProperty(['audio/speech'])
    expect(openaiAudioEndpointSchemaMap).not.toHaveProperty([
      'chat/completions',
    ])
  })

  it('drops platform/admin endpoints from generation', () => {
    for (const map of [
      openaiChatEndpointSchemaMap,
      openaiAudioEndpointSchemaMap,
      openaiImageEndpointSchemaMap,
    ]) {
      for (const endpointId of Object.keys(map)) {
        expect(endpointId).not.toMatch(
          /^(organization|fine_tuning|vector_stores|assistants|threads|batches|files|uploads|evals|skills)/,
        )
      }
    }
  })

  it('collapses the audio family into one audio group', () => {
    // TTS, transcription, music, and sound effects all live in `audio`.
    expect(elevenlabsAudioEndpointZodMap).toHaveProperty([
      'v1/text-to-speech/{voice_id}',
    ])
    expect(elevenlabsAudioEndpointZodMap).toHaveProperty(['v1/speech-to-text'])
    expect(elevenlabsAudioEndpointZodMap).toHaveProperty([
      'v1/sound-generation',
    ])
  })

  it('maps binary-response media endpoints with input only', () => {
    const tts = elevenlabsAudioEndpointZodMap['v1/text-to-speech/{voice_id}']
    expect(tts.input).toBeDefined()
    expect(tts).not.toHaveProperty('output')
    expect(tts.input.safeParse({ text: 'hello' }).success).toBe(true)
  })

  it('validates a real chat request through the discriminated message union', () => {
    const input = openaiChatEndpointZodMap['chat/completions'].input
    expect(
      input.safeParse({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      }).success,
    ).toBe(true)
    expect(
      input.safeParse({ messages: [{ role: 'user', content: 'hi' }] }).success,
    ).toBe(false)

    const anthropicInput = anthropicChatEndpointZodMap['v1/messages'].input
    expect(
      anthropicInput.safeParse({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'hi' }],
      }).success,
    ).toBe(true)
  })

  it('bundles $defs closures self-contained (including dedup-renamed schemas)', () => {
    const chatInput = openaiChatEndpointSchemaMap['chat/completions']
      .input as unknown as {
      $defs?: Record<string, unknown>
    }
    expect(chatInput.$defs).toBeDefined()
    const defs = chatInput.$defs!
    // Every $ref inside the bundled schema resolves within its own $defs.
    const refs = new Set<string>()
    const collect = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return
      if (Array.isArray(node)) return node.forEach(collect)
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
          refs.add(value)
        } else {
          collect(value)
        }
      }
    }
    collect(chatInput)
    for (const ref of refs) {
      expect(ref).toMatch(/^#\/\$defs\//)
      expect(defs).toHaveProperty([ref.slice('#/$defs/'.length)])
    }
  })

  it('classifies Veo-style long-running prediction as video', () => {
    expect(geminiVideoEndpointSchemaMap).toHaveProperty([
      'v1beta/models/{modelsId}:predictLongRunning',
    ])
  })
})
