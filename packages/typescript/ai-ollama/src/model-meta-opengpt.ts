interface _GoChatCompletionRequest {
  // model: string
  // messages: Message[]
  // stream: boolean
  // stream_options?: StreamOptions
  // max_tokens?: number
  seed?: number
  stop?: any
  temperature?: number
  frequency_penalty?: number
  presence_penalty?: number
  top_p?: number
  // response_format?: ResponseFormat
  // tools: Tool[]
  // reasoning?: Reasoning
  // reasoning_effort?: string
  // logprobs?: boolean
  // top_logprobs: number
  // _debug_render_only: boolean
}

interface ChatCompletionRequest {
  seed?: number
  stop?: any
  temperature?: number
  frequency_penalty?: number
  presence_penalty?: number
  top_p?: number
}

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  options?: ChatCompletionRequest
  providerOptions?: TProviderOptions
  supports?: {
    input?: Array<'text' | 'image' | 'video'>
    output?: Array<'text' | 'image' | 'video'>
    capabilities?: Array<'tools' | 'thinking' | 'vision' | 'embedding'>
  }
  size?: string
  context?: string
}

// gpt oss
// OpenAI’s open-weight models designed for powerful reasoning, agentic tasks, and versatile developer use cases.
const GPT_OSS_LATEST = {
  name: 'gpt-oss:',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '14gb',
  context: '128k',
} as const satisfies ModelMeta<any>

const GPT_OSS_20b = {
  name: 'gpt-oss:20b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '14gb',
  context: '128k',
} as const satisfies ModelMeta<any>

const GPT_OSS_120b = {
  name: 'gpt-oss:120b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '65gb',
  context: '128k',
} as const satisfies ModelMeta<any>

// gpt-oss-safeguard
// gpt-oss-safeguard-20b and gpt-oss-safeguard-120b are safety reasoning models built-upon gpt-oss
const GPT_OSS_SAFEGUARD_LATEST = {
  name: 'gpt-oss-safeguard:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '14gb',
  context: '128k',
} as const satisfies ModelMeta<any>

const GPT_OSS_SAFEGUARD_20b = {
  name: 'gpt-oss-safeguard:20b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '14gb',
  context: '128k',
} as const satisfies ModelMeta<any>

const GPT_OSS_SAFEGUARD_120b = {
  name: 'gpt-oss-safeguard:120b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '65gb',
  context: '128k',
} as const satisfies ModelMeta<any>
