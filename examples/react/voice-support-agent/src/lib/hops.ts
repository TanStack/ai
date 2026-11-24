/**
 * The three hops of a call and the providers offered for each. Labels only,
 * safe to import in the browser. `src/server/providers.ts` builds the real
 * adapters for these names.
 */
export const HOPS = {
  listen: {
    openai: 'OpenAI gpt-transcribe',
    gemini: 'Gemini transcribe live',
    grok: 'Grok voice transcribe',
    elevenlabs: 'ElevenLabs Scribe v2',
  },
  think: {
    openai: 'OpenAI gpt-6.1-terra',
    gemini: 'Gemini 3.8 Flash',
    grok: 'Grok 4.7',
  },
  speak: {
    openai: 'OpenAI gpt-4o-mini-tts',
    gemini: 'Gemini 3.8 Flash TTS',
    grok: 'Grok TTS',
    elevenlabs: 'ElevenLabs v4 Turbo',
  },
} as const

export type Hop = keyof typeof HOPS
export type Choice = { [K in Hop]: keyof (typeof HOPS)[K] }

export const DEFAULT_CHOICE: Choice = {
  listen: 'elevenlabs',
  think: 'openai',
  speak: 'elevenlabs',
}
