export type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'openrouter'

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

  // Grok
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

  // OpenRouter
  {
    provider: 'openrouter',
    model: 'openai/gpt-4o',
    label: 'OpenRouter - GPT-4o',
  },
  {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    label: 'OpenRouter - Claude Sonnet 4',
  },
  {
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-001',
    label: 'OpenRouter - Gemini 2.0 Flash',
  },
  {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-70b-instruct',
    label: 'OpenRouter - Llama 3.3 70B',
  },
]

export function getDefaultModelOption(): ModelOption {
  return MODEL_OPTIONS[0]
}
