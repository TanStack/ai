export type EvalProvider =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'grok'
  | 'groq'

export interface EvalModel {
  /** Human-readable label */
  name: string
  /** Provider-qualified model id: `provider:model` (e.g. `openai:gpt-4o`) */
  model: string
}

export type ModelCategory = 'local' | 'cloud'

/** Split a `provider:model` string. First `:` is the delimiter. */
export function parseModelId(model: string): {
  provider: EvalProvider
  modelId: string
} {
  const idx = model.indexOf(':')
  if (idx === -1) {
    throw new Error(
      `Invalid model format "${model}". Expected "provider:model" (e.g. "openai:gpt-4o").`,
    )
  }
  return {
    provider: model.slice(0, idx) as EvalProvider,
    modelId: model.slice(idx + 1),
  }
}

export function isCloudModel(model: string): boolean {
  const { provider, modelId } = parseModelId(model)
  if (provider !== 'ollama') return true
  return modelId.includes(':cloud')
}

export function getModelCategory(model: string): ModelCategory {
  return isCloudModel(model) ? 'cloud' : 'local'
}

/**
 * Default models to benchmark (see pull-models.sh for Ollama pulls).
 * Cloud baselines require respective API keys.
 *
 * Excluded from default runs (still runnable with `--models <id>` if installed):
 * - ollama:granite4:3b — emits invalid `typescriptCode` (esbuild parse errors), then hallucinates answers.
 * - ollama:ministral-3 — calls tools but generated TS often mishandles API (e.g. `.rows`), repeated failures.
 * - ollama:mistral:7b — answers with markdown "code" only; does not invoke `execute_typescript` reliably.
 * - ollama:qwen3:8b, ollama:rnj-1:8b, ollama:qwen3.5:9b, ollama:qwen2.5-coder:14b, ollama:qwen3:14b,
 *   ollama:qwen3-coder, ollama:devstral-small-2
 *   — hallucinate results or fail to use external_queryTable correctly.
 */
export const EVAL_MODELS: Array<EvalModel> = [
  // --- Ollama (working) ---
  { name: 'GPT-OSS 20B', model: 'ollama:gpt-oss:20b' },
  { name: 'Nemotron Cascade 2', model: 'ollama:nemotron-cascade-2' },
  { name: 'Gemma 4 31B', model: 'ollama:gemma4:31b' },

  // --- Cloud baselines ---
  { name: 'Claude Haiku 4.5', model: 'anthropic:claude-haiku-4-5' },
  { name: 'GPT-4o Mini', model: 'openai:gpt-4o-mini' },

  // --- Gemini ---
  { name: 'Gemini 2.5 Flash', model: 'gemini:gemini-2.5-flash' },

  // --- Grok (xAI) ---
  { name: 'Grok 4.1 Fast', model: 'grok:grok-4-1-fast-non-reasoning' },

  // --- Groq ---
  { name: 'Llama 3.3 70B (Groq)', model: 'groq:llama-3.3-70b-versatile' },
  { name: 'Qwen3 32B (Groq)', model: 'groq:qwen/qwen3-32b' },
]
