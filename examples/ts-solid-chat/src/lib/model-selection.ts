export type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'groq'
  | 'openrouter'
  | 'zai'

export interface ModelOption {
  provider: Provider
  model: string
  label: string
}

export const MODEL_OPTIONS: Array<ModelOption> = [
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI - GPT-4o' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI - GPT-4o Mini' },
  { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },

  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    label: 'Anthropic - Claude Sonnet 4.6',
  },
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

  {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    label: 'Gemini - 2.0 Flash',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    label: 'Gemini - 2.5 Flash',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: 'Gemini - 2.5 Pro',
  },

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

  { provider: 'zai', model: 'glm-5.1', label: 'Z.AI - GLM-5.1' },
  { provider: 'zai', model: 'glm-5-turbo', label: 'Z.AI - GLM-5 Turbo' },
  { provider: 'zai', model: 'glm-5', label: 'Z.AI - GLM-5' },
  { provider: 'zai', model: 'glm-5v-turbo', label: 'Z.AI - GLM-5V Turbo' },
  { provider: 'zai', model: 'glm-4.7', label: 'Z.AI - GLM-4.7' },
  { provider: 'zai', model: 'glm-4.6v', label: 'Z.AI - GLM-4.6V' },
  { provider: 'zai', model: 'glm-4.6', label: 'Z.AI - GLM-4.6' },

  {
    provider: 'openrouter',
    model: 'openai/chatgpt-4o-latest',
    label: 'Openrouter - ChatGPT 4o Latest',
  },
  {
    provider: 'openrouter',
    model: 'openai/chatgpt-4o-mini',
    label: 'Openrouter - ChatGPT 4o Mini',
  },

  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    label: 'Groq - Llama 3.3 70B',
  },
  {
    provider: 'groq',
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    label: 'Groq - Llama 4 Maverick',
  },
  {
    provider: 'groq',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Groq - Llama 4 Scout',
  },

  {
    provider: 'grok',
    model: 'grok-4',
    label: 'Grok - Grok 4',
  },
  {
    provider: 'grok',
    model: 'grok-4-fast-non-reasoning',
    label: 'Grok - Grok 4 Fast',
  },
  {
    provider: 'grok',
    model: 'grok-3',
    label: 'Grok - Grok 3',
  },
  {
    provider: 'grok',
    model: 'grok-3-mini',
    label: 'Grok - Grok 3 Mini',
  },
]

export const DEFAULT_MODEL_OPTION = MODEL_OPTIONS[0]

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
    return
  }
}

export function getDefaultModelOption(): ModelOption {
  const stored = getStoredModelPreference()
  return stored || MODEL_OPTIONS[0]
}
