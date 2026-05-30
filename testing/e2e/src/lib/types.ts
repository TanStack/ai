export type Mode = 'sse' | 'http-stream' | 'fetcher'

export type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'groq'
  | 'bedrock'
  | 'bedrock-responses'
  | 'openrouter'
  | 'openrouter-responses'
  | 'elevenlabs'

export type Feature =
  | 'chat'
  | 'one-shot-text'
  | 'reasoning'
  | 'multi-turn'
  | 'tool-calling'
  | 'parallel-tool-calls'
  | 'tool-approval'
  | 'text-tool-text'
  | 'structured-output'
  | 'structured-output-stream'
  | 'multi-turn-structured'
  | 'agentic-structured'
  | 'agentic-structured-stream'
  | 'multimodal-image'
  | 'multimodal-structured'
  | 'summarize'
  | 'summarize-stream'
  | 'image-gen'
  | 'audio-gen'
  | 'sound-effects'
  | 'tts'
  | 'transcription'
  | 'video-gen'
  | 'stateful-interactions'

export const ALL_PROVIDERS: Provider[] = [
  'openai',
  'anthropic',
  'gemini',
  'ollama',
  'grok',
  'groq',
  'bedrock',
  'bedrock-responses',
  'openrouter',
  'openrouter-responses',
  'elevenlabs',
]

export const ALL_FEATURES: Feature[] = [
  'chat',
  'one-shot-text',
  'reasoning',
  'multi-turn',
  'tool-calling',
  'parallel-tool-calls',
  'tool-approval',
  'text-tool-text',
  'structured-output',
  'structured-output-stream',
  'multi-turn-structured',
  'agentic-structured',
  'agentic-structured-stream',
  'multimodal-image',
  'multimodal-structured',
  'summarize',
  'summarize-stream',
  'image-gen',
  'audio-gen',
  'sound-effects',
  'tts',
  'transcription',
  'video-gen',
  'stateful-interactions',
]
