import {
  FIREWORKS_ANTHROPIC_WIRE,
  FIREWORKS_BUDGET_THINKING,
  MID_CONVERSATION_EFFORT,
} from './known-ids'
import type { ModelCompat, WireApi } from '../src/types'

/** Where one model is served: its wire protocol and endpoint. */
export interface Wire {
  api: WireApi
  baseUrl: string
}

/** What a provider row can read from a models.dev model. */
export interface SourceModel {
  id: string
  /** The AI SDK package models.dev lists for this model, when it differs from the provider's. */
  npm?: string
}

/**
 * One provider, by hand. The quirk rules follow pi's `detectCompat()`
 * (`pi-ai/dist/api/openai-completions.js`) and the values pi sets on every
 * model of the provider. Per-model hints come from models.dev (see
 * `rules.ts`), and the model value wins.
 */
export interface ProviderRow {
  id: string
  name: string
  /** models.dev provider ids to read models from. The first one wins on a clash. */
  sources: ReadonlyArray<string>
  baseUrl: string
  env: ReadonlyArray<ReadonlyArray<string>>
  /** Wire and endpoint per model. Default: `api` at `baseUrl`. */
  api: WireApi
  wire?: (model: SourceModel) => Wire
  /** The model id the catalog uses, from the models.dev id. Default: the same. */
  modelId?: (sourceId: string) => string
  /** `true`: leave this models.dev model out, for example one on a wire no adapter here takes. */
  exclude?: (sourceId: string) => boolean
  /** Quirks of every model of this provider. */
  compat?: ModelCompat
  /** Quirks of some models of this provider, by model id. */
  modelCompat?: (id: string, wire: Wire) => ModelCompat | undefined
  /** `true`: `supportsReasoningEffort` follows each model's `effort` option. */
  effortByModel?: boolean
  headers?: Readonly<Record<string, string>>
}

const completions = (baseUrl: string): Wire => ({
  api: 'openai-completions',
  baseUrl,
})

/** Chat Completions rules of the "non-standard" providers in pi's detectCompat. */
const NON_STANDARD: ModelCompat = {
  supportsStore: false,
  supportsDeveloperRole: false,
}

/** A DeepSeek-family model on a gateway sends thinking the DeepSeek way. */
const deepseekFamily = (id: string): ModelCompat | undefined =>
  /deepseek/i.test(id)
    ? {
        thinkingFormat: 'deepseek',
        requiresReasoningContentOnAssistantMessages: true,
      }
    : undefined

/** OpenCode serves each model on the wire of the SDK models.dev lists. */
const opencodeWire =
  (root: string) =>
  (model: SourceModel): Wire => {
    if (model.npm === '@ai-sdk/anthropic')
      return { api: 'anthropic-messages', baseUrl: root }
    if (model.npm === '@ai-sdk/google')
      return { api: 'google-generative-ai', baseUrl: `${root}/v1` }
    if (model.npm === '@ai-sdk/openai')
      return { api: 'openai-responses', baseUrl: `${root}/v1` }
    return completions(`${root}/v1`)
  }

const opencodeCompat = (id: string, wire: Wire): ModelCompat | undefined => {
  if (wire.api === 'openai-completions')
    return {
      ...NON_STANDARD,
      supportsStrictMode: true,
      maxTokensField: 'max_tokens',
      ...deepseekFamily(id),
    }
  if (wire.api === 'openai-responses')
    return { sessionAffinityFormat: 'openai-nosession' }
  return undefined
}

const CLOUDFLARE_GATEWAY =
  'https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}'

