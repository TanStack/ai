/**
 * Known Ollaya `laya` decision models. Other tags are accepted as strings.
 *
 * - `laya:latest` — routes each request to `laya:en` or `laya:multilingual`
 *   by the text's script and language.
 * - `laya:en` — English decision model (ModernBERT-large).
 * - `laya:multilingual` — decision model for 100+ languages (mmBERT-base).
 */
export const OLLAYA_EVALUATE_MODELS = [
  'laya:latest',
  'laya:en',
  'laya:multilingual',
] as const

/** Union of documented Ollaya `laya` model ids, plus any other string tag. */
export type OllayaEvaluateModel =
  | (typeof OLLAYA_EVALUATE_MODELS)[number]
  | (string & {})
