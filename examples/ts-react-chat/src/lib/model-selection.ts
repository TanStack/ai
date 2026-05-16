export type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'gemini-interactions'
  | 'ollama'
  | 'grok'
  | 'groq'
  | 'openrouter'

export interface ModelOption {
  provider: Provider
  model: string
  label: string
}

export const MODEL_OPTIONS: Array<ModelOption> = [
  // OpenAI
  { provider: 'openai', model: 'gpt-5.2', label: 'OpenAI - GPT-5.2' },
  { provider: 'openai', model: 'gpt-5.2-pro', label: 'OpenAI - GPT-5.2 Pro' },
  { provider: 'openai', model: 'gpt-5.1', label: 'OpenAI - GPT-5.1' },
  { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },
  { provider: 'openai', model: 'gpt-5-mini', label: 'OpenAI - GPT-5 Mini' },
  { provider: 'openai', model: 'gpt-5-nano', label: 'OpenAI - GPT-5 Nano' },
  { provider: 'openai', model: 'gpt-4.1', label: 'OpenAI - GPT-4.1' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI - GPT-4o' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI - GPT-4o Mini' },

  // Anthropic
  {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    label: 'Anthropic - Claude Opus 4.7',
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    label: 'Anthropic - Claude Opus 4.6',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    label: 'Anthropic - Claude Sonnet 4.6',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    label: 'Anthropic - Claude Sonnet 4.5',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Anthropic - Claude Haiku 4.5',
  },

  // Gemini (stateless `geminiText`)
  {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini - 3.1 Pro Preview',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini - 3.1 Flash Lite Preview',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: 'Gemini - 2.5 Pro',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    label: 'Gemini - 2.0 Flash',
  },

  // Gemini Interactions (stateful, experimental — `@tanstack/ai-gemini/experimental`)
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini Interactions - 3.1 Pro Preview (experimental)',
  },
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini Interactions - 3.1 Flash Lite Preview (experimental)',
  },

  // Openrouter — multi-provider via OpenRouter's unified API
  {
    provider: 'openrouter',
    model: 'openai/gpt-5.2',
    label: 'OpenRouter - OpenAI GPT-5.2',
  },
  {
    provider: 'openrouter',
    model: 'openai/gpt-5.1',
    label: 'OpenRouter - OpenAI GPT-5.1',
  },
  {
    provider: 'openrouter',
    model: 'openai/gpt-5',
    label: 'OpenRouter - OpenAI GPT-5',
  },
  {
    provider: 'openrouter',
    model: 'openai/gpt-4o',
    label: 'OpenRouter - OpenAI GPT-4o',
  },
  {
    provider: 'openrouter',
    model: 'anthropic/claude-opus-4.7',
    label: 'OpenRouter - Anthropic Claude Opus 4.7',
  },
  {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4.6',
    label: 'OpenRouter - Anthropic Claude Sonnet 4.6',
  },
  {
    provider: 'openrouter',
    model: 'anthropic/claude-haiku-4.5',
    label: 'OpenRouter - Anthropic Claude Haiku 4.5',
  },
  {
    provider: 'openrouter',
    model: 'google/gemini-2.5-pro',
    label: 'OpenRouter - Google Gemini 2.5 Pro',
  },
  {
    provider: 'openrouter',
    model: 'x-ai/grok-4',
    label: 'OpenRouter - xAI Grok 4',
  },
  {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-70b-instruct',
    label: 'OpenRouter - Meta Llama 3.3 70B (Groq-routed)',
  },

  // Ollama
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
    model: 'mistral',
    label: 'Ollama - Mistral',
  },

  // Groq
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    label: 'Groq - GPT-OSS 120B',
  },
  {
    provider: 'groq',
    model: 'moonshotai/kimi-k2-instruct-0905',
    label: 'Groq - Kimi K2 Instruct',
  },
  {
    provider: 'groq',
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    label: 'Groq - Llama 4 Maverick',
  },
  {
    provider: 'groq',
    model: 'qwen/qwen3-32b',
    label: 'Groq - Qwen3 32B',
  },

  // Grok
  {
    provider: 'grok',
    model: 'grok-4.20',
    label: 'Grok - Grok 4.20',
  },
  {
    provider: 'grok',
    model: 'grok-4-1-fast-reasoning',
    label: 'Grok - Grok 4.1 Fast (Reasoning)',
  },
  {
    provider: 'grok',
    model: 'grok-4-1-fast-non-reasoning',
    label: 'Grok - Grok 4.1 Fast',
  },
  {
    provider: 'grok',
    model: 'grok-code-fast-1',
    label: 'Grok - Grok Code Fast 1',
  },
]

export const DEFAULT_MODEL_OPTION = MODEL_OPTIONS[0]
