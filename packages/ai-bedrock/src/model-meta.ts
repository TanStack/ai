import type { BedrockTextProviderOptions } from './text/text-provider-options'

/** Bedrock model metadata. `pricing` is intentionally optional and unpopulated initially. */
interface ModelMeta {
  name: string
  context_window?: number
  max_completion_tokens?: number
  pricing?: {
    input?: { normal: number; cached?: number }
    output?: { normal: number }
  }
  supports: {
    input: Array<'text' | 'image' | 'document'>
    output: Array<'text'>
    endpoints: Array<'chat' | 'responses'>
    features: Array<'streaming' | 'tools' | 'reasoning' | 'json_schema' | 'vision'>
    tools: ReadonlyArray<never>
  }
}

// --- OpenAI gpt-oss (text-only; chat + responses) ---
const GPT_OSS_120B = {
  name: 'openai.gpt-oss-120b',
  context_window: 128_000,
  supports: { input: ['text'], output: ['text'], endpoints: ['chat', 'responses'], features: ['streaming', 'tools', 'reasoning'], tools: [] as const },
} as const satisfies ModelMeta
const GPT_OSS_20B = {
  name: 'openai.gpt-oss-20b-1:0',
  context_window: 128_000,
  supports: { input: ['text'], output: ['text'], endpoints: ['chat', 'responses'], features: ['streaming', 'tools', 'reasoning'], tools: [] as const },
} as const satisfies ModelMeta

// --- Anthropic Claude (US cross-region inference profiles; chat) ---
const CLAUDE_SONNET_4_5 = {
  name: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  context_window: 200_000,
  supports: { input: ['text', 'image', 'document'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision', 'reasoning'], tools: [] as const },
} as const satisfies ModelMeta
const CLAUDE_HAIKU_4_5 = {
  name: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  context_window: 200_000,
  supports: { input: ['text', 'image', 'document'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision'], tools: [] as const },
} as const satisfies ModelMeta
const CLAUDE_3_7_SONNET = {
  name: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
  context_window: 200_000,
  supports: { input: ['text', 'image', 'document'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision', 'reasoning'], tools: [] as const },
} as const satisfies ModelMeta
const CLAUDE_3_5_SONNET_V2 = {
  name: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  context_window: 200_000,
  supports: { input: ['text', 'image', 'document'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision'], tools: [] as const },
} as const satisfies ModelMeta
const CLAUDE_3_5_HAIKU = {
  name: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  context_window: 200_000,
  supports: { input: ['text'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools'], tools: [] as const },
} as const satisfies ModelMeta

// --- Amazon Nova (US profiles; chat) ---
const NOVA_PRO = {
  name: 'us.amazon.nova-pro-v1:0',
  context_window: 300_000,
  supports: { input: ['text', 'image', 'document'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision'], tools: [] as const },
} as const satisfies ModelMeta
const NOVA_LITE = {
  name: 'us.amazon.nova-lite-v1:0',
  context_window: 300_000,
  supports: { input: ['text', 'image', 'document'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision'], tools: [] as const },
} as const satisfies ModelMeta
const NOVA_MICRO = {
  name: 'us.amazon.nova-micro-v1:0',
  context_window: 128_000,
  supports: { input: ['text'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools'], tools: [] as const },
} as const satisfies ModelMeta

// --- Meta Llama (US profiles; chat) ---
const LLAMA_3_3_70B = {
  name: 'us.meta.llama3-3-70b-instruct-v1:0',
  context_window: 128_000,
  supports: { input: ['text'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools'], tools: [] as const },
} as const satisfies ModelMeta
const LLAMA_4_MAVERICK = {
  name: 'us.meta.llama4-maverick-17b-instruct-v1:0',
  context_window: 128_000,
  supports: { input: ['text', 'image'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision'], tools: [] as const },
} as const satisfies ModelMeta

// --- Mistral / DeepSeek (US profiles; chat) ---
const MISTRAL_PIXTRAL_LARGE = {
  name: 'us.mistral.pixtral-large-2502-v1:0',
  context_window: 128_000,
  supports: { input: ['text', 'image'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'tools', 'vision'], tools: [] as const },
} as const satisfies ModelMeta
const DEEPSEEK_R1 = {
  name: 'us.deepseek.r1-v1:0',
  context_window: 128_000,
  supports: { input: ['text'], output: ['text'], endpoints: ['chat'], features: ['streaming', 'reasoning'], tools: [] as const },
} as const satisfies ModelMeta

const CHAT_MODELS = [
  GPT_OSS_20B, GPT_OSS_120B,
  CLAUDE_SONNET_4_5, CLAUDE_HAIKU_4_5, CLAUDE_3_7_SONNET, CLAUDE_3_5_SONNET_V2, CLAUDE_3_5_HAIKU,
  NOVA_PRO, NOVA_LITE, NOVA_MICRO,
  LLAMA_3_3_70B, LLAMA_4_MAVERICK,
  MISTRAL_PIXTRAL_LARGE, DEEPSEEK_R1,
] as const

// Cast-free: explicit `.name` lists with `as const` (the ai-groq pattern).
export const BEDROCK_CHAT_MODELS = [
  GPT_OSS_20B.name, GPT_OSS_120B.name,
  CLAUDE_SONNET_4_5.name, CLAUDE_HAIKU_4_5.name, CLAUDE_3_7_SONNET.name,
  CLAUDE_3_5_SONNET_V2.name, CLAUDE_3_5_HAIKU.name,
  NOVA_PRO.name, NOVA_LITE.name, NOVA_MICRO.name,
  LLAMA_3_3_70B.name, LLAMA_4_MAVERICK.name,
  MISTRAL_PIXTRAL_LARGE.name, DEEPSEEK_R1.name,
] as const
export const BEDROCK_RESPONSES_MODELS = [GPT_OSS_20B.name, GPT_OSS_120B.name] as const

export type BedrockChatModels = (typeof BEDROCK_CHAT_MODELS)[number]
export type BedrockResponsesModels = (typeof BEDROCK_RESPONSES_MODELS)[number]

// Mapped types keyed off the model-constant tuple union. The `as M['name']`
// is mapped-type KEY REMAPPING (legal syntax), NOT a value cast.
type ChatModelMeta = (typeof CHAT_MODELS)[number]

/** Per-model input modalities (drives type-safe multimodal content). */
export type BedrockModelInputModalitiesByName = {
  [M in ChatModelMeta as M['name']]: M['supports']['input']
}

/** Provider options per model — mapped type (ai-grok pattern). */
export type BedrockChatModelProviderOptionsByName = {
  [K in BedrockChatModels]: BedrockTextProviderOptions
}

/** No provider-specific tools — empty tuple makes cross-provider ProviderTool a compile error. */
export type BedrockChatModelToolCapabilitiesByName = {
  [M in ChatModelMeta as M['name']]: M['supports']['tools']
}

export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof BedrockChatModelProviderOptionsByName
    ? BedrockChatModelProviderOptionsByName[TModel]
    : BedrockTextProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof BedrockModelInputModalitiesByName
    ? BedrockModelInputModalitiesByName[TModel]
    : readonly ['text']