export const PROVIDERS: ReadonlyArray<ProviderRow> = [
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    sources: ['amazon-bedrock'],
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    api: 'bedrock-converse-stream',
    // The `eu.` cross-region profiles run in eu-central-1.
    wire: (model) => ({
      api: 'bedrock-converse-stream',
      baseUrl: model.id.startsWith('eu.')
        ? 'https://bedrock-runtime.eu-central-1.amazonaws.com'
        : 'https://bedrock-runtime.us-east-1.amazonaws.com',
    }),
    env: [
      ['AWS_PROFILE'],
      ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      ['AWS_BEARER_TOKEN_BEDROCK'],
      ['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'],
      ['AWS_CONTAINER_CREDENTIALS_FULL_URI'],
      ['AWS_WEB_IDENTITY_TOKEN_FILE'],
    ],
  },
  {
    id: 'ant-ling',
    name: 'Ant Ling',
    sources: [],
    baseUrl: 'https://api.ant-ling.com/v1',
    api: 'openai-completions',
    env: [['ANT_LING_API_KEY']],
    compat: {
      ...NON_STANDARD,
      supportsReasoningEffort: false,
      maxTokensField: 'max_tokens',
      thinkingFormat: 'ant-ling',
      supportsStrictMode: true,
      supportsLongCacheRetention: false,
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    sources: ['anthropic'],
    baseUrl: 'https://api.anthropic.com',
    api: 'anthropic-messages',
    env: [
      ['ANTHROPIC_API_KEY'],
      ['ANTHROPIC_OAUTH_TOKEN'],
      ['ANTHROPIC_AUTH_TOKEN'],
    ],
    compat: { supportsStrictTools: true },
    modelCompat: (id) =>
      MID_CONVERSATION_EFFORT.anthropic?.includes(id)
        ? { supportsMidConvoEffort: true }
        : undefined,
  },
  {
    id: 'azure-openai-responses',
    name: 'Azure OpenAI',
    sources: ['azure'],
    // Each Azure resource has its own endpoint.
    baseUrl: '',
    api: 'azure-openai-responses',
    env: [['AZURE_OPENAI_API_KEY']],
  },
  {
    id: 'baseten',
    name: 'Baseten',
    sources: ['baseten'],
    baseUrl: 'https://inference.baseten.co/v1',
    api: 'openai-completions',
    env: [['BASETEN_API_KEY']],
    effortByModel: true,
    compat: {
      ...NON_STANDARD,
      supportsStrictMode: true,
      supportsUsageInStreaming: true,
      maxTokensField: 'max_tokens',
      sendSessionAffinityHeaders: true,
      supportsLongCacheRetention: false,
    },
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    sources: ['cerebras'],
    baseUrl: 'https://api.cerebras.ai/v1',
    api: 'openai-completions',
    env: [['CEREBRAS_API_KEY']],
    compat: NON_STANDARD,
  },
  {
    id: 'cloudflare-ai-gateway',
    name: 'Cloudflare AI Gateway',
    sources: ['cloudflare-ai-gateway'],
    baseUrl: `${CLOUDFLARE_GATEWAY}/compat`,
    api: 'openai-completions',
    env: [['CLOUDFLARE_API_KEY']],
    // Claude and OpenAI models have their own routes, and pi drops the
    // vendor part of their id. Every other model goes through `/compat`.
    modelId: (id) => id.replace(/^(anthropic|openai)\//, ''),
    wire: (model) => {
      if (model.id.startsWith('anthropic/'))
        return {
          api: 'anthropic-messages',
          baseUrl: `${CLOUDFLARE_GATEWAY}/anthropic`,
        }
      if (model.id.startsWith('openai/'))
        return {
          api: 'openai-responses',
          baseUrl: `${CLOUDFLARE_GATEWAY}/openai`,
        }
      return completions(`${CLOUDFLARE_GATEWAY}/compat`)
    },
    compat: { sendSessionAffinityHeaders: true },
    modelCompat: (id, wire) =>
      wire.api === 'openai-completions'
        ? {
            ...NON_STANDARD,
            supportsReasoningEffort: false,
            maxTokensField: 'max_tokens',
            supportsLongCacheRetention: false,
            ...deepseekFamily(id),
          }
        : wire.api === 'openai-responses'
          ? { supportsStrictMode: true, sendSessionAffinityHeaders: false }
          : undefined,
  },
  {
    id: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI',
    sources: ['cloudflare-workers-ai'],
    baseUrl:
      'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1',
    api: 'openai-completions',
    env: [['CLOUDFLARE_API_KEY']],
    compat: {
      ...NON_STANDARD,
      supportsStrictMode: true,
      supportsLongCacheRetention: false,
      sendSessionAffinityHeaders: true,
    },
    modelCompat: deepseekFamily,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    sources: ['deepseek'],
    baseUrl: 'https://api.deepseek.com',
    api: 'openai-completions',
    env: [['DEEPSEEK_API_KEY']],
    compat: {
      ...NON_STANDARD,
      maxTokensField: 'max_tokens',
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: 'deepseek',
      supportsStrictMode: true,
    },
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    sources: ['fireworks-ai'],
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    api: 'openai-completions',
    env: [['FIREWORKS_API_KEY']],
    wire: (model) =>
      FIREWORKS_ANTHROPIC_WIRE.includes(model.id)
        ? {
            api: 'anthropic-messages',
            baseUrl: 'https://api.fireworks.ai/inference',
          }
        : completions('https://api.fireworks.ai/inference/v1'),
    compat: {
      sendSessionAffinityHeaders: true,
      supportsLongCacheRetention: false,
    },
    modelCompat: (id, wire) =>
      wire.api === 'anthropic-messages'
        ? {
            allowEmptySignature: true,
            supportsEagerToolInputStreaming: false,
            supportsCacheControlOnTools: false,
            ...(!FIREWORKS_BUDGET_THINKING.includes(id) && {
              forceAdaptiveThinking: true,
            }),
          }
        : { ...NON_STANDARD, supportsStrictMode: true, ...deepseekFamily(id) },
  },
  {
    id: 'google',
    name: 'Google',
    sources: ['google'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    api: 'google-generative-ai',
    env: [['GEMINI_API_KEY']],
  },
  {
    id: 'google-vertex',
    name: 'Google Vertex AI',
    sources: ['google-vertex'],
    baseUrl: 'https://{location}-aiplatform.googleapis.com',
    api: 'google-vertex',
    // Claude on Vertex speaks the Anthropic Messages wire, which the Gemini
    // adapter cannot call. pi lists no Claude models on Vertex either.
    exclude: (id) => id.startsWith('claude-'),
    // An API key, or Application Default Credentials with a project and a location.
    env: [
      ['GOOGLE_CLOUD_API_KEY'],
      [
        'GOOGLE_APPLICATION_CREDENTIALS',
        'GOOGLE_CLOUD_PROJECT',
        'GOOGLE_CLOUD_LOCATION',
      ],
      [
        'GOOGLE_APPLICATION_CREDENTIALS',
        'GCLOUD_PROJECT',
        'GOOGLE_CLOUD_LOCATION',
      ],
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    sources: ['groq'],
    baseUrl: 'https://api.groq.com/openai/v1',
    api: 'openai-completions',
    env: [['GROQ_API_KEY']],
    compat: { supportsStrictMode: true },
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    sources: ['huggingface'],
    baseUrl: 'https://router.huggingface.co/v1',
    api: 'openai-completions',
    env: [['HF_TOKEN']],
    compat: { supportsStrictMode: true, supportsDeveloperRole: false },
  },
  {
    id: 'kimi-coding',
    name: 'Kimi For Coding',
    sources: ['kimi-code-plan-global', 'kimi-code-plan-cn'],
    baseUrl: 'https://api.kimi.com/coding',
    api: 'anthropic-messages',
    env: [['KIMI_API_KEY']],
    compat: { forceAdaptiveThinking: true },
  },
  {
    id: 'meta',
    name: 'Meta',
    sources: ['meta'],
    baseUrl: 'https://api.meta.ai/v1',
    api: 'openai-responses',
    env: [['META_API_KEY']],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    sources: ['minimax'],
    baseUrl: 'https://api.minimax.io/anthropic',
    api: 'anthropic-messages',
    env: [['MINIMAX_API_KEY']],
  },
  {
    id: 'minimax-cn',
    name: 'MiniMax (China)',
    sources: ['minimax-cn'],
    baseUrl: 'https://api.minimaxi.com/anthropic',
    api: 'anthropic-messages',
    env: [['MINIMAX_CN_API_KEY']],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    sources: ['mistral'],
    baseUrl: 'https://api.mistral.ai',
    api: 'mistral-conversations',
    env: [['MISTRAL_API_KEY']],
  },
  ...(['moonshotai', 'moonshotai-cn'] as const).map(
    (id): ProviderRow => ({
      id,
      name: id === 'moonshotai' ? 'Moonshot AI' : 'Moonshot AI (China)',
      sources: [id],
      baseUrl:
        id === 'moonshotai'
          ? 'https://api.moonshot.ai/v1'
          : 'https://api.moonshot.cn/v1',
      api: 'openai-completions',
      env: [['MOONSHOT_API_KEY']],
      effortByModel: true,
      compat: {
        ...NON_STANDARD,
        maxTokensField: 'max_tokens',
        supportsStrictMode: false,
        supportsMidConvoSystemMessages: true,
        thinkingFormat: 'deepseek',
      },
    }),
  ),
  {
    id: 'nvidia',
    name: 'NVIDIA',
    sources: ['nvidia'],
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    api: 'openai-completions',
    env: [['NVIDIA_API_KEY']],
    headers: { 'NVCF-POLL-SECONDS': '3600' },
    compat: {
      ...NON_STANDARD,
      supportsReasoningEffort: false,
      maxTokensField: 'max_tokens',
      supportsLongCacheRetention: false,
      supportsStrictMode: false,
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    sources: ['openai'],
    baseUrl: 'https://api.openai.com/v1',
    api: 'openai-responses',
    env: [['OPENAI_API_KEY']],
    compat: { supportsStrictMode: true },
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    sources: ['opencode'],
    baseUrl: 'https://opencode.ai/zen/v1',
    api: 'openai-completions',
    env: [['OPENCODE_API_KEY']],
    wire: opencodeWire('https://opencode.ai/zen'),
    modelCompat: opencodeCompat,
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    sources: ['opencode-go'],
    baseUrl: 'https://opencode.ai/zen/go/v1',
    api: 'openai-completions',
    env: [['OPENCODE_API_KEY']],
    wire: opencodeWire('https://opencode.ai/zen/go'),
    modelCompat: opencodeCompat,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    sources: ['openrouter'],
    baseUrl: 'https://openrouter.ai/api/v1',
    api: 'openai-completions',
    env: [['OPENROUTER_API_KEY']],
    // Claude goes through OpenRouter's Anthropic Messages endpoint. Its
    // `:batch` variants are Chat Completions only.
    wire: (model) =>
      model.id.startsWith('anthropic/') && !model.id.endsWith(':batch')
        ? { api: 'anthropic-messages', baseUrl: 'https://openrouter.ai/api' }
        : completions('https://openrouter.ai/api/v1'),
    compat: {
      thinkingFormat: 'openrouter',
      supportsStrictMode: true,
      sendSessionAffinityHeaders: true,
      sessionAffinityFormat: 'openrouter',
    },
    modelCompat: (id) => ({
      supportsDeveloperRole: /^(anthropic|openai)\//.test(id),
      ...(id.startsWith('anthropic/')
        ? { cacheControlFormat: 'anthropic' as const }
        : {}),
      ...(MID_CONVERSATION_EFFORT.openrouter?.includes(id)
        ? { supportsMidConvoEffort: true }
        : {}),
    }),
  },
  ...(
    [
      [
        'qwen-token-plan',
        'Qwen Token Plan',
        'alibaba',
        'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
        'QWEN_TOKEN_PLAN_API_KEY',
      ],
      [
        'qwen-token-plan-cn',
        'Qwen Token Plan (China)',
        'alibaba-cn',
        'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
        'QWEN_TOKEN_PLAN_CN_API_KEY',
      ],
      [
        'qwen-token-plan-individual',
        'Qwen Token Plan (Individual)',
        'alibaba',
        'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
        'QWEN_TOKEN_PLAN_API_KEY',
      ],
    ] as const
  ).map(
    ([id, name, source, baseUrl, key]): ProviderRow => ({
      id,
      name,
      sources: [source],
      baseUrl,
      api: 'openai-completions',
      env: [[key]],
      effortByModel: true,
      compat: {
        ...NON_STANDARD,
        supportsStrictMode: true,
        thinkingFormat: 'qwen',
      },
    }),
  ),
  {
    id: 'together',
    name: 'Together AI',
    sources: ['togetherai'],
    baseUrl: 'https://api.together.ai/v1',
    api: 'openai-completions',
    env: [['TOGETHER_API_KEY']],
    compat: {
      ...NON_STANDARD,
      supportsReasoningEffort: false,
      maxTokensField: 'max_tokens',
      supportsLongCacheRetention: false,
      supportsStrictMode: false,
      thinkingFormat: 'together',
    },
  },
  {
    id: 'vercel-ai-gateway',
    name: 'Vercel AI Gateway',
    sources: ['vercel'],
    baseUrl: 'https://ai-gateway.vercel.sh',
    api: 'anthropic-messages',
    env: [['AI_GATEWAY_API_KEY']],
    compat: { allowEmptySignature: true },
  },
  {
    id: 'xai',
    name: 'xAI',
    sources: ['xai'],
    baseUrl: 'https://api.x.ai/v1',
    api: 'openai-responses',
    env: [['XAI_API_KEY']],
    compat: { supportsLongCacheRetention: false },
  },
  ...(
    [
      [
        'xiaomi',
        'Xiaomi MiMo',
        'https://api.xiaomimimo.com/v1',
        'XIAOMI_API_KEY',
      ],
      [
        'xiaomi-token-plan-ams',
        'Xiaomi MiMo Token Plan (Amsterdam)',
        'https://token-plan-ams.xiaomimimo.com/v1',
        'XIAOMI_TOKEN_PLAN_AMS_API_KEY',
      ],
      [
        'xiaomi-token-plan-cn',
        'Xiaomi MiMo Token Plan (China)',
        'https://token-plan-cn.xiaomimimo.com/v1',
        'XIAOMI_TOKEN_PLAN_CN_API_KEY',
      ],
      [
        'xiaomi-token-plan-sgp',
        'Xiaomi MiMo Token Plan (Singapore)',
        'https://token-plan-sgp.xiaomimimo.com/v1',
        'XIAOMI_TOKEN_PLAN_SGP_API_KEY',
      ],
    ] as const
  ).map(
    ([id, name, baseUrl, key]): ProviderRow => ({
      id,
      name,
      sources: ['xiaomi'],
      baseUrl,
      api: 'openai-completions',
      env: [[key]],
      compat: {
        supportsStrictMode: true,
        requiresReasoningContentOnAssistantMessages: true,
        thinkingFormat: 'deepseek',
      },
    }),
  ),
  ...(
    [
      [
        'zai',
        'Z.AI',
        ['zai'],
        'https://api.z.ai/api/coding/paas/v4',
        'ZAI_API_KEY',
      ],
      [
        'zai-coding-cn',
        'Zhipu AI Coding Plan',
        ['zhipuai-coding-plan', 'zai-coding-plan'],
        'https://open.bigmodel.cn/api/coding/paas/v4',
        'ZAI_CODING_CN_API_KEY',
      ],
    ] as const
  ).map(
    ([id, name, sources, baseUrl, key]): ProviderRow => ({
      id,
      name,
      sources,
      baseUrl,
      api: 'openai-completions',
      env: [[key]],
      effortByModel: true,
      compat: {
        ...NON_STANDARD,
        maxTokensField: 'max_tokens',
        thinkingFormat: 'zai',
        supportsStrictMode: true,
        zaiToolStream: true,
      },
    }),
  ),
]
