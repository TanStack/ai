import { defineByokProvider } from '@tanstack/ai/byok'

export const byteplusByok = defineByokProvider({
  id: 'byteplus',
  label: 'BytePlus',
  env: ['ARK_API_KEY', 'BYTEPLUS_API_KEY'],
})

/** Seed Speech TTS/ASR. Different product and key from {@link byteplusByok}. */
export const /** Seed Speech TTS/ASR. Different product and key from {@link byteplusByok}. */
byteplusVoiceByok = defineByokProvider({
  id: 'byteplus-voice',
  label: 'BytePlus Seed Speech',
  env: 'BYTEPLUS_VOICE_API_KEY',
})
