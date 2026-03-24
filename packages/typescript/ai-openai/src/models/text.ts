import type {
  OpenAIBaseOptions,
  OpenAIMetadataOptions,
  OpenAIReasoningEffort,
  OpenAIReasoningOptions,
  OpenAIReasoningSummary,
  OpenAIReasoningSummaryWithConcise,
  OpenAIStreamingOptions,
  OpenAIStructuredOutputOptions,
  OpenAIToolsOptions,
} from '../text/text-provider-options'
import type {
  OpenAIRegistryDocs,
  OpenAIRegistryInput,
  OpenAIRegistryOutput,
} from './shared'

type BaseOptions = OpenAIBaseOptions & OpenAIMetadataOptions

type UnionToIntersection<T> =
  (T extends unknown ? (value: T) => void : never) extends (
    value: infer TIntersection,
  ) => void
    ? TIntersection
    : never

export interface TextProviderFeatureMap {
  base: BaseOptions
  reasoning: OpenAIReasoningOptions
  reasoningConcise: OpenAIReasoningOptions<
    OpenAIReasoningEffort,
    OpenAIReasoningSummaryWithConcise
  >
  structured: OpenAIStructuredOutputOptions
  tools: OpenAIToolsOptions
  streaming: OpenAIStreamingOptions
}

type NonReasoningTextProviderFeatureMap = Omit<
  TextProviderFeatureMap,
  'reasoning' | 'reasoningConcise'
>

type TextProviderFeature = keyof TextProviderFeatureMap

interface TextReasoningSpec {
  efforts: ReadonlyArray<OpenAIReasoningEffort>
  summaries: ReadonlyArray<OpenAIReasoningSummaryWithConcise>
}

interface TextModelSpec<
  TFeatures extends ReadonlyArray<TextProviderFeature>,
  TInput extends ReadonlyArray<OpenAIRegistryInput>,
  TOutput extends ReadonlyArray<OpenAIRegistryOutput>,
> {
  input: TInput
  output: TOutput
  features: TFeatures
  reasoning?: TextReasoningSpec
  lifecycle: {
    status: 'active' | 'preview' | 'deprecated' | 'legacy' | 'chatgpt_only'
    replacedBy?: string
  }
  snapshots?: ReadonlyArray<string>
  docs?: OpenAIRegistryDocs
}

const COMMON_TOOLS = [
  'web_search',
  'file_search',
  'image_generation',
  'code_interpreter',
  'mcp',
] as const

const CODING_TOOLS = [
  ...COMMON_TOOLS,
  'shell',
  'local_shell',
  'apply_patch',
  'hosted_shell',
  'skills',
  'tool_search',
  'custom',
] as const

const DEFAULT_REASONING_SUMMARIES = ['auto', 'detailed'] as const satisfies
  ReadonlyArray<OpenAIReasoningSummary>
const CONCISE_REASONING_SUMMARIES = [
  'auto',
  'detailed',
  'concise',
] as const satisfies ReadonlyArray<OpenAIReasoningSummaryWithConcise>

type TextReasoningOptionsForEntry<TEntry> = TEntry extends {
  reasoning: {
    efforts: ReadonlyArray<infer TEffort extends OpenAIReasoningEffort>
    summaries: ReadonlyArray<
      infer TSummary extends OpenAIReasoningSummaryWithConcise
    >
  }
}
  ? OpenAIReasoningOptions<TEffort, TSummary>
  : {}

export type TextProviderOptionsForEntry<
  TEntry extends { features: ReadonlyArray<string> },
> =
  UnionToIntersection<
    NonReasoningTextProviderFeatureMap[
      Extract<TEntry['features'][number], keyof NonReasoningTextProviderFeatureMap>
    ]
  > &
    TextReasoningOptionsForEntry<TEntry>

