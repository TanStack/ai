import type { Provider, Feature } from '@/lib/types'

const matrix: Record<Feature, Set<Provider>> = {
  'chat': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'groq', 'grok', 'openrouter']),
  'one-shot-text': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'groq', 'grok', 'openrouter']),
  'reasoning': new Set(['openai', 'anthropic', 'gemini', 'grok', 'openrouter']),
  'multi-turn': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'groq', 'grok', 'openrouter']),
  'tool-calling': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'groq', 'grok', 'openrouter']),
  'parallel-tool-calls': new Set(['openai', 'anthropic', 'gemini', 'groq', 'grok', 'openrouter']),
  'tool-approval': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'groq', 'grok', 'openrouter']),
  'structured-output': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'groq', 'grok', 'openrouter']),
  'agentic-structured': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'groq', 'grok', 'openrouter']),
  'multimodal-image': new Set(['openai', 'anthropic', 'gemini', 'grok', 'openrouter']),
  'multimodal-structured': new Set(['openai', 'anthropic', 'gemini', 'grok', 'openrouter']),
  'summarize': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'grok', 'openrouter']),
  'summarize-stream': new Set(['openai', 'anthropic', 'gemini', 'ollama', 'grok', 'openrouter']),
  'image-gen': new Set(['openai', 'gemini', 'grok']),
  'tts': new Set(['openai', 'gemini']),
  'transcription': new Set(['openai']),
}

export function isSupported(provider: Provider, feature: Feature): boolean {
  return matrix[feature]?.has(provider) ?? false
}

export function getSupportedFeatures(provider: Provider): Feature[] {
  return (Object.entries(matrix) as Array<[Feature, Set<Provider>]>)
    .filter(([_, providers]) => providers.has(provider))
    .map(([feature]) => feature)
}
