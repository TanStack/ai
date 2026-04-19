import type { Provider, Feature } from '../src/lib/types'

export const providers: Provider[] = [
  'openai',
  'anthropic',
  'gemini',
  'ollama',
  'groq',
  'grok',
  'openrouter',
  'mistral',
]

const supportMatrix: Record<Feature, Set<Provider>> = {
  chat: new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'one-shot-text': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  reasoning: new Set(['openai', 'anthropic', 'gemini']),
  'multi-turn': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'tool-calling': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'parallel-tool-calls': new Set([
    'openai',
    'anthropic',
    'gemini',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'tool-approval': new Set([
    'openai',
    'anthropic',
    'ollama',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'text-tool-text': new Set([
    'openai',
    'anthropic',
    'gemini',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'structured-output': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'agentic-structured': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
    'mistral',
  ]),
  // Mistral excluded: mistral-large-latest is text-only; vision requires pixtral
  'multimodal-image': new Set([
    'openai',
    'anthropic',
    'gemini',
    'grok',
    'openrouter',
  ]),
  'multimodal-structured': new Set([
    'openai',
    'anthropic',
    'gemini',
    'grok',
    'openrouter',
  ]),
  summarize: new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'summarize-stream': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'grok',
    'openrouter',
    'mistral',
  ]),
  'image-gen': new Set(['openai', 'grok']),
  tts: new Set(['openai']),
  transcription: new Set(['openai']),
  'video-gen': new Set(['openai']),
}

export function isSupported(provider: Provider, feature: Feature): boolean {
  return supportMatrix[feature]?.has(provider) ?? false
}

/** Get only the providers that support a given feature */
export function providersFor(feature: Feature): Provider[] {
  return providers.filter((p) => isSupported(p, feature))
}
