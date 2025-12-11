export type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export interface ModelOption {
  provider: Provider
  model: string
  label: string
}

export const MODEL_OPTIONS: Array<ModelOption> = [
  // OpenAI
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI - GPT-4o' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI - GPT-4o Mini' },
  { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },

  // Anthropic
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    label: 'Anthropic - Claude Sonnet 4.5',
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-5-20251101',
    label: 'Anthropic - Claude Opus 4.5',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-0-20250514',
    label: 'Anthropic - Claude Haiku 4.0',
  },

  // Gemini
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash-exp',
    label: 'Gemini - 2.0 Flash',
  },
  {
    provider: 'gemini',
    model: 'gemini-exp-1206',
    label: 'Gemini - Exp 1206 (Pro)',
  },

  // Ollama
  {
    provider: 'ollama',
    model: 'mistral:7b',
    label: 'Ollama - Mistral 7B',
  },
  {
    provider: 'ollama',
    model: 'mistral',
    label: 'Ollama - Mistral',
  },
  {
    provider: 'ollama',
    model: 'gpt-oss:20b',
    label: 'Ollama - GPT-OSS 20B',
  },
  {
    provider: 'ollama',
    model: 'granite4:3b',
    label: 'Ollama - Granite4 3B',
  },
  {
    provider: 'ollama',
    model: 'smollm',
    label: 'Ollama - SmolLM',
  },
]

const STORAGE_KEY = 'tanstack-ai-model-preference'

export function getStoredModelPreference(): ModelOption | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null

    const parsed = JSON.parse(stored) as { provider: Provider; model: string }
    const option = MODEL_OPTIONS.find(
      (opt) => opt.provider === parsed.provider && opt.model === parsed.model,
    )

    return option || null
  } catch {
    return null
  }
}

export function setStoredModelPreference(option: ModelOption): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider: option.provider, model: option.model }),
    )
  } catch {
    // Ignore storage errors
  }
}

export function getDefaultModelOption(): ModelOption {
  const stored = getStoredModelPreference()
  return stored || MODEL_OPTIONS[0]
}
