import type { ModelReasoning } from '../../packages/ai/src/reasoning'

/**
 * The provider packages whose `src/model-reasoning.ts` the reasoning sync
 * writes, and where it finds each package's models on models.dev.
 */
export interface ReasoningTarget {
  /** The folder under `packages/`. */
  pkg: string
  /**
   * The module (under the package's `src/`) and the arrays in it that list
   * the chat models. `undefined`: use every model of the first source.
   */
  models?: { module: string; lists: ReadonlyArray<string> }
  /** `${typePrefix}ModelReasoningByName` and `${constPrefix}_MODEL_REASONING`. */
  typePrefix: string
  constPrefix: string
  /** models.dev providers to look in first, by the exact model id. */
  sources: ReadonlyArray<string>
  /** A gateway list to look in by the exact model id. */
  gateway?: 'openrouter' | 'vercel'
  /** Model ids that name another model, as `provider/model`. */
  aliases?: Readonly<Record<string, string>>
  /**
   * Corrections that win over models.dev, for one package's API. Keep a
   * comment on each one that says why.
   */
  overrides?: Readonly<Record<string, ModelReasoning>>
}

const NO_LEVELS = {
  off: null,
  minimal: null,
  low: null,
  medium: null,
  high: null,
  xhigh: null,
  max: null,
} as const

const ARK_SEED_LEVELS: ModelReasoning = {
  map: {
    ...NO_LEVELS,
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
  },
  budget: false,
}

const ARK_THINKING_SWITCH: ModelReasoning = {
  map: { ...NO_LEVELS, off: 'disabled', high: 'enabled' },
  budget: false,
}

const ARK_DEEPSEEK_V4: ModelReasoning = {
  map: { ...NO_LEVELS, off: 'disabled', high: 'high', max: 'max' },
  budget: false,
}

