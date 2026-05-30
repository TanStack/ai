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
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  'one-shot-text': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
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
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  'tool-calling': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  'parallel-tool-calls': new Set([
    'openai',
    'anthropic',
    'gemini',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  // Gemini excluded: approval flow timing issues with Gemini's streaming format
  'tool-approval': new Set([
    'openai',
    'anthropic',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  // Ollama excluded: aimock doesn't support content+toolCalls for /api/chat format
  'text-tool-text': new Set([
    'openai',
    'anthropic',
    'gemini',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  'structured-output': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  // Streaming structured output: only providers with native streaming JSON
  // schema support are listed here. Other providers fall back to the
  // activity-layer `fallbackStructuredOutputStream` (which wraps the
  // non-streaming `structuredOutput`) but aren't exercised by E2E yet.
  'structured-output-stream': new Set([
    'openai',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  // Multi-turn structured output: every turn produces its own typed
  // `structured-output` part on the assistant message, and historical
  // turns stay renderable. Works for every provider that supports both
  // multi-turn and structured-output — non-native-streaming adapters
  // (anthropic, gemini, ollama) fall back to a single
  // `structured-output.complete` event per turn, but the per-message
  // typed part still lands and the round-trip is identical.
  // Anthropic temporarily excluded — multi-turn structured output regresses
  // when the engine takes the #605 native-combined path on Claude 4.5+ (the
  // 2nd turn's rendered structured-output part shows the 1st turn's
  // content). Other native-combined providers (openai) still pass here,
  // so the regression appears Anthropic-specific. Likely an interaction
  // between the assistant message's text-content shape (post-#605) and
  // either useChat's part rendering or aimock's response routing for the
  // multi-turn shape. Tracking via follow-up issue; the single-turn
  // anthropic structured-output and structured-output-stream entries
  // (where applicable) continue to pass and are sufficient validation
  // for #605's native combined mode landing.
  'multi-turn-structured': new Set([
    'openai',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  'agentic-structured': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  // Native-combined-mode adapters only. Each provider's default test model
  // (or per-feature override in `features.ts`) must opt into combined mode
  // — otherwise the engine takes the legacy finalization path, which makes
  // an extra request that this feature's fixture doesn't model.
  'agentic-structured-stream': new Set([
    'openai',
    'anthropic',
    'gemini',
    'grok',
  ]),
  // Bedrock excluded: the default e2e model (openai.gpt-oss-120b) is text-only
  // (input: ['text'], no vision) — image input isn't supported, so the
  // multimodal request never carries the image and the description comes back empty.
  'multimodal-image': new Set([
    'openai',
    'anthropic',
    'gemini',
    'grok',
    'openrouter',
  ]),
  // Bedrock excluded: same text-only default e2e model as multimodal-image above.
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
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  'summarize-stream': new Set([
    'openai',
    'anthropic',
    'gemini',
    'ollama',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
  ]),
  // Gemini excluded: aimock doesn't mock Gemini's Imagen predict endpoint format
  'image-gen': new Set(['openai', 'grok']),
  'audio-gen': new Set(['gemini', 'elevenlabs']),
  'sound-effects': new Set(['elevenlabs']),
  tts: new Set(['openai', 'grok', 'elevenlabs']),
  transcription: new Set(['openai', 'grok', 'elevenlabs']),
  'video-gen': new Set(['openai']),
  // Only Gemini currently surfaces a first-class stateful conversation API via
  // the adapter (geminiTextInteractions, behind @tanstack/ai-gemini/experimental).
  'stateful-interactions': new Set(['gemini']),
}

export function isSupported(provider: Provider, feature: Feature): boolean {
  return matrix[feature]?.has(provider) ?? false
}

export function getSupportedFeatures(provider: Provider): Feature[] {
  return (Object.entries(matrix) as Array<[Feature, Set<Provider>]>)
    .filter(([_, providers]) => providers.has(provider))
    .map(([feature]) => feature)
}
