import type { Provider, Feature } from '@/lib/types'

const matrix: Record<Feature, Set<Provider>> = {
  chat: new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  'one-shot-text': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  // aimock reasoning maps to OpenAI reasoning_content and Anthropic thinking blocks only
  reasoning: new Set(['openai', 'anthropic']),
  'multi-turn': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  'tool-calling': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  'parallel-tool-calls': new Set([
    'openai',
    'anthropic',
    'gemini',
    'groq',
    'grok',
    'openrouter',
  ]),
  // Gemini excluded: approval flow has timing issues with Gemini's streaming format
  'tool-approval': new Set([
    'openai',
    'anthropic',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  'structured-output': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  'agentic-structured': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
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
  ]),
  'summarize-stream': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'grok',
    'openrouter',
  ]),
  // Routed through chat — all providers with chat support work
  'image-gen': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  tts: new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  transcription: new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
}

export function isSupported(provider: Provider, feature: Feature): boolean {
  return matrix[feature]?.has(provider) ?? false
}

export function getSupportedFeatures(provider: Provider): Feature[] {
  return (Object.entries(matrix) as Array<[Feature, Set<Provider>]>)
    .filter(([_, providers]) => providers.has(provider))
    .map(([feature]) => feature)
}
