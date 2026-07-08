import type { Feature, Provider } from '@/lib/types'
import { getGuitars, compareGuitars, addToCart } from '@/lib/tools'

interface FeatureConfig {
  tools: Array<any>
  modelOptions: Record<string, any>
  modelOverrides?: Partial<Record<Provider, string>>
  dedicatedRoute?: string
  /**
   * Optional system prompt override. Defaults (in `api.chat.ts`) to the
   * guitar-store assistant prompt that covers most features; only set this
   * when the feature genuinely needs a different persona (e.g. the
   * `multi-turn-structured` chef recipe-builder).
   */
  systemPrompt?: string
}

export const featureConfigs: Record<Feature, FeatureConfig> = {
  chat: {
    tools: [],
    modelOptions: {},
  },
  'one-shot-text': {
    tools: [],
    modelOptions: {},
  },
  reasoning: {
    tools: [],
    modelOptions: { reasoning: { effort: 'high' } },
    modelOverrides: {
      openai: 'o3',
      anthropic: 'claude-sonnet-4-5',
      mistral: 'magistral-medium-latest',
    },
  },
  'multi-turn': {
    tools: [],
    modelOptions: {},
  },
  'tool-calling': {
    tools: [getGuitars],
    modelOptions: {},
  },
  'parallel-tool-calls': {
    tools: [getGuitars, compareGuitars],
    modelOptions: {},
  },
  'tool-approval': {
    tools: [addToCart],
    modelOptions: {},
  },
  'text-tool-text': {
    tools: [getGuitars],
    modelOptions: {},
  },
  'structured-output': {
    tools: [],
    modelOptions: {},
  },
  'structured-output-stream': {
    tools: [],
    modelOptions: {},
  },
  'multi-turn-structured': {
    tools: [],
    modelOptions: {},
    systemPrompt:
      'You are a chef assistant that always responds with a single recipe matching the provided JSON schema. When the user asks for modifications, produce a new recipe in the same shape that reflects the change. Stay terse — short titles, short steps.',
  },
  'agentic-structured': {
    tools: [getGuitars],
    modelOptions: {},
  },
  // Pins #605 native-combined-mode: `outputSchema` + `tools` + `stream: true`
  // in a single chat call. Default openai (gpt-4o) and anthropic
  // (claude-sonnet-4-5) are already in their combined-mode-capable sets;
  // gemini and grok need overrides to gated models so the engine takes the
  // native path instead of the legacy `runStructuredFinalization` round-trip.
  'agentic-structured-stream': {
    tools: [getGuitars],
    modelOptions: {},
    modelOverrides: {
      gemini: 'gemini-3-flash-preview',
      grok: 'grok-build-0.1',
    },
  },
  'multimodal-image': {
    tools: [],
    modelOptions: {},
  },
  'multimodal-structured': {
    tools: [],
    modelOptions: {},
  },
  summarize: {
    tools: [],
    modelOptions: {},
  },
  'summarize-stream': {
    tools: [],
    modelOptions: {},
  },
  'image-gen': {
    tools: [],
    modelOptions: {},
  },
  'image-to-image': {
    tools: [],
    modelOptions: {},
  },
  'audio-gen': {
    tools: [],
    modelOptions: {},
  },
  'sound-effects': {
    tools: [],
    modelOptions: {},
  },
  tts: {
    tools: [],
    modelOptions: {},
  },
  transcription: {
    tools: [],
    modelOptions: {},
  },
  'transcription-diarization': {
    tools: [],
    modelOptions: {},
  },
  'video-gen': {
    tools: [],
    modelOptions: {},
  },
  'image-to-video': {
    tools: [],
    modelOptions: {},
  },
  'stateful-interactions': {
    tools: [],
    modelOptions: {},
  },
}