export const TEXT_MODELS = {
  'gpt-5.4': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5.4-2026-03-05'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.4',
      limits: {
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        knowledgeCutoff: '2025-08-31',
      },
      tools: CODING_TOOLS,
      billing: {
        input: 2.5,
        cachedInput: 0.25,
        output: 15,
        notes: [
          'Prompts over 272K input tokens increase pricing for the full session.',
          'Regional processing endpoints apply a 10% uplift.',
        ],
      },
    },
  },
  'gpt-5.4-pro': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5.4-pro-2026-03-05'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.4-pro',
      limits: {
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        knowledgeCutoff: '2025-08-31',
      },
      tools: COMMON_TOOLS,
      billing: {
        input: 30,
        output: 180,
        notes: [
          'Responses-only model.',
          'Prompts over 272K input tokens increase pricing for the full session.',
        ],
      },
    },
  },
  'gpt-5.4-mini': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5.4-mini-2026-03-17'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.4-mini',
      tools: CODING_TOOLS,
    },
  },
  'gpt-5.4-nano': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5.4-nano-2026-03-17'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.4-nano',
      tools: COMMON_TOOLS,
    },
  },
  'gpt-5.3-chat-latest': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.3-chat-latest',
      limits: {
        contextWindow: 128_000,
        maxOutputTokens: 16_384,
        knowledgeCutoff: '2025-08-31',
      },
      tools: COMMON_TOOLS,
      billing: {
        input: 1.75,
        cachedInput: 0.175,
        output: 14,
      },
    },
  },
  'gpt-5.3-codex': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.3-codex',
      limits: {
        contextWindow: 400_000,
        maxOutputTokens: 128_000,
        knowledgeCutoff: '2025-08-31',
      },
      tools: CODING_TOOLS,
      billing: {
        input: 1.75,
        cachedInput: 0.175,
        output: 14,
      },
    },
  },
  'gpt-5.2-codex': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.2-codex',
      limits: {
        contextWindow: 400_000,
        maxOutputTokens: 128_000,
        knowledgeCutoff: '2025-08-31',
      },
      tools: CODING_TOOLS,
      billing: {
        input: 1.75,
        cachedInput: 0.175,
        output: 14,
      },
    },
  },
  'gpt-5.1-codex-max': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.1-codex-max',
      limits: {
        contextWindow: 400_000,
        maxOutputTokens: 128_000,
        knowledgeCutoff: '2024-09-30',
      },
      tools: CODING_TOOLS,
      billing: {
        input: 1.25,
        cachedInput: 0.125,
        output: 10,
      },
    },
  },
  'gpt-5.2': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5.2-2025-12-11'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.4' },
  },
  'gpt-5.2-pro': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['medium', 'high', 'xhigh'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5.2-pro-2025-12-11'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.4-pro' },
  },
  'gpt-5.2-chat-latest': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.3-chat-latest' },
  },
  'gpt-5.1': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5.1-2025-11-13'],
    lifecycle: { status: 'active' },
  },
  'gpt-5.1-codex': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.1-codex',
      tools: CODING_TOOLS,
      notes: ['Codex models are text-output only.'],
    },
  },
  'gpt-5.1-codex-mini': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['none', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5.1-codex-mini',
      tools: CODING_TOOLS,
      notes: ['Codex models are text-output only.'],
    },
  },
  'gpt-5.1-chat-latest': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.3-chat-latest' },
  },
  'gpt-5': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['minimal', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5-2025-08-07'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.4' },
  },
  'gpt-5-mini': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['minimal', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5-mini-2025-08-07'],
    lifecycle: { status: 'active' },
  },
  'gpt-5-nano': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['minimal', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5-nano-2025-08-07'],
    lifecycle: { status: 'active' },
  },
  'gpt-5-pro': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['gpt-5-pro-2025-10-06'],
    lifecycle: { status: 'active' },
  },
  'gpt-5-codex': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['minimal', 'low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-5-codex',
      tools: CODING_TOOLS,
      notes: ['Codex models are text-output only.'],
    },
  },
  'gpt-5-chat-latest': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.3-chat-latest' },
  },
  'gpt-4.5-preview': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    snapshots: ['gpt-4.5-preview-2025-02-27'],
    lifecycle: { status: 'deprecated', replacedBy: 'gpt-5.4' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4.5-preview',
    },
  },
  'gpt-4.1': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    snapshots: ['gpt-4.1-2025-04-14'],
    lifecycle: { status: 'active' },
  },
  'gpt-4.1-mini': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    snapshots: ['gpt-4.1-mini-2025-04-14'],
    lifecycle: { status: 'active' },
  },
  'gpt-4.1-nano': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    snapshots: ['gpt-4.1-nano-2025-04-14'],
    lifecycle: { status: 'active' },
  },
  'gpt-4o': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    snapshots: ['gpt-4o-2024-11-20', 'gpt-4o-2024-08-06', 'gpt-4o-2024-05-13'],
    lifecycle: { status: 'active' },
  },
  'gpt-4o-mini': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'structured', 'tools', 'streaming'] as const,
    snapshots: ['gpt-4o-mini-2024-07-18'],
    lifecycle: { status: 'active' },
  },
  'gpt-4-turbo': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'tools', 'streaming'] as const,
    lifecycle: { status: 'legacy', replacedBy: 'gpt-4.1' },
    snapshots: ['gpt-4-turbo-2024-04-09'],
  },
  'gpt-4': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'streaming'] as const,
    snapshots: ['gpt-4-0613', 'gpt-4-0314'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-4.1' },
  },
  'gpt-3.5-turbo': {
    input: ['text'],
    output: ['text'],
    features: ['base'] as const,
    snapshots: ['gpt-3.5-turbo-0125', 'gpt-3.5-turbo-1106'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-4o-mini' },
  },
  'gpt-4o-search-preview': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'structured', 'streaming'] as const,
    snapshots: ['gpt-4o-search-preview-2025-03-11'],
    lifecycle: { status: 'preview' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4o-search-preview',
      tools: ['web_search'],
    },
  },
  'gpt-4o-mini-search-preview': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'structured', 'streaming'] as const,
    snapshots: ['gpt-4o-mini-search-preview-2025-03-11'],
    lifecycle: { status: 'preview' },
    docs: {
      source:
        'https://developers.openai.com/api/docs/models/gpt-4o-mini-search-preview',
      tools: ['web_search'],
    },
  },
  'computer-use-preview': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoningConcise', 'tools'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: CONCISE_REASONING_SUMMARIES,
    },
    snapshots: ['computer-use-preview-2025-03-11'],
    lifecycle: { status: 'preview' },
    docs: {
      tools: ['computer_use', 'hosted_shell', 'apply_patch', 'tool_search'],
      source: 'https://developers.openai.com/api/docs/models/computer-use-preview',
    },
  },
  'gpt-audio-1.5': {
    input: ['text', 'audio'],
    output: ['text', 'audio'],
    features: ['base', 'tools'] as const,
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-audio-1.5',
      tools: COMMON_TOOLS,
      limits: {
        contextWindow: 32_768,
        maxOutputTokens: 4_096,
        knowledgeCutoff: '2024-06-01',
      },
      billing: {
        audio: {
          input: 4,
          cachedInput: 0.4,
          output: 16,
        },
      },
    },
  },
  'gpt-audio': {
    input: ['text', 'audio'],
    output: ['text', 'audio'],
    features: ['base', 'tools'] as const,
    snapshots: ['gpt-audio-2025-08-28'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-audio',
      tools: COMMON_TOOLS,
    },
  },
  'gpt-audio-mini': {
    input: ['text', 'audio'],
    output: ['text', 'audio'],
    features: ['base', 'tools'] as const,
    snapshots: ['gpt-audio-mini-2025-12-15', 'gpt-audio-mini-2025-10-06'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-audio-mini',
      tools: COMMON_TOOLS,
    },
  },
  'gpt-4o-audio-preview': {
    input: ['text', 'audio'],
    output: ['text', 'audio'],
    features: ['base', 'tools', 'streaming'] as const,
    snapshots: [
      'gpt-4o-audio-preview-2025-06-03',
      'gpt-4o-audio-preview-2024-12-17',
      'gpt-4o-audio-preview-2024-10-01',
    ],
    lifecycle: { status: 'preview' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4o-audio-preview',
      tools: COMMON_TOOLS,
    },
  },
  'gpt-4o-mini-audio-preview': {
    input: ['text', 'audio'],
    output: ['text', 'audio'],
    features: ['base', 'tools', 'streaming'] as const,
    snapshots: ['gpt-4o-mini-audio-preview-2024-12-17'],
    lifecycle: { status: 'preview' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4o-mini-audio-preview',
      tools: COMMON_TOOLS,
    },
  },
  'gpt-oss-120b': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-oss-120b',
    },
  },
  'gpt-oss-20b': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-oss-20b',
    },
  },
  'o4-mini': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o4-mini-2025-04-16'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.4-mini' },
  },
  'o4-mini-deep-research': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o4-mini-deep-research-2025-06-26'],
    lifecycle: { status: 'active' },
  },
  o3: {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o3-2025-04-16'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.4' },
  },
  'o3-pro': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o3-pro-2025-06-10'],
    lifecycle: { status: 'active' },
  },
  'o3-mini': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o3-mini-2025-01-31'],
    lifecycle: { status: 'active' },
  },
  'o3-deep-research': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o3-deep-research-2025-06-26'],
    lifecycle: { status: 'active' },
  },
  'o1-preview': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o1-preview-2024-09-12'],
    lifecycle: { status: 'deprecated', replacedBy: 'o1' },
  },
  'o1-mini': {
    input: ['text'],
    output: ['text'],
    features: ['base', 'reasoning', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o1-mini-2024-09-12'],
    lifecycle: { status: 'deprecated', replacedBy: 'o4-mini' },
  },
  o1: {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools', 'streaming'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o1-2024-12-17'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-5.4' },
  },
  'o1-pro': {
    input: ['text', 'image'],
    output: ['text'],
    features: ['base', 'reasoning', 'structured', 'tools'] as const,
    reasoning: {
      efforts: ['low', 'medium', 'high'] as const,
      summaries: DEFAULT_REASONING_SUMMARIES,
    },
    snapshots: ['o1-pro-2025-03-19'],
    lifecycle: { status: 'active' },
  },
} as const satisfies Record<
  string,
  TextModelSpec<
    ReadonlyArray<TextProviderFeature>,
    ReadonlyArray<OpenAIRegistryInput>,
    ReadonlyArray<OpenAIRegistryOutput>
  >
>

export function getTextModelSpec(model: string) {
  if (model in TEXT_MODELS) {
    return TEXT_MODELS[model as keyof typeof TEXT_MODELS]
  }

  for (const spec of Object.values(TEXT_MODELS)) {
    const snapshots: ReadonlyArray<string> | undefined =
      'snapshots' in spec ? spec.snapshots : undefined
    if (snapshots?.includes(model)) {
      return spec
    }
  }

  return undefined
}
