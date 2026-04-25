import type { Provider, Feature } from '@/lib/types'

/**
 * Single source of truth for provider × feature support.
 *
 * This matrix is imported by `tests/test-matrix.ts` (Playwright specs) and
 * by the dev routes under `src/routes/` to decide which provider/feature
 * combinations to render and test. Update this file only — do not fork.
 */
export const matrix: Record<Feature, Set<Provider>> = {
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
  reasoning: new Set(['openai', 'anthropic', 'gemini']),
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
  // Gemini excluded: approval flow timing issues with Gemini's streaming format
  'tool-approval': new Set([
    'openai',
    'anthropic',
    'ollama',
    'groq',
    'grok',
    'openrouter',
  ]),
  // Ollama excluded: aimock doesn't support content+toolCalls for /api/chat format
  'text-tool-text': new Set([
    'openai',
    'anthropic',
    'gemini',
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
  // Gemini excluded: aimock doesn't mock Gemini's Imagen predict endpoint format
  'image-gen': new Set(['openai', 'grok']),
  tts: new Set(['openai', 'grok']),
  transcription: new Set(['openai', 'grok']),
  'video-gen': new Set(['openai']),
}

export function isSupported(provider: Provider, feature: Feature): boolean {
  return matrix[feature]?.has(provider) ?? false
}

export function getSupportedFeatures(provider: Provider): Feature[] {
  return (Object.entries(matrix) as Array<[Feature, Set<Provider>]>)
    .filter(([_, providers]) => providers.has(provider))
    .map(([feature]) => feature)
}