export const REASONING_TARGETS: ReadonlyArray<ReasoningTarget> = [
  {
    pkg: 'ai-openai',
    models: { module: 'model-meta', lists: ['OPENAI_CHAT_MODELS'] },
    typePrefix: 'OpenAI',
    constPrefix: 'OPENAI',
    sources: ['openai'],
  },
  {
    pkg: 'ai-anthropic',
    models: {
      module: 'model-meta',
      lists: ['ANTHROPIC_MODELS', 'ANTHROPIC_VERTEX_CHAT_MODELS'],
    },
    typePrefix: 'Anthropic',
    constPrefix: 'ANTHROPIC',
    sources: ['anthropic', 'google-vertex-anthropic'],
    overrides: {
      // models.dev does not list claude-haiku-5-5 yet. The Claude API takes
      // adaptive thinking with all five efforts, or `disabled`, and no
      // budget_tokens.
      'claude-haiku-5-5': {
        map: {
          ...NO_LEVELS,
          off: 'none',
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'xhigh',
          max: 'max',
        },
        budget: false,
      },
    },
  },
  {
    pkg: 'ai-gemini',
    models: { module: 'model-meta', lists: ['GEMINI_MODELS'] },
    typePrefix: 'Gemini',
    constPrefix: 'GEMINI',
    sources: ['google', 'google-vertex'],
  },
  {
    pkg: 'ai-grok',
    models: {
      module: 'model-meta',
      lists: ['GROK_CHAT_MODELS', 'GROK_VERTEX_CHAT_MODELS'],
    },
    typePrefix: 'Grok',
    constPrefix: 'GROK',
    sources: ['xai'],
    // The xAI Responses API refuses a reasoning field for grok-build-0.1.
    overrides: { 'grok-build-0.1': false },
  },
  {
    pkg: 'ai-groq',
    models: { module: 'model-meta', lists: ['GROQ_CHAT_MODELS'] },
    typePrefix: 'Groq',
    constPrefix: 'GROQ',
    sources: ['groq'],
    overrides: {
      // Groq's reasoning_effort for Qwen 3 is `none` or `default`, and it has
      // no token budget field.
      'qwen/qwen3-32b': {
        map: {
          off: 'none',
          minimal: null,
          low: null,
          medium: null,
          high: 'default',
          xhigh: null,
          max: null,
        },
        budget: false,
      },
    },
  },
  {
    pkg: 'ai-openrouter',
    models: { module: 'model-meta', lists: ['OPENROUTER_CHAT_MODELS'] },
    typePrefix: 'OpenRouter',
    constPrefix: 'OPENROUTER',
    sources: ['openrouter'],
    gateway: 'openrouter',
  },
  {
    pkg: 'ai-bedrock',
    models: {
      module: 'model-meta',
      lists: [
        'BEDROCK_CONVERSE_MODELS',
        'BEDROCK_CHAT_MODELS',
        'BEDROCK_RESPONSES_MODELS',
      ],
    },
    typePrefix: 'Bedrock',
    constPrefix: 'BEDROCK',
    sources: ['amazon-bedrock'],
  },
  {
    pkg: 'ai-mistral',
    models: {
      module: 'model-meta',
      lists: ['MISTRAL_CHAT_MODELS', 'MISTRAL_VERTEX_CHAT_MODELS'],
    },
    typePrefix: 'Mistral',
    constPrefix: 'MISTRAL',
    sources: ['mistral'],
  },
  {
    pkg: 'ai-ollama',
    models: { module: 'model-meta', lists: ['OLLAMA_TEXT_MODELS'] },
    typePrefix: 'Ollama',
    constPrefix: 'OLLAMA',
    sources: ['ollama-cloud'],
  },
  {
    pkg: 'ai-byteplus',
    models: { module: 'model-meta', lists: ['BYTEPLUS_CHAT_MODELS'] },
    typePrefix: 'BytePlus',
    constPrefix: 'BYTEPLUS',
    sources: ['volcengine'],
    // Ark reasoning models that models.dev does not list. The Seed models
    // take the levels of their listed siblings. `enabled` and `disabled`
    // are Ark's `thinking.type` for a model with an on/off switch only.
    overrides: {
      'dola-seed-2-1-turbo-260628': ARK_SEED_LEVELS,
      'seed-2-0-lite-260228': ARK_SEED_LEVELS,
      'seed-2-0-mini-260215': ARK_SEED_LEVELS,
      'seed-1-6-flash-250615': ARK_SEED_LEVELS,
      'glm-4-7-251222': ARK_THINKING_SWITCH,
      'deepseek-v3-2-251201': ARK_THINKING_SWITCH,
      'deepseek-v4-pro-260425': ARK_DEEPSEEK_V4,
      'deepseek-v4-flash-260425': ARK_DEEPSEEK_V4,
      'gpt-oss-120b-250805': {
        map: { ...NO_LEVELS, low: 'low', medium: 'medium', high: 'high' },
        budget: false,
      },
    },
  },
  {
    pkg: 'ai-llmgateway',
    models: { module: 'model-meta', lists: ['LLMGATEWAY_CHAT_MODELS'] },
    typePrefix: 'LLMGateway',
    constPrefix: 'LLMGATEWAY',
    sources: ['llmgateway'],
  },
  {
    pkg: 'ai-lovable',
    models: { module: 'model-meta', lists: ['LOVABLE_CHAT_MODELS'] },
    typePrefix: 'Lovable',
    constPrefix: 'LOVABLE',
    sources: [],
  },
  {
    pkg: 'ai-opencode',
    models: { module: 'model-meta', lists: ['OPENCODE_MODELS'] },
    typePrefix: 'OpenCode',
    constPrefix: 'OPENCODE',
    sources: ['opencode'],
  },
  {
    pkg: 'ai-vercel-gateway',
    models: { module: 'model-meta', lists: ['VERCEL_GATEWAY_CHAT_MODELS'] },
    typePrefix: 'VercelGateway',
    constPrefix: 'VERCEL_GATEWAY',
    sources: ['vercel'],
    gateway: 'vercel',
    overrides: {
      // models.dev lists no reasoning for it at Vercel. Vercel's own model
      // list tags it `reasoning`, and Google, OpenRouter, and pi 0.87.1 list
      // it (also in `packages/ai-models/scripts/overrides.ts`).
      'google/gemma-4-31b-it': { budget: false },
    },
  },
  {
    pkg: 'ai-claude-code',
    models: { module: 'model-meta', lists: ['CLAUDE_CODE_MODELS'] },
    typePrefix: 'ClaudeCode',
    constPrefix: 'CLAUDE_CODE',
    sources: ['anthropic'],
    // The CLI aliases pick its newest model of each family.
    aliases: {
      opus: 'anthropic/claude-opus-4-8',
      sonnet: 'anthropic/claude-sonnet-4-6',
      haiku: 'anthropic/claude-haiku-4-5',
    },
  },
  {
    pkg: 'ai-codex',
    models: { module: 'model-meta', lists: ['CODEX_MODELS'] },
    typePrefix: 'Codex',
    constPrefix: 'CODEX',
    sources: ['openai'],
  },
  {
    pkg: 'ai-cloudflare',
    typePrefix: 'Cloudflare',
    constPrefix: 'CLOUDFLARE',
    sources: ['cloudflare-workers-ai'],
  },
]

/** The models.dev providers the reasoning sync reads. */
export const REASONING_SOURCES: ReadonlyArray<string> = [
  ...new Set(REASONING_TARGETS.flatMap((target) => target.sources)),
]
