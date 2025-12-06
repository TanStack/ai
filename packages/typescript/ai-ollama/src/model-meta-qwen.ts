import type { ChatRequest, Message, Options, Tool } from 'ollama'

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  options?: Options
  providerOptions?: TProviderOptions
  supports?: {
    input?: Array<'text' | 'image' | 'video'>
    output?: Array<'text' | 'image' | 'video'>
    capabilities?: Array<
      'tools' | 'thinking' | 'vision' | 'embedding' | 'cloud'
    >
  }
  size?: string
  context?: number
}

// qwen 3-vl
// The most powerful vision-language model in the Qwen model family to date.
const QWEN3_VL = {
  name: 'qwen3-vl:latest',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '6.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b = {
  name: 'qwen3-vl:2b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b = {
  name: 'qwen3-vl:2b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '3.3gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b = {
  name: 'qwen3-vl:8b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '6.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b = {
  name: 'qwen3-vl:30b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '20gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b = {
  name: 'qwen3-vl:32b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '21gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b = {
  name: 'qwen3-vl:235b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '143gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_INSTRUCT = {
  name: 'qwen3-vl:2b-instruct',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_INSTRUCT_Q4_K_M = {
  name: 'qwen3-vl:2b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_INSTRUCT_Q8_0 = {
  name: 'qwen3-vl:2b-instruct-q8_0',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '2.6gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_INSTRUCT_BF16 = {
  name: 'qwen3-vl:2b-instruct-bf16',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '4.3gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_THINKING = {
  name: 'qwen3-vl:2b-thinking',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_THINKING_Q4_K_M = {
  name: 'qwen3-vl:2b-thinking-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_THINKING_Q8_0 = {
  name: 'qwen3-vl:2b-thinking-q8_0',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '2.6gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_2b_THINKING_BF16 = {
  name: 'qwen3-vl:2b-thinking-bf16',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '4.3gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_INSTRUCT = {
  name: 'qwen3-vl:4b-instruct',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '3.3gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_INSTRUCT_Q4_K_M = {
  name: 'qwen3-vl:4b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '3.3gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_INSTRUCT_Q8_0 = {
  name: 'qwen3-vl:4b-instruct-q8_0',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '5.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_INSTRUCT_BF16 = {
  name: 'qwen3-vl:4b-instruct-bf16',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '8.9gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_THINKING = {
  name: 'qwen3-vl:4b-instruct-bf16',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '3.3gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_THINKING_Q4_K_M = {
  name: 'qwen3-vl:4b-thinking-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '3.3gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_THINKING_Q9_0 = {
  name: 'qwen3-vl:4b-thinking-q8_0',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '5.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_4b_THINKING_BF16 = {
  name: 'qwen3-vl:4b-thinking-bf16',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '8.9gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_INSTRUCT = {
  name: 'qwen3-vl:8b-instruct',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '6.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_INSTRUCT_Q4_K_M = {
  name: 'qwen3-vl:8b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '6.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_INSTRUCT_Q8_0 = {
  name: 'qwen3-vl:8b-instruct-q8_0',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '9.8gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_INSTRUCT_BF16 = {
  name: 'qwen3-vl:8b-instruct-bf16',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '18gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_THINKING = {
  name: 'qwen3-vl:8b-thinking',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '6.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_THINKING_Q4_K_M = {
  name: 'qwen3-vl:8b-thinking-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '6.1gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_THINKING_Q8_0 = {
  name: 'qwen3-vl:8b-thinking-q8_0',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '9.8gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_8b_THINKING_BF16 = {
  name: 'qwen3-vl:8b-thinking-bf16',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '18gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B = {
  name: 'qwen3-vl:30b-a3b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '20gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B_INSTRUCT = {
  name: 'qwen3-vl:30b-a3b-instruct',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '20gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B_INSTRUCT_Q4_K_M = {
  name: 'qwen3-vl:30b-a3b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '20gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B_INSTRUCT_Q8_0 = {
  name: 'qwen3-vl:30b-a3b-instruct-q8_0',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '34gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B_INSTRUCT_BF16 = {
  name: 'qwen3-vl:30b-a3b-instruct-bf16',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '62gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B_THINKING = {
  name: 'qwen3-vl:30b-a3b-thinking',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '20gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B_THINKING_Q4_K_M = {
  name: 'qwen3-vl:30b-a3b-thinking-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '20gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_30b_A3B_THINKING_BF16 = {
  name: 'qwen3-vl:30b-a3b-thinking-bf16',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '62gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_INSTRUCT = {
  name: 'qwen3-vl:32b-instruct',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '21gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_INSTRUCT_Q4_K_M = {
  name: 'qwen3-vl:32b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '21gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_INSTRUCT_Q8_0 = {
  name: 'qwen3-vl:32b-instruct-q8_0',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '36gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_INSTRUCT_BF16 = {
  name: 'qwen3-vl:32b-instruct-bf16',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '67gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_THINKING = {
  name: 'qwen3-vl:32b-thinking',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '21gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_THINKING_Q4_K_M = {
  name: 'qwen3-vl:32b-thinking-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '21gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_THINKING_Q8_0 = {
  name: 'qwen3-vl:32b-thinking-q8_0',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '36gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_32b_THINKING_BF16 = {
  name: 'qwen3-vl:32b-thinking-bf16',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '67gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B = {
  name: 'qwen3-vl:235b-a22b',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '143gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B_INSTRUCT_Q4_K_M = {
  name: 'qwen3-vl:235b-a22b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '143gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B_INSTRUCT_Q8_0 = {
  name: 'qwen3-vl:235b-a22b-instruct-q8_0',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '241gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B_INSTRUCT_BF16 = {
  name: 'qwen3-vl:235b-a22b-instruct-bf16',
  supports: {
    capabilities: ['tools', 'vision'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '471gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B_THINKING = {
  name: 'qwen3-vl:235b-a22b-thinking',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '143gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B_THINKING_Q4_M_K = {
  name: 'qwen3-vl:235b-a22b-thinking',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '143gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B_THINKING_Q8_0 = {
  name: 'qwen3-vl:235b-a22b-thinking-q8_0',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '251gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_A22B_THINKING_BF16 = {
  name: 'qwen3-vl:235b-a22b-thinking-bf16',
  supports: {
    capabilities: ['tools', 'vision', 'thinking'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '251gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_CLOUD = {
  name: 'qwen3-vl:235b-cloud',
  supports: {
    capabilities: ['tools', 'vision', 'thinking', 'cloud'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '-',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_VL_235b_INSTRUCT_CLOUD = {
  name: 'qwen3:latest',
  supports: {
    capabilities: ['tools', 'vision', 'thinking', 'cloud'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '-',
  context: 40_000,
} as const satisfies ModelMeta<any>

// qwen3-coder
// Alibaba's performant long context models for agentic and coding tasks.
const QWEN3_CODER_LATEST = {
  name: 'qwen3-coder:latest',
  supports: {
    capabilities: ['tools'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '19gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_CODER_30b = {
  name: 'qwen3-coder:30b',
  supports: {
    capabilities: ['tools'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '19gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_CODER_480b = {
  name: 'qwen3-coder:480b',
  supports: {
    capabilities: ['tools'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '290gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_CODER_480b_CLOUD = {
  name: 'qwen3-coder:480b-cloud',
  supports: {
    capabilities: ['tools', 'cloud'],
    input: ['text', 'image'],
    output: ['text'],
  },
  size: '-',
  context: 256_000,
} as const satisfies ModelMeta<any>

// qwen3
// Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.
const QWEN3_LATEST = {
  name: 'qwen3:latest',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '5.2gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_0_6b = {
  name: 'qwen3:0.6b',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '523mb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_1_7b = {
  name: 'qwen3:1.7b',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.4gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_4b = {
  name: 'qwen3:4b',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '2.5gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_8b = {
  name: 'qwen3:8b',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '5.2gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_30b = {
  name: 'qwen3:30b',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '19gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_32b = {
  name: 'qwen3:32b',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '20gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

const QWEN3_235b = {
  name: 'qwen3:235b',
  supports: {
    capabilities: ['tools', 'thinking'],
    input: ['text'],
    output: ['text'],
  },
  size: '142gb',
  context: 256_000,
} as const satisfies ModelMeta<any>

// qwen 2.5
// Qwen2.5 models are pretrained on Alibaba's latest large-scale dataset, encompassing up to 18 trillion tokens. The model supports up to 128K tokens and has multilingual support.
const QWEN2_5_LATEST = {
  name: 'qwen2.5:latest',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b = {
  name: 'qwen2.5:0.5b',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '398mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b = {
  name: 'qwen2.5:1.5b',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '986mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b = {
  name: 'qwen2.5:3b',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_LATEST = {
  name: 'qwen2.5:7b',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_14b = {
  name: 'qwen2.5:14b',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '9.0gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_32b = {
  name: 'qwen2.5:32b',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '20gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_72b = {
  name: 'qwen2.5:72b',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '47gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE = {
  name: 'qwen2.5:0.5b-base',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '398mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q2_K = {
  name: 'qwen2.5:0.5b-base-q2_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '339mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q3_K_S = {
  name: 'qwen2.5:0.5b-base-q3_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '338mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q3_K_M = {
  name: 'qwen2.5:0.5b-base-q3_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '355mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q3_K_L = {
  name: 'qwen2.5:0.5b-base-q3_K_L',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '369mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q4_0 = {
  name: 'qwen2.5:0.5b-base-q4_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '352mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q4_1 = {
  name: 'qwen2.5:0.5b-base-q4_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '375mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q4_K_S = {
  name: 'qwen2.5:0.5b-base-q4_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '385mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q4_K_M = {
  name: 'qwen2.5:0.5b-base-q4_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '398mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q5_0 = {
  name: 'qwen2.5:0.5b-base-q5_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '397mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q5_1 = {
  name: 'qwen2.5:0.5b-base-q5_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '419mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q5_K_S = {
  name: 'qwen2.5:0.5b-base-q5_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '413mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_BASE_Q8_0 = {
  name: 'qwen2.5:0.5b-base-q8_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '531mb',
  context: 32_000,
} as const satisfies ModelMeta<any>
//

const QWEN2_5_0_5b_INSTRUCT = {
  name: 'qwen2.5:0.5b-instruct',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '398mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q2_K = {
  name: 'qwen2.5:0.5b-instruct-q2_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '339mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q3_K_S = {
  name: 'qwen2.5:0.5b-instruct-q3_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '338mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q3_K_M = {
  name: 'qwen2.5:0.5b-instruct-q3_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '355mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q3_K_L = {
  name: 'qwen2.5:0.5b-instruct-q3_K_L',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '369mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q4_0 = {
  name: 'qwen2.5:0.5b-instruct-q4_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '352mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q4_1 = {
  name: 'qwen2.5:0.5b-instruct-q4_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '375mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q4_K_S = {
  name: 'qwen2.5:0.5b-instruct-q4_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '385mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q4_K_M = {
  name: 'qwen2.5:0.5b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '398mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q5_0 = {
  name: 'qwen2.5:0.5b-instruct-q5_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '397mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q5_1 = {
  name: 'qwen2.5:0.5b-instruct-q5_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '419mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q5_K_S = {
  name: 'qwen2.5:0.5b-instruct-q5_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '413mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q5_K_M = {
  name: 'qwen2.5:0.5b-instruct-q5_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '420mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q6_K = {
  name: 'qwen2.5:0.5b-instruct-q6_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '506mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_Q8_0 = {
  name: 'qwen2.5:0.5b-instruct-q8_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '531mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_0_5b_INSTRUCT_FP16 = {
  name: 'qwen2.5:0.5b-instruct-fp16',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '994mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT = {
  name: 'qwen2.5:1.5b-instruct',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '986mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q2_K = {
  name: 'qwen2.5:1.5b-instruct-q2_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '676mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q3_K_S = {
  name: 'qwen2.5:1.5b-instruct-q3_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '761mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q3_K_M = {
  name: 'qwen2.5:1.5b-instruct-q3_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '824mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q3_K_L = {
  name: 'qwen2.5:1.5b-instruct-q3_K_L',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '880mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q4_0 = {
  name: 'qwen2.5:1.5b-instruct-q4_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '935mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q4_1 = {
  name: 'qwen2.5:1.5b-instruct-q4_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.0gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q4_K_S = {
  name: 'qwen2.5:1.5b-instruct-q4_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '940mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q4_K_M = {
  name: 'qwen2.5:1.5b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '986mb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q5_0 = {
  name: 'qwen2.5:1.5b-instruct-q5_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.1gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q5_1 = {
  name: 'qwen2.5:1.5b-instruct-q5_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.2gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q5_K_S = {
  name: 'qwen2.5:1.5b-instruct-q5_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.1gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q5_K_M = {
  name: 'qwen2.5:1.5b-instruct-q5_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.1gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q6_K = {
  name: 'qwen2.5:1.5b-instruct-q6_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.3gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_Q8_0 = {
  name: 'qwen2.5:1.5b-instruct-q8_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.6gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_1_5b_INSTRUCT_FP16 = {
  name: 'qwen2.5:1.5b-instruct-fp16',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '3.1gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT = {
  name: 'qwen2.5:3b-instruct',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q2_K = {
  name: 'qwen2.5:3b-instruct-q2_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.3gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q3_K_S = {
  name: 'qwen2.5:3b-instruct-q3_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.5gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q3_K_M = {
  name: 'qwen2.5:3b-instruct-q3_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.6gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q3_K_L = {
  name: 'qwen2.5:3b-instruct-q3_K_L',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.7gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q4_0 = {
  name: 'qwen2.5:3b-instruct-q4_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.8gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q4_1 = {
  name: 'qwen2.5:3b-instruct-q4_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '2.0gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q4_K_S = {
  name: 'qwen2.5:3b-instruct-q4_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.8gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q4_K_M = {
  name: 'qwen2.5:3b-instruct-q4_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '1.9gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q5_0 = {
  name: 'qwen2.5:3b-instruct-q5_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '2.2gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q5_1 = {
  name: 'qwen2.5:3b-instruct-q5_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '2.3gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q5_K_S = {
  name: 'qwen2.5:3b-instruct-q5_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '2.2gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q5_K_M = {
  name: 'qwen2.5:3b-instruct-q5_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '2.2gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q6_K = {
  name: 'qwen2.5:3b-instruct-q6_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '2.5gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_Q8_0 = {
  name: 'qwen2.5:3b-instruct-q8_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '3.3gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_3b_INSTRUCT_FP16 = {
  name: 'qwen2.5:3b-instruct-fp16',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '6.2gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT = {
  name: 'qwen2.5:7b-instruct',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT_Q2_K = {
  name: 'qwen2.5:7b-instruct-q2_K',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '3.0gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT_Q3_K_S = {
  name: 'qwen2.5:7b-instruct-q3_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '3.5gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT_Q3_K_M = {
  name: 'qwen2.5:7b-instruct-q3_K_M',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '3.8gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT_Q3_K_L = {
  name: 'qwen2.5:7b-instruct-q3_K_L',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '4.1gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT_Q4_0 = {
  name: 'qwen2.5:7b-instruct-q4_0',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '4.4gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT_Q4_1 = {
  name: 'qwen2.5:7b-instruct-q4_1',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '4.9gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const QWEN2_5_7b_INSTRUCT_Q4_K_S = {
  name: 'qwen2.5:7b-instruct-q4_K_S',
  supports: {
    capabilities: ['tools'],
    input: ['text'],
    output: ['text'],
  },
  size: '4.5gb',
  context: 32_000,
} as const satisfies ModelMeta<any>
