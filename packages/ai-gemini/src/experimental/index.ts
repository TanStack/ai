/**
 * @experimental Gemini's Interactions API is in Beta per Google. Shapes and
 * behavior may change between minor releases of `@tanstack/ai-gemini`.
 */
export {
  GeminiTextInteractionsAdapter,
  createGeminiTextInteractions,
  geminiTextInteractions,
  type GeminiTextInteractionsConfig,
  type GeminiTextInteractionsProviderOptions,
  type GeminiInteractionsStream,
} from './text-interactions/adapter'
export type {
  GeminiInteractionsCustomEvent,
  GeminiInteractionsCustomEventName,
  GeminiInteractionsCustomEventValue,
} from './text-interactions/events'
