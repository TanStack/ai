export type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'gemini-interactions'
  | 'ollama'
  | 'grok'
  | 'groq'
  | 'openrouter'
  | 'bedrock'
  | 'byteplus'
  | 'cloudflare'

export interface ModelOption {
  provider: Provider
  model: string
  label: string
}

export const MODEL_OPTIONS: Array<ModelOption> = [
  // OpenAI
  { provider: 'openai', model: 'gpt-5.6', label: 'OpenAI - GPT-5.6' },
  { provider: 'openai', model: 'gpt-5.6-sol', label: 'OpenAI - GPT-5.6 Sol' },
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    label: 'OpenAI - GPT-5.6 Terra',
  },
  { provider: 'openai', model: 'gpt-5.6-luna', label: 'OpenAI - GPT-5.6 Luna' },
  { provider: 'openai', model: 'gpt-5.5', label: 'OpenAI - GPT-5.5' },
  { provider: 'openai', model: 'gpt-5.2', label: 'OpenAI - GPT-5.2' },
  { provider: 'openai', model: 'gpt-5.2-pro', label: 'OpenAI - GPT-5.2 Pro' },
  { provider: 'openai', model: 'gpt-5.1', label: 'OpenAI - GPT-5.1' },
  { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },
  { provider: 'openai', model: 'gpt-5-mini', label: 'OpenAI - GPT-5 Mini' },
  { provider: 'openai', model: 'gpt-5-nano', label: 'OpenAI - GPT-5 Nano' },
  { provider: 'openai', model: 'gpt-4.1', label: 'OpenAI - GPT-4.1' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI - GPT-4o' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI - GPT-4o Mini' },

  // Cloudflare Workers AI. `provider/model` ids route through AI Gateway.
  {
    provider: 'cloudflare',
    model: '@cf/zai-org/glm-5.3-flash',
    label: 'Cloudflare - GLM 5.3 Flash',
  },
  {
    provider: 'cloudflare',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Cloudflare - Llama 3.3 70B',
  },
  {
    provider: 'cloudflare',
    model: 'openai/gpt-5.5',
    label: 'Cloudflare Gateway - GPT-5.5',
  },

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
    model: 'gemini-3.8-flash',
    label: 'Gemini - 3.8 Flash',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    label: 'Gemini - 3.7 Flash',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    label: 'Gemini - 3.6 Flash',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    label: 'Gemini - 3.5 Flash',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    label: 'Gemini - 3.5 Flash Lite',
  },
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
    model: 'gemini-2.5-flash',
    label: 'Gemini - 2.5 Flash',
  },

  // Gemini Interactions (stateful, experimental — `@tanstack/ai-gemini/experimental`)
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.8-flash',
    label: 'Gemini Interactions - 3.8 Flash (experimental)',
  },
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.7-flash',
    label: 'Gemini Interactions - 3.7 Flash (experimental)',
  },
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.6-flash',
    label: 'Gemini Interactions - 3.6 Flash (experimental)',
  },
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.5-flash',
    label: 'Gemini Interactions - 3.5 Flash (experimental)',
  },
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.5-flash-lite',
    label: 'Gemini Interactions - 3.5 Flash Lite (experimental)',
  },
  {
    provider: 'gemini-interactions',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini Interactions - 3.1 Pro Preview (experimental)',
  },
  {
    provider: 'gemini-interactions',
    model: 'gemini-3-flash-preview',
    label: 'Gemini Interactions - 3 Flash Preview (experimental)',
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
    model: 'grok-build-0.1',
    label: 'Grok - Grok Build 0.1',
  },
  {
    provider: 'grok',
    model: 'grok-4.3',
    label: 'Grok - Grok 4.3',
  },

  // Bedrock (default Converse API — reaches Claude, Nova, Llama, gpt-oss, …)
  {
    provider: 'bedrock',
    model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    label: 'Bedrock - Claude Haiku 4.5 (Converse)',
  },
  {
    provider: 'bedrock',
    model: 'us.amazon.nova-pro-v1:0',
    label: 'Bedrock - Nova Pro (Converse)',
  },
  {
    provider: 'bedrock',
    model: 'openai.gpt-oss-120b-1:0',
    label: 'Bedrock - GPT-OSS 120B (Converse)',
  },

  // BytePlus ModelArk (ARK_API_KEY) — Seed models plus third-party models
  // (GLM, DeepSeek, gpt-oss) served from the same Ark endpoint.
  {
    provider: 'byteplus',
    model: 'dola-seed-2-1-turbo-260628',
    label: 'BytePlus - Seed 2.1 Turbo',
  },
  {
    provider: 'byteplus',
    model: 'seed-2-0-pro-260328',
    label: 'BytePlus - Seed 2.0 Pro',
  },
  {
    provider: 'byteplus',
    model: 'seed-2-0-lite-260428',
    label: 'BytePlus - Seed 2.0 Lite',
  },
  {
    provider: 'byteplus',
    model: 'seed-2-0-mini-260428',
    label: 'BytePlus - Seed 2.0 Mini',
  },
  {
    provider: 'byteplus',
    model: 'seed-2-0-code-preview-260328',
    label: 'BytePlus - Seed 2.0 Code Preview',
  },
  {
    provider: 'byteplus',
    model: 'seed-1-6-flash-250715',
    label: 'BytePlus - Seed 1.6 Flash',
  },
  {
    provider: 'byteplus',
    model: 'glm-5-2-260617',
    label: 'BytePlus - GLM 5.2',
  },
  {
    provider: 'byteplus',
    model: 'deepseek-v4-pro-260425',
    label: 'BytePlus - DeepSeek V4 Pro',
  },
  // gpt-oss-120b-250805 is deliberately absent: this route always merges the
  // server tool set into the request, and that model's tool support is
  // undeclared in model-meta and unverified against the live API.
]

export const DEFAULT_MODEL_OPTION = MODEL_OPTIONS[0]
