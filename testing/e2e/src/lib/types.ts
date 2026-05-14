export type Mode = 'sse' | 'http-stream' | 'fetcher' | 'json'

export type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'groq'
  | 'openrouter'
  | 'openrouter-responses'
  | 'elevenlabs'

export type Feature =
  | 'chat'
  | 'one-shot-text'
  | 'reasoning'
  | 'multi-turn-reasoning'
  | 'multi-turn'
  | 'tool-calling'
  | 'parallel-tool-calls'
  | 'tool-approval'
  | 'text-tool-text'
  | 'structured-output'
  | 'agentic-structured'
  | 'multimodal-image'
  | 'multimodal-structured'
  | 'summarize'
  | 'summarize-stream'
  | 'image-gen'
  | 'tts'
  | 'transcription'
  | 'video-gen'
  | 'audio-gen'
  | 'sound-effects'

export const ALL_PROVIDERS: Provider[] = [
  'openai',
  'anthropic',
  'gemini',
  'ollama',
  'grok',
  'groq',
  'openrouter',
  'openrouter-responses',
  'elevenlabs',
]

export const ALL_FEATURES: Feature[] = [
  'chat',
  'one-shot-text',
  'reasoning',
  'multi-turn-reasoning',
  'multi-turn',
  'tool-calling',
  'parallel-tool-calls',
  'tool-approval',
  'text-tool-text',
  'structured-output',
  'agentic-structured',
  'multimodal-image',
  'multimodal-structured',
  'summarize',
  'summarize-stream',
  'image-gen',
  'tts',
  'transcription',
  'video-gen',
  'audio-gen',
  'sound-effects',
]
