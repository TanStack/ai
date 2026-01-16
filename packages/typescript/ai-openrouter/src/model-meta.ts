import type {
  OpenRouterBaseOptions,
  OpenRouterCommonOptions,
} from './text/text-provider-options'

const NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE = {
  id: 'nousresearch/hermes-3-llama-3.1-405b:free',
  name: 'Nous: Hermes 3 405B Instruct (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE = {
  id: 'meta-llama/llama-3.3-70b-instruct:free',
  name: 'Meta: Llama 3.3 70B Instruct (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_CODER_FREE = {
  id: 'qwen/qwen3-coder:free',
  name: 'Qwen: Qwen3 Coder 480B A35B (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 262000,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const TNGTECH_DEEPSEEK_R1T2_CHIMERA_FREE = {
  id: 'tngtech/deepseek-r1t2-chimera:free',
  name: 'TNG: DeepSeek R1T2 Chimera (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_4B_FREE = {
  id: 'qwen/qwen3-4b:free',
  name: 'Qwen: Qwen3 4B (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3N_E2B_IT_FREE = {
  id: 'google/gemma-3n-e2b-it:free',
  name: 'Google: Gemma 3n 2B (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_p',
    ],
  },
  context_window: 8192,
  max_output_tokens: 2048,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE = {
  id: 'meta-llama/llama-3.2-3b-instruct:free',
  name: 'Meta: Llama 3.2 3B Instruct (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3_12B_IT_FREE = {
  id: 'google/gemma-3-12b-it:free',
  name: 'Google: Gemma 3 12B (free)',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: ['max_tokens', 'seed', 'stop', 'temperature', 'top_p'],
  },
  context_window: 131072,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE = {
  id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  name: 'Venice: Uncensored (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_5_AIR_FREE = {
  id: 'z-ai/glm-4.5-air:free',
  name: 'Z.AI: GLM 4.5 Air (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 96000,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const MOONSHOTAI_KIMI_K2_FREE = {
  id: 'moonshotai/kimi-k2:free',
  name: 'MoonshotAI: Kimi K2 0711 (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'seed', 'stop', 'temperature'],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3_27B_IT_FREE = {
  id: 'google/gemma-3-27b-it:free',
  name: 'Google: Gemma 3 27B (free)',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3_4B_IT_FREE = {
  id: 'google/gemma-3-4b-it:free',
  name: 'Google: Gemma 3 4B (free)',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE = {
  id: 'nvidia/nemotron-3-nano-30b-a3b:free',
  name: 'NVIDIA: Nemotron 3 Nano 30B A3B (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const TNGTECH_TNG_R1T_CHIMERA_FREE = {
  id: 'tngtech/tng-r1t-chimera:free',
  name: 'TNG: R1T Chimera (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE = {
  id: 'nvidia/nemotron-nano-12b-v2-vl:free',
  name: 'NVIDIA: Nemotron Nano 12B 2 VL (free)',
  supports: {
    input: ['image', 'text', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const ARCEE_AI_TRINITY_MINI_FREE = {
  id: 'arcee-ai/trinity-mini:free',
  name: 'Arcee AI: Trinity Mini (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const TNGTECH_DEEPSEEK_R1T_CHIMERA_FREE = {
  id: 'tngtech/deepseek-r1t-chimera:free',
  name: 'TNG: DeepSeek R1T Chimera (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3N_E4B_IT_FREE = {
  id: 'google/gemma-3n-e4b-it:free',
  name: 'Google: Gemma 3n 4B (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_p',
    ],
  },
  context_window: 32000,
  max_output_tokens: 2048,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_0_FLASH_EXP_FREE = {
  id: 'google/gemini-2.0-flash-exp:free',
  name: 'Google: Gemini 2.0 Flash Experimental (free)',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_OSS_120B_FREE = {
  id: 'openai/gpt-oss-120b:free',
  name: 'OpenAI: gpt-oss-120b (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_OSS_20B_FREE = {
  id: 'openai/gpt-oss-20b:free',
  name: 'OpenAI: gpt-oss-20b (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT_FREE = {
  id: 'mistralai/mistral-small-3.1-24b-instruct:free',
  name: 'Mistral: Mistral Small 3.1 24B (free)',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_DEVSTRAL_2512_FREE = {
  id: 'mistralai/devstral-2512:free',
  name: 'Mistral: Devstral 2 2512 (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 262144,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const XIAOMI_MIMO_V2_FLASH_FREE = {
  id: 'xiaomi/mimo-v2-flash:free',
  name: 'Xiaomi: MiMo-V2-Flash (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const ALLENAI_MOLMO_2_8B_FREE = {
  id: 'allenai/molmo-2-8b:free',
  name: 'AllenAI: Molmo2 8B (free)',
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 36864,
  max_output_tokens: 36864,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_R1_0528_FREE = {
  id: 'deepseek/deepseek-r1-0528:free',
  name: 'DeepSeek: R1 0528 (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'temperature',
    ],
  },
  context_window: 163840,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_NEMOTRON_NANO_9B_V2_FREE = {
  id: 'nvidia/nemotron-nano-9b-v2:free',
  name: 'NVIDIA: Nemotron Nano 9B V2 (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 32000,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_1_405B_INSTRUCT_FREE = {
  id: 'meta-llama/llama-3.1-405b-instruct:free',
  name: 'Meta: Llama 3.1 405B Instruct (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'temperature',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_2_5_VL_7B_INSTRUCT_FREE = {
  id: 'qwen/qwen-2.5-vl-7b-instruct:free',
  name: 'Qwen: Qwen2.5-VL 7B Instruct (free)',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'temperature',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_7B_INSTRUCT_FREE = {
  id: 'mistralai/mistral-7b-instruct:free',
  name: 'Mistral: Mistral 7B Instruct (free)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0,
        cached: 0,
      },
      output: {
        normal: 0,
      },
    },
    image: 0,
  },
} as const
const LIQUID_LFM_2_2_6B = {
  id: 'liquid/lfm-2.2-6b',
  name: 'LiquidAI/LFM2-2.6B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.01,
        cached: 0,
      },
      output: {
        normal: 0.02,
      },
    },
    image: 0,
  },
} as const
const LIQUID_LFM2_8B_A1B = {
  id: 'liquid/lfm2-8b-a1b',
  name: 'LiquidAI/LFM2-8B-A1B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.01,
        cached: 0,
      },
      output: {
        normal: 0.02,
      },
    },
    image: 0,
  },
} as const
const IBM_GRANITE_GRANITE_4_0_H_MICRO = {
  id: 'ibm-granite/granite-4.0-h-micro',
  name: 'IBM: Granite 4.0 Micro',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.017,
        cached: 0,
      },
      output: {
        normal: 0.11,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3_4B_IT = {
  id: 'google/gemma-3-4b-it',
  name: 'Google: Gemma 3 4B',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.01703012,
        cached: 0,
      },
      output: {
        normal: 0.0681536,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_2_3B_INSTRUCT = {
  id: 'meta-llama/llama-3.2-3b-instruct',
  name: 'Meta: Llama 3.2 3B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.02,
        cached: 0,
      },
      output: {
        normal: 0.02,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_NEMO = {
  id: 'mistralai/mistral-nemo',
  name: 'Mistral: Mistral Nemo',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.02,
        cached: 0,
      },
      output: {
        normal: 0.04,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3N_E4B_IT = {
  id: 'google/gemma-3n-e4b-it',
  name: 'Google: Gemma 3n 4B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.02,
        cached: 0,
      },
      output: {
        normal: 0.04,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_1_8B_INSTRUCT = {
  id: 'meta-llama/llama-3.1-8b-instruct',
  name: 'Meta: Llama 3.1 8B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.02,
        cached: 0,
      },
      output: {
        normal: 0.05,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_GUARD_3_8B = {
  id: 'meta-llama/llama-guard-3-8b',
  name: 'Llama Guard 3 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  pricing: {
    text: {
      input: {
        normal: 0.02,
        cached: 0,
      },
      output: {
        normal: 0.06,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_OSS_20B = {
  id: 'openai/gpt-oss-20b',
  name: 'OpenAI: gpt-oss-20b',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'reasoning_effort',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.02,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const NOUSRESEARCH_DEEPHERMES_3_MISTRAL_24B_PREVIEW = {
  id: 'nousresearch/deephermes-3-mistral-24b-preview',
  name: 'Nous: DeepHermes 3 Mistral 24B Preview',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.02,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B = {
  id: 'nousresearch/hermes-2-pro-llama-3-8b',
  name: 'NousResearch: Hermes 2 Pro - Llama-3 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  max_output_tokens: 2048,
  pricing: {
    text: {
      input: {
        normal: 0.025,
        cached: 0,
      },
      output: {
        normal: 0.08,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_2_1B_INSTRUCT = {
  id: 'meta-llama/llama-3.2-1b-instruct',
  name: 'Meta: Llama 3.2 1B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.027,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_7B_INSTRUCT = {
  id: 'mistralai/mistral-7b-instruct',
  name: 'Mistral: Mistral 7B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.028,
        cached: 0,
      },
      output: {
        normal: 0.054,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_8B_INSTRUCT = {
  id: 'meta-llama/llama-3-8b-instruct',
  name: 'Meta: Llama 3 8B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.06,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_2_9B_IT = {
  id: 'google/gemma-2-9b-it',
  name: 'Google: Gemma 2 9B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.09,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN2_5_CODER_7B_INSTRUCT = {
  id: 'qwen/qwen2.5-coder-7b-instruct',
  name: 'Qwen: Qwen2.5 Coder 7B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.09,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3_12B_IT = {
  id: 'google/gemma-3-12b-it',
  name: 'Google: Gemma 3 12B',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT = {
  id: 'mistralai/mistral-small-3.1-24b-instruct',
  name: 'Mistral: Mistral Small 3.1 24B',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.11,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B = {
  id: 'deepseek/deepseek-r1-distill-llama-70b',
  name: 'DeepSeek: R1 Distill Llama 70B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.11,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_2_5_CODER_32B_INSTRUCT = {
  id: 'qwen/qwen-2.5-coder-32b-instruct',
  name: 'Qwen2.5 Coder 32B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.11,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501 = {
  id: 'mistralai/mistral-small-24b-instruct-2501',
  name: 'Mistral: Mistral Small 3',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.03,
        cached: 0,
      },
      output: {
        normal: 0.11,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_8B = {
  id: 'qwen/qwen3-8b',
  name: 'Qwen: Qwen3 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 20000,
  pricing: {
    text: {
      input: {
        normal: 0.035,
        cached: 0,
      },
      output: {
        normal: 0.138,
      },
    },
    image: 0,
  },
} as const
const AMAZON_NOVA_MICRO_V1 = {
  id: 'amazon/nova-micro-v1',
  name: 'Amazon: Nova Micro 1.0',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p'],
  },
  context_window: 128000,
  max_output_tokens: 5120,
  pricing: {
    text: {
      input: {
        normal: 0.035,
        cached: 0,
      },
      output: {
        normal: 0.14,
      },
    },
    image: 0,
  },
} as const
const COHERE_COMMAND_R7B_12_2024 = {
  id: 'cohere/command-r7b-12-2024',
  name: 'Cohere: Command R7B (12-2024)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 4000,
  pricing: {
    text: {
      input: {
        normal: 0.0375,
        cached: 0,
      },
      output: {
        normal: 0.15,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_OSS_120B = {
  id: 'openai/gpt-oss-120b',
  name: 'OpenAI: gpt-oss-120b',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'reasoning_effort',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.039,
        cached: 0,
      },
      output: {
        normal: 0.19,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_OSS_120B_EXACTO = {
  id: 'openai/gpt-oss-120b:exacto',
  name: 'OpenAI: gpt-oss-120b (exacto)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.039,
        cached: 0,
      },
      output: {
        normal: 0.19,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MINISTRAL_3B = {
  id: 'mistralai/ministral-3b',
  name: 'Mistral: Ministral 3B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.04,
        cached: 0,
      },
      output: {
        normal: 0.04,
      },
    },
    image: 0,
  },
} as const
const SAO10K_L3_LUNARIS_8B = {
  id: 'sao10k/l3-lunaris-8b',
  name: 'Sao10K: Llama 3 8B Lunaris',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.04,
        cached: 0,
      },
      output: {
        normal: 0.05,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_2_5_7B_INSTRUCT = {
  id: 'qwen/qwen-2.5-7b-instruct',
  name: 'Qwen: Qwen2.5 7B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.04,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_3_27B_IT = {
  id: 'google/gemma-3-27b-it',
  name: 'Google: Gemma 3 27B',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 96000,
  pricing: {
    text: {
      input: {
        normal: 0.04,
        cached: 0,
      },
      output: {
        normal: 0.15,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_NEMOTRON_NANO_9B_V2 = {
  id: 'nvidia/nemotron-nano-9b-v2',
  name: 'NVIDIA: Nemotron Nano 9B V2',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.04,
        cached: 0,
      },
      output: {
        normal: 0.16,
      },
    },
    image: 0,
  },
} as const
const ARCEE_AI_TRINITY_MINI = {
  id: 'arcee-ai/trinity-mini',
  name: 'Arcee AI: Trinity Mini',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.045,
        cached: 0,
      },
      output: {
        normal: 0.15,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT = {
  id: 'meta-llama/llama-3.2-11b-vision-instruct',
  name: 'Meta: Llama 3.2 11B Vision Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.049,
        cached: 0,
      },
      output: {
        normal: 0.049,
      },
    },
    image: 0.00007948,
  },
} as const
const MICROSOFT_PHI_4_MULTIMODAL_INSTRUCT = {
  id: 'microsoft/phi-4-multimodal-instruct',
  name: 'Microsoft: Phi 4 Multimodal Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0.00017685,
  },
} as const
const QWEN_QWEN_TURBO = {
  id: 'qwen/qwen-turbo',
  name: 'Qwen: Qwen-Turbo',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0.02,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_5_AIR = {
  id: 'z-ai/glm-4.5-air',
  name: 'Z.AI: GLM 4.5 Air',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0,
      },
      output: {
        normal: 0.22,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN2_5_VL_32B_INSTRUCT = {
  id: 'qwen/qwen2.5-vl-32b-instruct',
  name: 'Qwen: Qwen2.5 VL 32B Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0,
      },
      output: {
        normal: 0.22,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_14B = {
  id: 'qwen/qwen3-14b',
  name: 'Qwen: Qwen3 14B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131702,
  max_output_tokens: 40960,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0,
      },
      output: {
        normal: 0.22,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_DEVSTRAL_2512 = {
  id: 'mistralai/devstral-2512',
  name: 'Mistral: Devstral 2 2512',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0,
      },
      output: {
        normal: 0.22,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_NANO = {
  id: 'openai/gpt-5-nano',
  name: 'OpenAI: GPT-5 Nano',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0.005,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_30B_A3B_THINKING_2507 = {
  id: 'qwen/qwen3-30b-a3b-thinking-2507',
  name: 'Qwen: Qwen3 30B A3B Thinking 2507',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.051,
        cached: 0,
      },
      output: {
        normal: 0.34,
      },
    },
    image: 0,
  },
} as const
const GRYPHE_MYTHOMAX_L2_13B = {
  id: 'gryphe/mythomax-l2-13b',
  name: 'MythoMax 13B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.06,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_R1_0528_QWEN3_8B = {
  id: 'deepseek/deepseek-r1-0528-qwen3-8b',
  name: 'DeepSeek: DeepSeek R1 0528 Qwen3 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.09,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_DEVSTRAL_SMALL_2505 = {
  id: 'mistralai/devstral-small-2505',
  name: 'Mistral: Devstral Small 2505',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.12,
      },
    },
    image: 0,
  },
} as const
const MICROSOFT_PHI_4 = {
  id: 'microsoft/phi-4',
  name: 'Microsoft: Phi 4',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.14,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT = {
  id: 'mistralai/mistral-small-3.2-24b-instruct',
  name: 'Mistral: Mistral Small 3.2 24B',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.18,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_30B_A3B = {
  id: 'qwen/qwen3-30b-a3b',
  name: 'Qwen: Qwen3 30B A3B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 40960,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.22,
      },
    },
    image: 0,
  },
} as const
const AMAZON_NOVA_LITE_V1 = {
  id: 'amazon/nova-lite-v1',
  name: 'Amazon: Nova Lite 1.0',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p'],
  },
  context_window: 300000,
  max_output_tokens: 5120,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.24,
      },
    },
    image: 0.00009,
  },
} as const
const NVIDIA_NEMOTRON_3_NANO_30B_A3B = {
  id: 'nvidia/nemotron-3-nano-30b-a3b',
  name: 'NVIDIA: Nemotron 3 Nano 30B A3B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.06,
        cached: 0,
      },
      output: {
        normal: 0.24,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_CODER_30B_A3B_INSTRUCT = {
  id: 'qwen/qwen3-coder-30b-a3b-instruct',
  name: 'Qwen: Qwen3 Coder 30B A3B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.07,
        cached: 0,
      },
      output: {
        normal: 0.27,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_DEVSTRAL_SMALL = {
  id: 'mistralai/devstral-small',
  name: 'Mistral: Devstral Small 1.1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.07,
        cached: 0,
      },
      output: {
        normal: 0.28,
      },
    },
    image: 0,
  },
} as const
const BAIDU_ERNIE_4_5_21B_A3B_THINKING = {
  id: 'baidu/ernie-4.5-21b-a3b-thinking',
  name: 'Baidu: ERNIE 4.5 21B A3B Thinking',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.07,
        cached: 0,
      },
      output: {
        normal: 0.28,
      },
    },
    image: 0,
  },
} as const
const BAIDU_ERNIE_4_5_21B_A3B = {
  id: 'baidu/ernie-4.5-21b-a3b',
  name: 'Baidu: ERNIE 4.5 21B A3B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 8000,
  pricing: {
    text: {
      input: {
        normal: 0.07,
        cached: 0,
      },
      output: {
        normal: 0.28,
      },
    },
    image: 0,
  },
} as const
const MICROSOFT_PHI_4_REASONING_PLUS = {
  id: 'microsoft/phi-4-reasoning-plus',
  name: 'Microsoft: Phi 4 Reasoning Plus',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.07,
        cached: 0,
      },
      output: {
        normal: 0.35,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_235B_A22B_2507 = {
  id: 'qwen/qwen3-235b-a22b-2507',
  name: 'Qwen: Qwen3 235B A22B Instruct 2507',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'reasoning_effort',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.071,
        cached: 0,
      },
      output: {
        normal: 0.463,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_OSS_SAFEGUARD_20B = {
  id: 'openai/gpt-oss-safeguard-20b',
  name: 'OpenAI: gpt-oss-safeguard-20b',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.075,
        cached: 0.037,
      },
      output: {
        normal: 0.3,
      },
    },
    image: 0,
  },
} as const
const BYTEDANCE_SEED_SEED_1_6_FLASH = {
  id: 'bytedance-seed/seed-1.6-flash',
  name: 'ByteDance Seed: Seed 1.6 Flash',
  supports: {
    input: ['image', 'text', 'video'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.075,
        cached: 0,
      },
      output: {
        normal: 0.3,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_0_FLASH_LITE_001 = {
  id: 'google/gemini-2.0-flash-lite-001',
  name: 'Google: Gemini 2.0 Flash Lite',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.075,
        cached: 0,
      },
      output: {
        normal: 0.3,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_32B = {
  id: 'qwen/qwen3-32b',
  name: 'Qwen: Qwen3 32B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 40960,
  pricing: {
    text: {
      input: {
        normal: 0.08,
        cached: 0,
      },
      output: {
        normal: 0.24,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_4_SCOUT = {
  id: 'meta-llama/llama-4-scout',
  name: 'Meta: Llama 4 Scout',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 10000000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.08,
        cached: 0,
      },
      output: {
        normal: 0.3,
      },
    },
    image: 0.0003342,
  },
} as const
const QWEN_QWEN3_30B_A3B_INSTRUCT_2507 = {
  id: 'qwen/qwen3-30b-a3b-instruct-2507',
  name: 'Qwen: Qwen3 30B A3B Instruct 2507',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.08,
        cached: 0,
      },
      output: {
        normal: 0.33,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_8B_INSTRUCT = {
  id: 'qwen/qwen3-vl-8b-instruct',
  name: 'Qwen: Qwen3 VL 8B Instruct',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.08,
        cached: 0,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B = {
  id: 'alibaba/tongyi-deepresearch-30b-a3b',
  name: 'Tongyi DeepResearch 30B A3B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.09,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const NEVERSLEEP_LLAMA_3_1_LUMIMAID_8B = {
  id: 'neversleep/llama-3.1-lumimaid-8b',
  name: 'NeverSleep: Lumimaid v0.2 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.09,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT = {
  id: 'qwen/qwen3-next-80b-a3b-instruct',
  name: 'Qwen: Qwen3 Next 80B A3B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.09,
        cached: 0,
      },
      output: {
        normal: 1.1,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_32B = {
  id: 'z-ai/glm-4-32b',
  name: 'Z.AI: GLM 4 32B ',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'temperature', 'tool_choice', 'tools', 'top_p'],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_PIXTRAL_12B = {
  id: 'mistralai/pixtral-12b',
  name: 'Mistral: Pixtral 12B',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0.0001445,
  },
} as const
const MISTRALAI_MINISTRAL_3B_2512 = {
  id: 'mistralai/ministral-3b-2512',
  name: 'Mistral: Ministral 3 3B 2512',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const MISTRAL_MINISTRAL_8B = {
  id: 'mistral/ministral-8b',
  name: 'Mistral: Ministral 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MINISTRAL_8B = {
  id: 'mistralai/ministral-8b',
  name: 'Mistral: Ministral 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.1,
      },
    },
    image: 0,
  },
} as const
const ALLENAI_OLMO_3_7B_INSTRUCT = {
  id: 'allenai/olmo-3-7b-instruct',
  name: 'AllenAI: Olmo 3 7B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const BYTEDANCE_UI_TARS_1_5_7B = {
  id: 'bytedance/ui-tars-1.5-7b',
  name: 'ByteDance: UI-TARS 7B ',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 2048,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_SMALL_CREATIVE = {
  id: 'mistralai/mistral-small-creative',
  name: 'Mistral: Mistral Small Creative',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['tool_choice', 'tools'],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.3,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_VOXTRAL_SMALL_24B_2507 = {
  id: 'mistralai/voxtral-small-24b-2507',
  name: 'Mistral: Voxtral Small 24B 2507',
  supports: {
    input: ['text', 'audio'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.3,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_3_70B_INSTRUCT = {
  id: 'meta-llama/llama-3.3-70b-instruct',
  name: 'Meta: Llama 3.3 70B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.32,
      },
    },
    image: 0,
  },
} as const
const OPENGVLAB_INTERNVL3_78B = {
  id: 'opengvlab/internvl3-78b',
  name: 'OpenGVLab: InternVL3 78B',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.39,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4_1_NANO = {
  id: 'openai/gpt-4.1-nano',
  name: 'OpenAI: GPT-4.1 Nano',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1047576,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0.025,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_0_FLASH_001 = {
  id: 'google/gemini-2.0-flash-001',
  name: 'Google: Gemini 2.0 Flash',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0.20829999999999999,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0.0000258,
  },
} as const
const GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025 = {
  id: 'google/gemini-2.5-flash-lite-preview-09-2025',
  name: 'Google: Gemini 2.5 Flash Lite Preview 09-2025',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_5_FLASH_LITE = {
  id: 'google/gemini-2.5-flash-lite',
  name: 'Google: Gemini 2.5 Flash Lite',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65535,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0.1933,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5 = {
  id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  name: 'NVIDIA: Llama 3.3 Nemotron Super 49B V1.5',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_4B_INSTRUCT = {
  id: 'qwen/qwen3-vl-4b-instruct',
  name: 'Qwen: Qwen3 VL 4B Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 256000,
  pricing: {
    text: {
      input: {
        normal: 0.1,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1 = {
  id: 'mistralai/mistral-7b-instruct-v0.1',
  name: 'Mistral: Mistral 7B Instruct v0.1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.11,
        cached: 0,
      },
      output: {
        normal: 0.19,
      },
    },
    image: 0,
  },
} as const
const NOUSRESEARCH_HERMES_4_70B = {
  id: 'nousresearch/hermes-4-70b',
  name: 'Nous: Hermes 4 70B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.11,
        cached: 0,
      },
      output: {
        normal: 0.38,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_235B_A22B_THINKING_2507 = {
  id: 'qwen/qwen3-235b-a22b-thinking-2507',
  name: 'Qwen: Qwen3 235B A22B Thinking 2507',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.11,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const ALLENAI_OLMO_3_7B_THINK = {
  id: 'allenai/olmo-3-7b-think',
  name: 'AllenAI: Olmo 3 7B Think',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.12,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_2_5_72B_INSTRUCT = {
  id: 'qwen/qwen-2.5-72b-instruct',
  name: 'Qwen2.5 72B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.12,
        cached: 0,
      },
      output: {
        normal: 0.39,
      },
    },
    image: 0,
  },
} as const
const BAIDU_ERNIE_4_5_VL_28B_A3B = {
  id: 'baidu/ernie-4.5-vl-28b-a3b',
  name: 'Baidu: ERNIE 4.5 VL 28B A3B',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 8000,
  pricing: {
    text: {
      input: {
        normal: 0.14,
        cached: 0,
      },
      output: {
        normal: 0.56,
      },
    },
    image: 0,
  },
} as const
const TENCENT_HUNYUAN_A13B_INSTRUCT = {
  id: 'tencent/hunyuan-a13b-instruct',
  name: 'Tencent: Hunyuan A13B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.14,
        cached: 0,
      },
      output: {
        normal: 0.57,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_14B = {
  id: 'deepseek/deepseek-r1-distill-qwen-14b',
  name: 'DeepSeek: R1 Distill Qwen 14B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.15,
      },
    },
    image: 0,
  },
} as const
const ESSENTIALAI_RNJ_1_INSTRUCT = {
  id: 'essentialai/rnj-1-instruct',
  name: 'EssentialAI: Rnj 1 Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.15,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MINISTRAL_8B_2512 = {
  id: 'mistralai/ministral-8b-2512',
  name: 'Mistral: Ministral 3 8B 2512',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.15,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWQ_32B = {
  id: 'qwen/qwq-32b',
  name: 'Qwen: QwQ 32B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const ALLENAI_OLMO_3_1_32B_THINK = {
  id: 'allenai/olmo-3.1-32b-think',
  name: 'AllenAI: Olmo 3.1 32B Think',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const ALLENAI_OLMO_3_32B_THINK = {
  id: 'allenai/olmo-3-32b-think',
  name: 'AllenAI: Olmo 3 32B Think',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_30B_A3B_INSTRUCT = {
  id: 'qwen/qwen3-vl-30b-a3b-instruct',
  name: 'Qwen: Qwen3 VL 30B A3B Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_4_MAVERICK = {
  id: 'meta-llama/llama-4-maverick',
  name: 'Meta: Llama 4 Maverick',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0.0006684,
  },
} as const
const OPENAI_GPT_4O_MINI_SEARCH_PREVIEW = {
  id: 'openai/gpt-4o-mini-search-preview',
  name: 'OpenAI: GPT-4o-mini Search Preview',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'structured_outputs',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_MINI_2024_07_18 = {
  id: 'openai/gpt-4o-mini-2024-07-18',
  name: 'OpenAI: GPT-4o-mini (2024-07-18)',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0.075,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_MINI = {
  id: 'openai/gpt-4o-mini',
  name: 'OpenAI: GPT-4o-mini',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0.075,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const COHERE_COMMAND_R_08_2024 = {
  id: 'cohere/command-r-08-2024',
  name: 'Cohere: Command R (08-2024)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 4000,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN2_5_VL_72B_INSTRUCT = {
  id: 'qwen/qwen2.5-vl-72b-instruct',
  name: 'Qwen: Qwen2.5 VL 72B Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_CHAT_V3_1 = {
  id: 'deepseek/deepseek-chat-v3.1',
  name: 'DeepSeek: DeepSeek V3.1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 7168,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 0.75,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_NEXT_80B_A3B_THINKING = {
  id: 'qwen/qwen3-next-80b-a3b-thinking',
  name: 'Qwen: Qwen3 Next 80B A3B Thinking',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.15,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const THEDRUMMER_ROCINANTE_12B = {
  id: 'thedrummer/rocinante-12b',
  name: 'TheDrummer: Rocinante 12B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.17,
        cached: 0,
      },
      output: {
        normal: 0.43,
      },
    },
    image: 0,
  },
} as const
const ARCEE_AI_SPOTLIGHT = {
  id: 'arcee-ai/spotlight',
  name: 'Arcee AI: Spotlight',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 65537,
  pricing: {
    text: {
      input: {
        normal: 0.18,
        cached: 0,
      },
      output: {
        normal: 0.18,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_GUARD_4_12B = {
  id: 'meta-llama/llama-guard-4-12b',
  name: 'Meta: Llama Guard 4 12B',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  pricing: {
    text: {
      input: {
        normal: 0.18,
        cached: 0,
      },
      output: {
        normal: 0.18,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_235B_A22B = {
  id: 'qwen/qwen3-235b-a22b',
  name: 'Qwen: Qwen3 235B A22B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 40960,
  pricing: {
    text: {
      input: {
        normal: 0.18,
        cached: 0,
      },
      output: {
        normal: 0.54,
      },
    },
    image: 0,
  },
} as const
const DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_109B_MOE = {
  id: 'deepcogito/cogito-v2-preview-llama-109b-moe',
  name: 'Cogito V2 Preview Llama 109B',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.18,
        cached: 0,
      },
      output: {
        normal: 0.59,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_8B_THINKING = {
  id: 'qwen/qwen3-vl-8b-thinking',
  name: 'Qwen: Qwen3 VL 8B Thinking',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.18,
        cached: 0,
      },
      output: {
        normal: 2.1,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_CHAT_V3_0324 = {
  id: 'deepseek/deepseek-chat-v3-0324',
  name: 'DeepSeek: DeepSeek V3 0324',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.19,
        cached: 0,
      },
      output: {
        normal: 0.87,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_GUARD_2_8B = {
  id: 'meta-llama/llama-guard-2-8b',
  name: 'Meta: LlamaGuard 2 8B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_7B_INSTRUCT_V0_3 = {
  id: 'mistralai/mistral-7b-instruct-v0.3',
  name: 'Mistral: Mistral 7B Instruct v0.3',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_2_5_VL_7B_INSTRUCT = {
  id: 'qwen/qwen-2.5-vl-7b-instruct',
  name: 'Qwen: Qwen2.5-VL 7B Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0.0001445,
  },
} as const
const MISTRALAI_MINISTRAL_14B_2512 = {
  id: 'mistralai/ministral-14b-2512',
  name: 'Mistral: Ministral 3 14B 2512',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_7B_INSTRUCT_V0_2 = {
  id: 'mistralai/mistral-7b-instruct-v0.2',
  name: 'Mistral: Mistral 7B Instruct v0.2',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const AI21_JAMBA_MINI_1_7 = {
  id: 'ai21/jamba-mini-1.7',
  name: 'AI21: Jamba Mini 1.7',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const X_AI_GROK_4_1_FAST = {
  id: 'x-ai/grok-4.1-fast',
  name: 'xAI: Grok 4.1 Fast',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 2000000,
  max_output_tokens: 30000,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0.05,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const X_AI_GROK_4_FAST = {
  id: 'x-ai/grok-4-fast',
  name: 'xAI: Grok 4 Fast',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 2000000,
  max_output_tokens: 30000,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0.05,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_NEMOTRON_NANO_12B_V2_VL = {
  id: 'nvidia/nemotron-nano-12b-v2-vl',
  name: 'NVIDIA: Nemotron Nano 12B 2 VL',
  supports: {
    input: ['image', 'text', 'video'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_SABA = {
  id: 'mistralai/mistral-saba',
  name: 'Mistral: Saba',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const ALLENAI_OLMO_3_1_32B_INSTRUCT = {
  id: 'allenai/olmo-3.1-32b-instruct',
  name: 'AllenAI: Olmo 3.1 32B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.6,
      },
    },
    image: 0,
  },
} as const
const MEITUAN_LONGCAT_FLASH_CHAT = {
  id: 'meituan/longcat-flash-chat',
  name: 'Meituan: LongCat Flash Chat',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'temperature', 'top_p'],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 0.8,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_30B_A3B_THINKING = {
  id: 'qwen/qwen3-vl-30b-a3b-thinking',
  name: 'Qwen: Qwen3 VL 30B A3B Thinking',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const MINIMAX_MINIMAX_M2 = {
  id: 'minimax/minimax-m2',
  name: 'MiniMax: MiniMax M2',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 204800,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0.03,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const MINIMAX_MINIMAX_01 = {
  id: 'minimax/minimax-01',
  name: 'MiniMax: MiniMax-01',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: ['max_tokens', 'temperature', 'top_p'],
  },
  context_window: 1000000,
  max_output_tokens: 1000192,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 1.1,
      },
    },
    image: 0,
  },
} as const
const PRIME_INTELLECT_INTELLECT_3 = {
  id: 'prime-intellect/intellect-3',
  name: 'Prime Intellect: INTELLECT-3',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 1.1,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_235B_A22B_INSTRUCT = {
  id: 'qwen/qwen3-vl-235b-a22b-instruct',
  name: 'Qwen: Qwen3 VL 235B A22B Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const X_AI_GROK_CODE_FAST_1 = {
  id: 'x-ai/grok-code-fast-1',
  name: 'xAI: Grok Code Fast 1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 10000,
  pricing: {
    text: {
      input: {
        normal: 0.2,
        cached: 0.02,
      },
      output: {
        normal: 1.5,
      },
    },
    image: 0,
  },
} as const
const KWAIPILOT_KAT_CODER_PRO = {
  id: 'kwaipilot/kat-coder-pro',
  name: 'Kwaipilot: KAT-Coder-Pro V1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.207,
        cached: 0.0414,
      },
      output: {
        normal: 0.828,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_V3_2_EXP = {
  id: 'deepseek/deepseek-v3.2-exp',
  name: 'DeepSeek: DeepSeek V3.2 Exp',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.21,
        cached: 0,
      },
      output: {
        normal: 0.32,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_VL_PLUS = {
  id: 'qwen/qwen-vl-plus',
  name: 'Qwen: Qwen VL Plus',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'top_p',
    ],
  },
  context_window: 7500,
  max_output_tokens: 1500,
  pricing: {
    text: {
      input: {
        normal: 0.21,
        cached: 0,
      },
      output: {
        normal: 0.63,
      },
    },
    image: 0.0002688,
  },
} as const
const DEEPSEEK_DEEPSEEK_V3_1_TERMINUS_EXACTO = {
  id: 'deepseek/deepseek-v3.1-terminus:exacto',
  name: 'DeepSeek: DeepSeek V3.1 Terminus (exacto)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.21,
        cached: 0.168,
      },
      output: {
        normal: 0.79,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_V3_1_TERMINUS = {
  id: 'deepseek/deepseek-v3.1-terminus',
  name: 'DeepSeek: DeepSeek V3.1 Terminus',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.21,
        cached: 0.168,
      },
      output: {
        normal: 0.79,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_CODER = {
  id: 'qwen/qwen3-coder',
  name: 'Qwen: Qwen3 Coder 480B A35B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.22,
        cached: 0,
      },
      output: {
        normal: 0.95,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_CODER_EXACTO = {
  id: 'qwen/qwen3-coder:exacto',
  name: 'Qwen: Qwen3 Coder 480B A35B (exacto)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.22,
        cached: 0,
      },
      output: {
        normal: 1.8,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_TINY = {
  id: 'mistralai/mistral-tiny',
  name: 'Mistral Tiny',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0,
      },
      output: {
        normal: 0.25,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_V3_2 = {
  id: 'deepseek/deepseek-v3.2',
  name: 'DeepSeek: DeepSeek V3.2',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0,
      },
      output: {
        normal: 0.38,
      },
    },
    image: 0,
  },
} as const
const TNGTECH_DEEPSEEK_R1T2_CHIMERA = {
  id: 'tngtech/deepseek-r1t2-chimera',
  name: 'TNG: DeepSeek R1T2 Chimera',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  max_output_tokens: 163840,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0,
      },
      output: {
        normal: 0.85,
      },
    },
    image: 0,
  },
} as const
const TNGTECH_TNG_R1T_CHIMERA = {
  id: 'tngtech/tng-r1t-chimera',
  name: 'TNG: R1T Chimera',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0,
      },
      output: {
        normal: 0.85,
      },
    },
    image: 0,
  },
} as const
const INCEPTION_MERCURY = {
  id: 'inception/mercury',
  name: 'Inception: Mercury',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const INCEPTION_MERCURY_CODER = {
  id: 'inception/mercury-coder',
  name: 'Inception: Mercury Coder',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_3_HAIKU = {
  id: 'anthropic/claude-3-haiku',
  name: 'Anthropic: Claude 3 Haiku',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'max_tokens',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0.32999999999999996,
      },
      output: {
        normal: 1.25,
      },
    },
    image: 0.0004,
  },
} as const
const OPENAI_GPT_5_MINI = {
  id: 'openai/gpt-5-mini',
  name: 'OpenAI: GPT-5 Mini',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0.025,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_1_CODEX_MINI = {
  id: 'openai/gpt-5.1-codex-mini',
  name: 'OpenAI: GPT-5.1-Codex-Mini',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0.025,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const BYTEDANCE_SEED_SEED_1_6 = {
  id: 'bytedance-seed/seed-1.6',
  name: 'ByteDance Seed: Seed 1.6',
  supports: {
    input: ['image', 'text', 'video'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.25,
        cached: 0,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B = {
  id: 'deepseek/deepseek-r1-distill-qwen-32b',
  name: 'DeepSeek: R1 Distill Qwen 32B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.27,
        cached: 0,
      },
      output: {
        normal: 0.27,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_V3_2_SPECIALE = {
  id: 'deepseek/deepseek-v3.2-speciale',
  name: 'DeepSeek: DeepSeek V3.2 Speciale',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.27,
        cached: 0,
      },
      output: {
        normal: 0.41,
      },
    },
    image: 0,
  },
} as const
const NEX_AGI_DEEPSEEK_V3_1_NEX_N1 = {
  id: 'nex-agi/deepseek-v3.1-nex-n1',
  name: 'Nex AGI: DeepSeek V3.1 Nex N1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'response_format',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  max_output_tokens: 163840,
  pricing: {
    text: {
      input: {
        normal: 0.27,
        cached: 0,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const MINIMAX_MINIMAX_M2_1 = {
  id: 'minimax/minimax-m2.1',
  name: 'MiniMax: MiniMax M2.1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 204800,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.27,
        cached: 0,
      },
      output: {
        normal: 1.12,
      },
    },
    image: 0,
  },
} as const
const BAIDU_ERNIE_4_5_300B_A47B = {
  id: 'baidu/ernie-4.5-300b-a47b',
  name: 'Baidu: ERNIE 4.5 300B A47B ',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 12000,
  pricing: {
    text: {
      input: {
        normal: 0.28,
        cached: 0,
      },
      output: {
        normal: 1.1,
      },
    },
    image: 0,
  },
} as const
const MOONSHOTAI_KIMI_DEV_72B = {
  id: 'moonshotai/kimi-dev-72b',
  name: 'MoonshotAI: Kimi Dev 72B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.29,
        cached: 0,
      },
      output: {
        normal: 1.15,
      },
    },
    image: 0,
  },
} as const
const NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B = {
  id: 'nousresearch/hermes-3-llama-3.1-70b',
  name: 'Nous: Hermes 3 70B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 0.3,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_70B_INSTRUCT = {
  id: 'meta-llama/llama-3-70b-instruct',
  name: 'Meta: Llama 3 70B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const THEDRUMMER_CYDONIA_24B_V4_1 = {
  id: 'thedrummer/cydonia-24b-v4.1',
  name: 'TheDrummer: Cydonia 24B V4.1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const X_AI_GROK_3_MINI = {
  id: 'x-ai/grok-3-mini',
  name: 'xAI: Grok 3 Mini',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0.075,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const X_AI_GROK_3_MINI_BETA = {
  id: 'x-ai/grok-3-mini-beta',
  name: 'xAI: Grok 3 Mini Beta',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0.075,
      },
      output: {
        normal: 0.5,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_6V = {
  id: 'z-ai/glm-4.6v',
  name: 'Z.AI: GLM 4.6V',
  supports: {
    input: ['image', 'text', 'video'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 0.9,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_CODESTRAL_2508 = {
  id: 'mistralai/codestral-2508',
  name: 'Mistral: Codestral 2508',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 0.9,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_CHAT = {
  id: 'deepseek/deepseek-chat',
  name: 'DeepSeek: DeepSeek V3',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 163840,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const TNGTECH_DEEPSEEK_R1T_CHIMERA = {
  id: 'tngtech/deepseek-r1t-chimera',
  name: 'TNG: DeepSeek R1T Chimera',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  max_output_tokens: 163840,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_CODER_FLASH = {
  id: 'qwen/qwen3-coder-flash',
  name: 'Qwen: Qwen3 Coder Flash',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0.08,
      },
      output: {
        normal: 1.5,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_5_FLASH_IMAGE_PREVIEW = {
  id: 'google/gemini-2.5-flash-image-preview',
  name: 'Google: Gemini 2.5 Flash Image Preview (Nano Banana)',
  supports: {
    input: ['image', 'text'],
    output: ['image', 'text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 2.5,
      },
    },
    image: 0.001238,
  },
} as const
const GOOGLE_GEMINI_2_5_FLASH_PREVIEW_09_2025 = {
  id: 'google/gemini-2.5-flash-preview-09-2025',
  name: 'Google: Gemini 2.5 Flash Preview 09-2025',
  supports: {
    input: ['image', 'document', 'text', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0.4583,
      },
      output: {
        normal: 2.5,
      },
    },
    image: 0.001238,
  },
} as const
const GOOGLE_GEMINI_2_5_FLASH_IMAGE = {
  id: 'google/gemini-2.5-flash-image',
  name: 'Google: Gemini 2.5 Flash Image (Nano Banana)',
  supports: {
    input: ['image', 'text'],
    output: ['image', 'text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 2.5,
      },
    },
    image: 0.001238,
  },
} as const
const AMAZON_NOVA_2_LITE_V1 = {
  id: 'amazon/nova-2-lite-v1',
  name: 'Amazon: Nova 2 Lite',
  supports: {
    input: ['text', 'image', 'video', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 65535,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0,
      },
      output: {
        normal: 2.5,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_5_FLASH = {
  id: 'google/gemini-2.5-flash',
  name: 'Google: Gemini 2.5 Flash',
  supports: {
    input: ['document', 'image', 'text', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65535,
  pricing: {
    text: {
      input: {
        normal: 0.3,
        cached: 0.4133,
      },
      output: {
        normal: 2.5,
      },
    },
    image: 0.001238,
  },
} as const
const Z_AI_GLM_4_6 = {
  id: 'z-ai/glm-4.6',
  name: 'Z.AI: GLM 4.6',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.35,
        cached: 0,
      },
      output: {
        normal: 1.5,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_5 = {
  id: 'z-ai/glm-4.5',
  name: 'Z.AI: GLM 4.5',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.35,
        cached: 0,
      },
      output: {
        normal: 1.55,
      },
    },
    image: 0,
  },
} as const
const MOONSHOTAI_KIMI_K2_0905 = {
  id: 'moonshotai/kimi-k2-0905',
  name: 'MoonshotAI: Kimi K2 0905',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.39,
        cached: 0,
      },
      output: {
        normal: 1.9,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_1_70B_INSTRUCT = {
  id: 'meta-llama/llama-3.1-70b-instruct',
  name: 'Meta: Llama 3.1 70B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const THEDRUMMER_UNSLOPNEMO_12B = {
  id: 'thedrummer/unslopnemo-12b',
  name: 'TheDrummer: UnslopNemo 12B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_PLUS_2025_07_28 = {
  id: 'qwen/qwen-plus-2025-07-28',
  name: 'Qwen: Qwen Plus 0728',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_PLUS = {
  id: 'qwen/qwen-plus',
  name: 'Qwen: Qwen-Plus',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0.16,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_7 = {
  id: 'z-ai/glm-4.7',
  name: 'Z.AI: GLM 4.7',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 65535,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 1.5,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4_1_MINI = {
  id: 'openai/gpt-4.1-mini',
  name: 'OpenAI: GPT-4.1 Mini',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1047576,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0.1,
      },
      output: {
        normal: 1.6,
      },
    },
    image: 0,
  },
} as const
const MOONSHOTAI_KIMI_K2_THINKING = {
  id: 'moonshotai/kimi-k2-thinking',
  name: 'MoonshotAI: Kimi K2 Thinking',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 262144,
  max_output_tokens: 65535,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 1.75,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_DEVSTRAL_MEDIUM = {
  id: 'mistralai/devstral-medium',
  name: 'Mistral: Devstral Medium',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_MEDIUM_3 = {
  id: 'mistralai/mistral-medium-3',
  name: 'Mistral: Mistral Medium 3',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_MEDIUM_3_1 = {
  id: 'mistralai/mistral-medium-3.1',
  name: 'Mistral: Mistral Medium 3.1',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const MINIMAX_MINIMAX_M1 = {
  id: 'minimax/minimax-m1',
  name: 'MiniMax: MiniMax M1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 40000,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 2.2,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_PLUS_2025_07_28_THINKING = {
  id: 'qwen/qwen-plus-2025-07-28:thinking',
  name: 'Qwen: Qwen Plus 0728 (thinking)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.4,
        cached: 0,
      },
      output: {
        normal: 4,
      },
    },
    image: 0,
  },
} as const
const BAIDU_ERNIE_4_5_VL_424B_A47B = {
  id: 'baidu/ernie-4.5-vl-424b-a47b',
  name: 'Baidu: ERNIE 4.5 VL 424B A47B ',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16000,
  pricing: {
    text: {
      input: {
        normal: 0.42,
        cached: 0,
      },
      output: {
        normal: 1.25,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_6_EXACTO = {
  id: 'z-ai/glm-4.6:exacto',
  name: 'Z.AI: GLM 4.6 (exacto)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.44,
        cached: 0,
      },
      output: {
        normal: 1.76,
      },
    },
    image: 0,
  },
} as const
const UNDI95_REMM_SLERP_L2_13B = {
  id: 'undi95/remm-slerp-l2-13b',
  name: 'ReMM SLERP 13B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.45,
        cached: 0,
      },
      output: {
        normal: 0.65,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_R1_0528 = {
  id: 'deepseek/deepseek-r1-0528',
  name: 'DeepSeek: R1 0528',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 163840,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.45,
        cached: 0,
      },
      output: {
        normal: 2.15,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_235B_A22B_THINKING = {
  id: 'qwen/qwen3-vl-235b-a22b-thinking',
  name: 'Qwen: Qwen3 VL 235B A22B Thinking',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.45,
        cached: 0,
      },
      output: {
        normal: 3.5,
      },
    },
    image: 0,
  },
} as const
const MICROSOFT_WIZARDLM_2_8X22B = {
  id: 'microsoft/wizardlm-2-8x22b',
  name: 'WizardLM-2 8x22B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.48,
        cached: 0,
      },
      output: {
        normal: 0.48,
      },
    },
    image: 0,
  },
} as const
const ARCEE_AI_CODER_LARGE = {
  id: 'arcee-ai/coder-large',
  name: 'Arcee AI: Coder Large',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.5,
        cached: 0,
      },
      output: {
        normal: 0.8,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_LARGE_2512 = {
  id: 'mistralai/mistral-large-2512',
  name: 'Mistral: Mistral Large 3 2512',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  pricing: {
    text: {
      input: {
        normal: 0.5,
        cached: 0,
      },
      output: {
        normal: 1.5,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_VL_32B_INSTRUCT = {
  id: 'qwen/qwen3-vl-32b-instruct',
  name: 'Qwen: Qwen3 VL 32B Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.5,
        cached: 0,
      },
      output: {
        normal: 1.5,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_3_5_TURBO = {
  id: 'openai/gpt-3.5-turbo',
  name: 'OpenAI: GPT-3.5 Turbo',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 16385,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.5,
        cached: 0,
      },
      output: {
        normal: 1.5,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_PROVER_V2 = {
  id: 'deepseek/deepseek-prover-v2',
  name: 'DeepSeek: DeepSeek Prover V2',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  pricing: {
    text: {
      input: {
        normal: 0.5,
        cached: 0,
      },
      output: {
        normal: 2.18,
      },
    },
    image: 0,
  },
} as const
const MOONSHOTAI_KIMI_K2 = {
  id: 'moonshotai/kimi-k2',
  name: 'MoonshotAI: Kimi K2 0711',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.5,
        cached: 0,
      },
      output: {
        normal: 2.4,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_3_FLASH_PREVIEW = {
  id: 'google/gemini-3-flash-preview',
  name: 'Google: Gemini 3 Flash Preview',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65535,
  pricing: {
    text: {
      input: {
        normal: 0.5,
        cached: 0.05,
      },
      output: {
        normal: 3,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MIXTRAL_8X7B_INSTRUCT = {
  id: 'mistralai/mixtral-8x7b-instruct',
  name: 'Mistral: Mixtral 8x7B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.54,
        cached: 0,
      },
      output: {
        normal: 0.54,
      },
    },
    image: 0,
  },
} as const
const THEDRUMMER_SKYFALL_36B_V2 = {
  id: 'thedrummer/skyfall-36b-v2',
  name: 'TheDrummer: Skyfall 36B V2',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.55,
        cached: 0,
      },
      output: {
        normal: 0.8,
      },
    },
    image: 0,
  },
} as const
const MINIMAX_MINIMAX_M1_80K = {
  id: 'minimax/minimax-m1-80k',
  name: 'MiniMax: MiniMax-M1-80k',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 40000,
  pricing: {
    text: {
      input: {
        normal: 0.55,
        cached: 0,
      },
      output: {
        normal: 2.2,
      },
    },
    image: 0,
  },
} as const
const STEPFUN_AI_STEP3 = {
  id: 'stepfun-ai/step3',
  name: 'StepFun: Step3',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 0.57,
        cached: 0,
      },
      output: {
        normal: 1.42,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_LLAMA_3_1_NEMOTRON_ULTRA_253B_V1 = {
  id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  name: 'NVIDIA: Llama 3.1 Nemotron Ultra 253B v1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.6,
        cached: 0,
      },
      output: {
        normal: 1.8,
      },
    },
    image: 0,
  },
} as const
const Z_AI_GLM_4_5V = {
  id: 'z-ai/glm-4.5v',
  name: 'Z.AI: GLM 4.5V',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.6,
        cached: 0.11,
      },
      output: {
        normal: 1.8,
      },
    },
    image: 0,
  },
} as const
const MOONSHOTAI_KIMI_K2_0905_EXACTO = {
  id: 'moonshotai/kimi-k2-0905:exacto',
  name: 'MoonshotAI: Kimi K2 0905 (exacto)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 262144,
  pricing: {
    text: {
      input: {
        normal: 0.6,
        cached: 0,
      },
      output: {
        normal: 2.5,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMMA_2_27B_IT = {
  id: 'google/gemma-2-27b-it',
  name: 'Google: Gemma 2 27B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.65,
        cached: 0,
      },
      output: {
        normal: 0.65,
      },
    },
    image: 0,
  },
} as const
const SAO10K_L3_3_EURYALE_70B = {
  id: 'sao10k/l3.3-euryale-70b',
  name: 'Sao10K: Llama 3.3 Euryale 70B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.65,
        cached: 0,
      },
      output: {
        normal: 0.75,
      },
    },
    image: 0,
  },
} as const
const SAO10K_L3_1_EURYALE_70B = {
  id: 'sao10k/l3.1-euryale-70b',
  name: 'Sao10K: Llama 3.1 Euryale 70B v2.2',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.65,
        cached: 0,
      },
      output: {
        normal: 0.75,
      },
    },
    image: 0,
  },
} as const
const AION_LABS_AION_1_0_MINI = {
  id: 'aion-labs/aion-1.0-mini',
  name: 'AionLabs: Aion-1.0-Mini',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'temperature',
      'top_p',
    ],
  },
  context_window: 16384,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.7,
        cached: 0,
      },
      output: {
        normal: 1.4,
      },
    },
    image: 0,
  },
} as const
const DEEPSEEK_DEEPSEEK_R1 = {
  id: 'deepseek/deepseek-r1',
  name: 'DeepSeek: R1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 163840,
  max_output_tokens: 163840,
  pricing: {
    text: {
      input: {
        normal: 0.7,
        cached: 0,
      },
      output: {
        normal: 2.4,
      },
    },
    image: 0,
  },
} as const
const MANCER_WEAVER = {
  id: 'mancer/weaver',
  name: 'Mancer: Weaver (alpha)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 8000,
  max_output_tokens: 2000,
  pricing: {
    text: {
      input: {
        normal: 0.75,
        cached: 0,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const ARCEE_AI_VIRTUOSO_LARGE = {
  id: 'arcee-ai/virtuoso-large',
  name: 'Arcee AI: Virtuoso Large',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 0.75,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const MORPH_MORPH_V3_FAST = {
  id: 'morph/morph-v3-fast',
  name: 'Morph: Morph V3 Fast',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature'],
  },
  context_window: 81920,
  max_output_tokens: 38000,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY = {
  id: 'alfredpros/codellama-7b-instruct-solidity',
  name: 'AlfredPros: CodeLLaMa 7B Instruct Solidity',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 4096,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const ELEUTHERAI_LLEMMA_7B = {
  id: 'eleutherai/llemma_7b',
  name: 'EleutherAI: Llemma 7b',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 4096,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const AION_LABS_AION_RP_LLAMA_3_1_8B = {
  id: 'aion-labs/aion-rp-llama-3.1-8b',
  name: 'AionLabs: Aion-RP 1.0 (8B)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'temperature', 'top_p'],
  },
  context_window: 32768,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 0,
      },
      output: {
        normal: 1.6,
      },
    },
    image: 0,
  },
} as const
const AMAZON_NOVA_PRO_V1 = {
  id: 'amazon/nova-pro-v1',
  name: 'Amazon: Nova Pro 1.0',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p'],
  },
  context_window: 300000,
  max_output_tokens: 5120,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 0,
      },
      output: {
        normal: 3.2,
      },
    },
    image: 0.0012,
  },
} as const
const QWEN_QWEN_VL_MAX = {
  id: 'qwen/qwen-vl-max',
  name: 'Qwen: Qwen VL Max',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 0,
      },
      output: {
        normal: 3.2,
      },
    },
    image: 0.001024,
  },
} as const
const ANTHROPIC_CLAUDE_3_5_HAIKU = {
  id: 'anthropic/claude-3.5-haiku',
  name: 'Anthropic: Claude 3.5 Haiku',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'max_tokens',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 1.08,
      },
      output: {
        normal: 4,
      },
    },
    image: 0,
  },
} as const
const RELACE_RELACE_APPLY_3 = {
  id: 'relace/relace-apply-3',
  name: 'Relace: Relace Apply 3',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'seed', 'stop'],
  },
  context_window: 256000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.85,
        cached: 0,
      },
      output: {
        normal: 1.25,
      },
    },
    image: 0,
  },
} as const
const SWITCHPOINT_ROUTER = {
  id: 'switchpoint/router',
  name: 'Switchpoint Router',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.85,
        cached: 0,
      },
      output: {
        normal: 3.4,
      },
    },
    image: 0,
  },
} as const
const DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_70B = {
  id: 'deepcogito/cogito-v2-preview-llama-70b',
  name: 'Deep Cogito: Cogito V2 Preview Llama 70B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.88,
        cached: 0,
      },
      output: {
        normal: 0.88,
      },
    },
    image: 0,
  },
} as const
const MORPH_MORPH_V3_LARGE = {
  id: 'morph/morph-v3-large',
  name: 'Morph: Morph V3 Large',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature'],
  },
  context_window: 81920,
  max_output_tokens: 131072,
  pricing: {
    text: {
      input: {
        normal: 0.9,
        cached: 0,
      },
      output: {
        normal: 1.9,
      },
    },
    image: 0,
  },
} as const
const ARCEE_AI_MAESTRO_REASONING = {
  id: 'arcee-ai/maestro-reasoning',
  name: 'Arcee AI: Maestro Reasoning',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 32000,
  pricing: {
    text: {
      input: {
        normal: 0.9,
        cached: 0,
      },
      output: {
        normal: 3.3,
      },
    },
    image: 0,
  },
} as const
const PERPLEXITY_SONAR = {
  id: 'perplexity/sonar',
  name: 'Perplexity: Sonar',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 127072,
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 0,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B = {
  id: 'nousresearch/hermes-3-llama-3.1-405b',
  name: 'Nous: Hermes 3 405B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 0,
      },
      output: {
        normal: 1,
      },
    },
    image: 0,
  },
} as const
const NEVERSLEEP_NOROMAID_20B = {
  id: 'neversleep/noromaid-20b',
  name: 'Noromaid 20B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 8192,
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 0,
      },
      output: {
        normal: 1.75,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_3_5_TURBO_0613 = {
  id: 'openai/gpt-3.5-turbo-0613',
  name: 'OpenAI: GPT-3.5 Turbo (older v0613)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 4095,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 0,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const RELACE_RELACE_SEARCH = {
  id: 'relace/relace-search',
  name: 'Relace: Relace Search',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 0,
      },
      output: {
        normal: 3,
      },
    },
    image: 0,
  },
} as const
const NOUSRESEARCH_HERMES_4_405B = {
  id: 'nousresearch/hermes-4-405b',
  name: 'Nous: Hermes 4 405B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 0,
      },
      output: {
        normal: 3,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_CODER_PLUS = {
  id: 'qwen/qwen3-coder-plus',
  name: 'Qwen: Qwen3 Coder Plus',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 0.1,
      },
      output: {
        normal: 5,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_HAIKU_4_5 = {
  id: 'anthropic/claude-haiku-4.5',
  name: 'Anthropic: Claude Haiku 4.5',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 1,
        cached: 1.35,
      },
      output: {
        normal: 5,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O4_MINI_HIGH = {
  id: 'openai/o4-mini-high',
  name: 'OpenAI: o4 Mini High',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 1.1,
        cached: 0.275,
      },
      output: {
        normal: 4.4,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O3_MINI_HIGH = {
  id: 'openai/o3-mini-high',
  name: 'OpenAI: o3 Mini High',
  supports: {
    input: ['text', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 1.1,
        cached: 0.55,
      },
      output: {
        normal: 4.4,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O3_MINI = {
  id: 'openai/o3-mini',
  name: 'OpenAI: o3 Mini',
  supports: {
    input: ['text', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 1.1,
        cached: 0.55,
      },
      output: {
        normal: 4.4,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O4_MINI = {
  id: 'openai/o4-mini',
  name: 'OpenAI: o4 Mini',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 1.1,
        cached: 0.275,
      },
      output: {
        normal: 4.4,
      },
    },
    image: 0,
  },
} as const
const NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT = {
  id: 'nvidia/llama-3.1-nemotron-70b-instruct',
  name: 'NVIDIA: Llama 3.1 Nemotron 70B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 1.2,
        cached: 0,
      },
      output: {
        normal: 1.2,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN3_MAX = {
  id: 'qwen/qwen3-max',
  name: 'Qwen: Qwen3 Max',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 1.2,
        cached: 0.24,
      },
      output: {
        normal: 6,
      },
    },
    image: 0,
  },
} as const
const DEEPCOGITO_COGITO_V2_1_671B = {
  id: 'deepcogito/cogito-v2.1-671b',
  name: 'Deep Cogito: Cogito v2.1 671B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0,
      },
      output: {
        normal: 1.25,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_5_PRO_PREVIEW = {
  id: 'google/gemini-2.5-pro-preview',
  name: 'Google: Gemini 2.5 Pro Preview 06-05',
  supports: {
    input: ['document', 'image', 'text', 'audio'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 1.935,
      },
      output: {
        normal: 10,
      },
    },
    image: 0.00516,
  },
} as const
const OPENAI_GPT_5_CHAT = {
  id: 'openai/gpt-5-chat',
  name: 'OpenAI: GPT-5 Chat',
  supports: {
    input: ['document', 'image', 'text'],
    output: ['text'],
    supports: ['max_tokens', 'response_format', 'seed', 'structured_outputs'],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0.125,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06 = {
  id: 'google/gemini-2.5-pro-preview-05-06',
  name: 'Google: Gemini 2.5 Pro Preview 05-06',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65535,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 1.935,
      },
      output: {
        normal: 10,
      },
    },
    image: 0.00516,
  },
} as const
const OPENAI_GPT_5 = {
  id: 'openai/gpt-5',
  name: 'OpenAI: GPT-5',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0.125,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_CODEX = {
  id: 'openai/gpt-5-codex',
  name: 'OpenAI: GPT-5 Codex',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0.125,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_1_CODEX = {
  id: 'openai/gpt-5.1-codex',
  name: 'OpenAI: GPT-5.1-Codex',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0.125,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_1_CHAT = {
  id: 'openai/gpt-5.1-chat',
  name: 'OpenAI: GPT-5.1 Chat',
  supports: {
    input: ['document', 'image', 'text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0.125,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_2_5_PRO = {
  id: 'google/gemini-2.5-pro',
  name: 'Google: Gemini 2.5 Pro',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 1.75,
      },
      output: {
        normal: 10,
      },
    },
    image: 0.00516,
  },
} as const
const OPENAI_GPT_5_1_CODEX_MAX = {
  id: 'openai/gpt-5.1-codex-max',
  name: 'OpenAI: GPT-5.1-Codex-Max',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0.125,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_1 = {
  id: 'openai/gpt-5.1',
  name: 'OpenAI: GPT-5.1',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 1.25,
        cached: 0.125,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const SAO10K_L3_EURYALE_70B = {
  id: 'sao10k/l3-euryale-70b',
  name: 'Sao10k: Llama 3 Euryale 70B v2.1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 8192,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 1.48,
        cached: 0,
      },
      output: {
        normal: 1.48,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_3_5_TURBO_INSTRUCT = {
  id: 'openai/gpt-3.5-turbo-instruct',
  name: 'OpenAI: GPT-3.5 Turbo Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 4095,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 1.5,
        cached: 0,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const OPENAI_CODEX_MINI = {
  id: 'openai/codex-mini',
  name: 'OpenAI: Codex Mini',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 1.5,
        cached: 0.375,
      },
      output: {
        normal: 6,
      },
    },
    image: 0,
  },
} as const
const QWEN_QWEN_MAX = {
  id: 'qwen/qwen-max',
  name: 'Qwen: Qwen-Max ',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 1.6,
        cached: 0.64,
      },
      output: {
        normal: 6.4,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_2 = {
  id: 'openai/gpt-5.2',
  name: 'OpenAI: GPT-5.2',
  supports: {
    input: ['document', 'image', 'text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 1.75,
        cached: 0.175,
      },
      output: {
        normal: 14,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_2_CHAT = {
  id: 'openai/gpt-5.2-chat',
  name: 'OpenAI: GPT-5.2 Chat',
  supports: {
    input: ['document', 'image', 'text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 1.75,
        cached: 0.175,
      },
      output: {
        normal: 14,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_LARGE_2411 = {
  id: 'mistralai/mistral-large-2411',
  name: 'Mistral Large 2411',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 6,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_PIXTRAL_LARGE_2411 = {
  id: 'mistralai/pixtral-large-2411',
  name: 'Mistral: Pixtral Large 2411',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 6,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MIXTRAL_8X22B_INSTRUCT = {
  id: 'mistralai/mixtral-8x22b-instruct',
  name: 'Mistral: Mixtral 8x22B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 65536,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 6,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_LARGE = {
  id: 'mistralai/mistral-large',
  name: 'Mistral Large',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 6,
      },
    },
    image: 0,
  },
} as const
const MISTRALAI_MISTRAL_LARGE_2407 = {
  id: 'mistralai/mistral-large-2407',
  name: 'Mistral Large 2407',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 6,
      },
    },
    image: 0,
  },
} as const
const PERPLEXITY_SONAR_DEEP_RESEARCH = {
  id: 'perplexity/sonar-deep-research',
  name: 'Perplexity: Sonar Deep Research',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const PERPLEXITY_SONAR_REASONING_PRO = {
  id: 'perplexity/sonar-reasoning-pro',
  name: 'Perplexity: Sonar Reasoning Pro',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4_1 = {
  id: 'openai/gpt-4.1',
  name: 'OpenAI: GPT-4.1',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1047576,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0.5,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O3 = {
  id: 'openai/o3',
  name: 'OpenAI: o3',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0.5,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const AI21_JAMBA_LARGE_1_7 = {
  id: 'ai21/jamba-large-1.7',
  name: 'AI21: Jamba Large 1.7',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O4_MINI_DEEP_RESEARCH = {
  id: 'openai/o4-mini-deep-research',
  name: 'OpenAI: o4 Mini Deep Research',
  supports: {
    input: ['document', 'image', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0.5,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW = {
  id: 'google/gemini-3-pro-image-preview',
  name: 'Google: Nano Banana Pro (Gemini 3 Pro Image Preview)',
  supports: {
    input: ['image', 'text'],
    output: ['image', 'text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_p',
    ],
  },
  context_window: 65536,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 0,
      },
      output: {
        normal: 12,
      },
    },
    image: 0.067,
  },
} as const
const GOOGLE_GEMINI_3_PRO_PREVIEW = {
  id: 'google/gemini-3-pro-preview',
  name: 'Google: Gemini 3 Pro Preview',
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 1048576,
  max_output_tokens: 65536,
  pricing: {
    text: {
      input: {
        normal: 2,
        cached: 2.575,
      },
      output: {
        normal: 12,
      },
    },
    image: 0.008256,
  },
} as const
const OPENAI_GPT_5_IMAGE_MINI = {
  id: 'openai/gpt-5-image-mini',
  name: 'OpenAI: GPT-5 Image Mini',
  supports: {
    input: ['document', 'image', 'text'],
    output: ['image', 'text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0.25,
      },
      output: {
        normal: 2,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_SEARCH_PREVIEW = {
  id: 'openai/gpt-4o-search-preview',
  name: 'OpenAI: GPT-4o Search Preview',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'structured_outputs',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_AUDIO_PREVIEW = {
  id: 'openai/gpt-4o-audio-preview',
  name: 'OpenAI: GPT-4o Audio',
  supports: {
    input: ['audio', 'text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const COHERE_COMMAND_A = {
  id: 'cohere/command-a',
  name: 'Cohere: Command A',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 256000,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const INFLECTION_INFLECTION_3_PI = {
  id: 'inflection/inflection-3-pi',
  name: 'Inflection: Inflection 3 Pi',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature', 'top_p'],
  },
  context_window: 8000,
  max_output_tokens: 1024,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const INFLECTION_INFLECTION_3_PRODUCTIVITY = {
  id: 'inflection/inflection-3-productivity',
  name: 'Inflection: Inflection 3 Productivity',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature', 'top_p'],
  },
  context_window: 8000,
  max_output_tokens: 1024,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_2024_11_20 = {
  id: 'openai/gpt-4o-2024-11-20',
  name: 'OpenAI: GPT-4o (2024-11-20)',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 1.25,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_2024_08_06 = {
  id: 'openai/gpt-4o-2024-08-06',
  name: 'OpenAI: GPT-4o (2024-08-06)',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 1.25,
      },
      output: {
        normal: 10,
      },
    },
    image: 0.003613,
  },
} as const
const OPENAI_GPT_4O = {
  id: 'openai/gpt-4o',
  name: 'OpenAI: GPT-4o',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 1.25,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const COHERE_COMMAND_R_PLUS_08_2024 = {
  id: 'cohere/command-r-plus-08-2024',
  name: 'Cohere: Command R+ (08-2024)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 4000,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const AMAZON_NOVA_PREMIER_V1 = {
  id: 'amazon/nova-premier-v1',
  name: 'Amazon: Nova Premier 1.0',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p'],
  },
  context_window: 1000000,
  max_output_tokens: 32000,
  pricing: {
    text: {
      input: {
        normal: 2.5,
        cached: 0.625,
      },
      output: {
        normal: 12.5,
      },
    },
    image: 0,
  },
} as const
const SAO10K_L3_1_70B_HANAMI_X1 = {
  id: 'sao10k/l3.1-70b-hanami-x1',
  name: 'Sao10K: Llama 3.1 70B Hanami x1',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 16000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0,
      },
      output: {
        normal: 3,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_3_5_TURBO_16K = {
  id: 'openai/gpt-3.5-turbo-16k',
  name: 'OpenAI: GPT-3.5 Turbo 16k',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 16385,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0,
      },
      output: {
        normal: 4,
      },
    },
    image: 0,
  },
} as const
const ANTHRACITE_ORG_MAGNUM_V4_72B = {
  id: 'anthracite-org/magnum-v4-72b',
  name: 'Magnum v4 72B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 2048,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0,
      },
      output: {
        normal: 5,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_SONNET_4_5 = {
  id: 'anthropic/claude-sonnet-4.5',
  name: 'Anthropic: Claude Sonnet 4.5',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 4.05,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const X_AI_GROK_3 = {
  id: 'x-ai/grok-3',
  name: 'xAI: Grok 3',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0.75,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_3_7_SONNET_THINKING = {
  id: 'anthropic/claude-3.7-sonnet:thinking',
  name: 'Anthropic: Claude 3.7 Sonnet (thinking)',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 4.05,
      },
      output: {
        normal: 15,
      },
    },
    image: 0.0048,
  },
} as const
const X_AI_GROK_4 = {
  id: 'x-ai/grok-4',
  name: 'xAI: Grok 4',
  supports: {
    input: ['image', 'text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 256000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0.75,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const PERPLEXITY_SONAR_PRO = {
  id: 'perplexity/sonar-pro',
  name: 'Perplexity: Sonar Pro',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 200000,
  max_output_tokens: 8000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const X_AI_GROK_3_BETA = {
  id: 'x-ai/grok-3-beta',
  name: 'xAI: Grok 3 Beta',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0.75,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_SONNET_4 = {
  id: 'anthropic/claude-sonnet-4',
  name: 'Anthropic: Claude Sonnet 4',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 1000000,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 4.05,
      },
      output: {
        normal: 15,
      },
    },
    image: 0.0048,
  },
} as const
const ANTHROPIC_CLAUDE_3_7_SONNET = {
  id: 'anthropic/claude-3.7-sonnet',
  name: 'Anthropic: Claude 3.7 Sonnet',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 4.05,
      },
      output: {
        normal: 15,
      },
    },
    image: 0.0048,
  },
} as const
const PERPLEXITY_SONAR_PRO_SEARCH = {
  id: 'perplexity/sonar-pro-search',
  name: 'Perplexity: Sonar Pro Search',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 200000,
  max_output_tokens: 8000,
  pricing: {
    text: {
      input: {
        normal: 3,
        cached: 0,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_1_405B_INSTRUCT = {
  id: 'meta-llama/llama-3.1-405b-instruct',
  name: 'Meta: Llama 3.1 405B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 3.5,
        cached: 0,
      },
      output: {
        normal: 3.5,
      },
    },
    image: 0,
  },
} as const
const DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_405B = {
  id: 'deepcogito/cogito-v2-preview-llama-405b',
  name: 'Deep Cogito: Cogito V2 Preview Llama 405B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  pricing: {
    text: {
      input: {
        normal: 3.5,
        cached: 0,
      },
      output: {
        normal: 3.5,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_1_405B = {
  id: 'meta-llama/llama-3.1-405b',
  name: 'Meta: Llama 3.1 405B (base)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 4,
        cached: 0,
      },
      output: {
        normal: 4,
      },
    },
    image: 0,
  },
} as const
const AION_LABS_AION_1_0 = {
  id: 'aion-labs/aion-1.0',
  name: 'AionLabs: Aion-1.0',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'temperature',
      'top_p',
    ],
  },
  context_window: 32768,
  max_output_tokens: 32768,
  pricing: {
    text: {
      input: {
        normal: 4,
        cached: 0,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const RAIFLE_SORCERERLM_8X22B = {
  id: 'raifle/sorcererlm-8x22b',
  name: 'SorcererLM 8x22B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 16000,
  pricing: {
    text: {
      input: {
        normal: 4.5,
        cached: 0,
      },
      output: {
        normal: 4.5,
      },
    },
    image: 0,
  },
} as const
const OPENAI_CHATGPT_4O_LATEST = {
  id: 'openai/chatgpt-4o-latest',
  name: 'OpenAI: ChatGPT-4o',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 5,
        cached: 0,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_2024_05_13 = {
  id: 'openai/gpt-4o-2024-05-13',
  name: 'OpenAI: GPT-4o (2024-05-13)',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 5,
        cached: 0,
      },
      output: {
        normal: 15,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_OPUS_4_5 = {
  id: 'anthropic/claude-opus-4.5',
  name: 'Anthropic: Claude Opus 4.5',
  supports: {
    input: ['document', 'image', 'text'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'verbosity',
    ],
  },
  context_window: 200000,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 5,
        cached: 6.75,
      },
      output: {
        normal: 25,
      },
    },
    image: 0,
  },
} as const
const ALPINDALE_GOLIATH_120B = {
  id: 'alpindale/goliath-120b',
  name: 'Goliath 120B',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 6144,
  max_output_tokens: 1024,
  pricing: {
    text: {
      input: {
        normal: 6,
        cached: 0,
      },
      output: {
        normal: 8,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4O_EXTENDED = {
  id: 'openai/gpt-4o:extended',
  name: 'OpenAI: GPT-4o (extended)',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options',
    ],
  },
  context_window: 128000,
  max_output_tokens: 64000,
  pricing: {
    text: {
      input: {
        normal: 6,
        cached: 0,
      },
      output: {
        normal: 18,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_3_5_SONNET = {
  id: 'anthropic/claude-3.5-sonnet',
  name: 'Anthropic: Claude 3.5 Sonnet',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 6,
        cached: 0,
      },
      output: {
        normal: 30,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_IMAGE = {
  id: 'openai/gpt-5-image',
  name: 'OpenAI: GPT-5 Image',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['image', 'text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 10,
        cached: 1.25,
      },
      output: {
        normal: 10,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4_1106_PREVIEW = {
  id: 'openai/gpt-4-1106-preview',
  name: 'OpenAI: GPT-4 Turbo (older v1106)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 10,
        cached: 0,
      },
      output: {
        normal: 30,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4_TURBO = {
  id: 'openai/gpt-4-turbo',
  name: 'OpenAI: GPT-4 Turbo',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 10,
        cached: 0,
      },
      output: {
        normal: 30,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4_TURBO_PREVIEW = {
  id: 'openai/gpt-4-turbo-preview',
  name: 'OpenAI: GPT-4 Turbo Preview',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 128000,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 10,
        cached: 0,
      },
      output: {
        normal: 30,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O3_DEEP_RESEARCH = {
  id: 'openai/o3-deep-research',
  name: 'OpenAI: o3 Deep Research',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 10,
        cached: 2.5,
      },
      output: {
        normal: 40,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O1 = {
  id: 'openai/o1',
  name: 'OpenAI: o1',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 15,
        cached: 7.5,
      },
      output: {
        normal: 60,
      },
    },
    image: 0,
  },
} as const
const ANTHROPIC_CLAUDE_OPUS_4_1 = {
  id: 'anthropic/claude-opus-4.1',
  name: 'Anthropic: Claude Opus 4.1',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 32000,
  pricing: {
    text: {
      input: {
        normal: 15,
        cached: 20.25,
      },
      output: {
        normal: 75,
      },
    },
    image: 0.024,
  },
} as const
const ANTHROPIC_CLAUDE_OPUS_4 = {
  id: 'anthropic/claude-opus-4',
  name: 'Anthropic: Claude Opus 4',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 32000,
  pricing: {
    text: {
      input: {
        normal: 15,
        cached: 20.25,
      },
      output: {
        normal: 75,
      },
    },
    image: 0.024,
  },
} as const
const OPENAI_GPT_5_PRO = {
  id: 'openai/gpt-5-pro',
  name: 'OpenAI: GPT-5 Pro',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 15,
        cached: 0,
      },
      output: {
        normal: 120,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O3_PRO = {
  id: 'openai/o3-pro',
  name: 'OpenAI: o3 Pro',
  supports: {
    input: ['text', 'document', 'image'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 20,
        cached: 0,
      },
      output: {
        normal: 80,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_5_2_PRO = {
  id: 'openai/gpt-5.2-pro',
  name: 'OpenAI: GPT-5.2 Pro',
  supports: {
    input: ['image', 'text', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools',
    ],
  },
  context_window: 400000,
  max_output_tokens: 128000,
  pricing: {
    text: {
      input: {
        normal: 21,
        cached: 0,
      },
      output: {
        normal: 168,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4 = {
  id: 'openai/gpt-4',
  name: 'OpenAI: GPT-4',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 8191,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 30,
        cached: 0,
      },
      output: {
        normal: 60,
      },
    },
    image: 0,
  },
} as const
const OPENAI_GPT_4_0314 = {
  id: 'openai/gpt-4-0314',
  name: 'OpenAI: GPT-4 (older v0314)',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
    ],
  },
  context_window: 8191,
  max_output_tokens: 4096,
  pricing: {
    text: {
      input: {
        normal: 30,
        cached: 0,
      },
      output: {
        normal: 60,
      },
    },
    image: 0,
  },
} as const
const OPENAI_O1_PRO = {
  id: 'openai/o1-pro',
  name: 'OpenAI: o1-pro',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
    ],
  },
  context_window: 200000,
  max_output_tokens: 100000,
  pricing: {
    text: {
      input: {
        normal: 150,
        cached: 0,
      },
      output: {
        normal: 600,
      },
    },
    image: 0,
  },
} as const
const ALLENAI_OLMO_2_0325_32B_INSTRUCT = {
  id: 'allenai/olmo-2-0325-32b-instruct',
  name: 'AllenAI: Olmo 2 32B Instruct',
  supports: {
    input: ['text'],
    output: ['text'],
    supports: [],
  },
  context_window: 128000,
  pricing: {
    text: {
      input: {
        normal: 0.05,
        cached: 0,
      },
      output: {
        normal: 0.2,
      },
    },
    image: 0,
  },
} as const
const META_LLAMA_LLAMA_3_2_90B_VISION_INSTRUCT = {
  id: 'meta-llama/llama-3.2-90b-vision-instruct',
  name: 'Meta: Llama 3.2 90B Vision Instruct',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    supports: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p',
    ],
  },
  context_window: 131072,
  max_output_tokens: 16384,
  pricing: {
    text: {
      input: {
        normal: 0.35,
        cached: 0,
      },
      output: {
        normal: 0.4,
      },
    },
    image: 0.0005058,
  },
} as const
const ANTHROPIC_CLAUDE_3_5_HAIKU_20241022 = {
  id: 'anthropic/claude-3.5-haiku-20241022',
  name: 'Anthropic: Claude 3.5 Haiku (2024-10-22)',
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    supports: [
      'max_tokens',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
    ],
  },
  context_window: 200000,
  max_output_tokens: 8192,
  pricing: {
    text: {
      input: {
        normal: 0.8,
        cached: 1.08,
      },
      output: {
        normal: 4,
      },
    },
    image: 0,
  },
} as const

export type OpenRouterModelOptionsByName = {
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_CODER_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [TNGTECH_DEEPSEEK_R1T2_CHIMERA_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_4B_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3N_E2B_IT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3_12B_IT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'seed' | 'stop' | 'temperature' | 'top_p'
    >
  [COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [Z_AI_GLM_4_5_AIR_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MOONSHOTAI_KIMI_K2_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'seed' | 'stop' | 'temperature'
    >
  [GOOGLE_GEMMA_3_27B_IT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3_4B_IT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_p'
    >
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [TNGTECH_TNG_R1T_CHIMERA_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [ARCEE_AI_TRINITY_MINI_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [TNGTECH_DEEPSEEK_R1T_CHIMERA_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3N_E4B_IT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_0_FLASH_EXP_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_GPT_OSS_120B_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
    >
  [OPENAI_GPT_OSS_20B_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
    >
  [MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_DEVSTRAL_2512_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [XIAOMI_MIMO_V2_FLASH_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [ALLENAI_MOLMO_2_8B_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_R1_0528_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'temperature'
    >
  [NVIDIA_NEMOTRON_NANO_9B_V2_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_1_405B_INSTRUCT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'temperature'
    >
  [QWEN_QWEN_2_5_VL_7B_INSTRUCT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'temperature'
    >
  [MISTRALAI_MISTRAL_7B_INSTRUCT_FREE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [LIQUID_LFM_2_2_6B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [LIQUID_LFM2_8B_A1B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [IBM_GRANITE_GRANITE_4_0_H_MICRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3_4B_IT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_NEMO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3N_E4B_IT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_1_8B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_GUARD_3_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_OSS_20B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [NOUSRESEARCH_DEEPHERMES_3_MISTRAL_24B_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_2_1B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_7B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_8B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_2_9B_IT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN2_5_CODER_7B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3_12B_IT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN_2_5_CODER_32B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [AMAZON_NOVA_MICRO_V1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature' | 'top_k' | 'top_p'
    >
  [COHERE_COMMAND_R7B_12_2024.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_OSS_120B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_OSS_120B_EXACTO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MINISTRAL_3B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [SAO10K_L3_LUNARIS_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN_2_5_7B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMMA_3_27B_IT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [NVIDIA_NEMOTRON_NANO_9B_V2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ARCEE_AI_TRINITY_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MICROSOFT_PHI_4_MULTIMODAL_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN_TURBO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [Z_AI_GLM_4_5_AIR.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN2_5_VL_32B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [QWEN_QWEN3_14B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_DEVSTRAL_2512.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_5_NANO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [QWEN_QWEN3_30B_A3B_THINKING_2507.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [GRYPHE_MYTHOMAX_L2_13B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_R1_0528_QWEN3_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_DEVSTRAL_SMALL_2505.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MICROSOFT_PHI_4.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_30B_A3B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [AMAZON_NOVA_LITE_V1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature' | 'top_k' | 'top_p'
    >
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_CODER_30B_A3B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_DEVSTRAL_SMALL.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [BAIDU_ERNIE_4_5_21B_A3B_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [BAIDU_ERNIE_4_5_21B_A3B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MICROSOFT_PHI_4_REASONING_PLUS.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_235B_A22B_2507.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_OSS_SAFEGUARD_20B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [BYTEDANCE_SEED_SEED_1_6_FLASH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_0_FLASH_LITE_001.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [QWEN_QWEN3_32B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_4_SCOUT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_30B_A3B_INSTRUCT_2507.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_VL_8B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [NEVERSLEEP_LLAMA_3_1_LUMIMAID_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'top_p'
    >
  [QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [Z_AI_GLM_4_32B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'temperature' | 'tool_choice' | 'top_p'
    >
  [MISTRALAI_PIXTRAL_12B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MINISTRAL_3B_2512.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRAL_MINISTRAL_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_MINISTRAL_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [ALLENAI_OLMO_3_7B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [BYTEDANCE_UI_TARS_1_5_7B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_SMALL_CREATIVE.id]: OpenRouterCommonOptions &
    Pick<OpenRouterBaseOptions, 'tool_choice'>
  [MISTRALAI_VOXTRAL_SMALL_24B_2507.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENGVLAB_INTERNVL3_78B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_4_1_NANO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_0_FLASH_001.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_5_FLASH_LITE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_VL_4B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [NOUSRESEARCH_HERMES_4_70B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_235B_A22B_THINKING_2507.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ALLENAI_OLMO_3_7B_THINK.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN_2_5_72B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [BAIDU_ERNIE_4_5_VL_28B_A3B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [TENCENT_HUNYUAN_A13B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'reasoning'
      | 'response_format'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_14B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [ESSENTIALAI_RNJ_1_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MINISTRAL_8B_2512.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [QWEN_QWQ_32B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ALLENAI_OLMO_3_1_32B_THINK.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [ALLENAI_OLMO_3_32B_THINK.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_VL_30B_A3B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_4_MAVERICK.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_4O_MINI_SEARCH_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'web_search_options'
    >
  [OPENAI_GPT_4O_MINI_2024_07_18.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
      | 'web_search_options'
    >
  [OPENAI_GPT_4O_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
      | 'web_search_options'
    >
  [COHERE_COMMAND_R_08_2024.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN2_5_VL_72B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_CHAT_V3_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [QWEN_QWEN3_NEXT_80B_A3B_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [THEDRUMMER_ROCINANTE_12B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ARCEE_AI_SPOTLIGHT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_GUARD_4_12B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_235B_A22B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_109B_MOE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_VL_8B_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_CHAT_V3_0324.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_GUARD_2_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_3.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN_2_5_VL_7B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MINISTRAL_14B_2512.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [AI21_JAMBA_MINI_1_7.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [X_AI_GROK_4_1_FAST.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [X_AI_GROK_4_FAST.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_SABA.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [ALLENAI_OLMO_3_1_32B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MEITUAN_LONGCAT_FLASH_CHAT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'temperature' | 'top_p'
    >
  [QWEN_QWEN3_VL_30B_A3B_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MINIMAX_MINIMAX_M2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MINIMAX_MINIMAX_01.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'temperature' | 'top_p'
    >
  [PRIME_INTELLECT_INTELLECT_3.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_VL_235B_A22B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [X_AI_GROK_CODE_FAST_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [KWAIPILOT_KAT_CODER_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_V3_2_EXP.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN_VL_PLUS.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_V3_1_TERMINUS_EXACTO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_V3_1_TERMINUS.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_CODER.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [QWEN_QWEN3_CODER_EXACTO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_TINY.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_V3_2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [TNGTECH_DEEPSEEK_R1T2_CHIMERA.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [TNGTECH_TNG_R1T_CHIMERA.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [INCEPTION_MERCURY.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [INCEPTION_MERCURY_CODER.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_3_HAIKU.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_5_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_5_1_CODEX_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [BYTEDANCE_SEED_SEED_1_6.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_V3_2_SPECIALE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [NEX_AGI_DEEPSEEK_V3_1_NEX_N1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'response_format'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MINIMAX_MINIMAX_M2_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [BAIDU_ERNIE_4_5_300B_A47B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MOONSHOTAI_KIMI_DEV_72B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'reasoning'
      | 'response_format'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_70B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [THEDRUMMER_CYDONIA_24B_V4_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [X_AI_GROK_3_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [X_AI_GROK_3_MINI_BETA.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [Z_AI_GLM_4_6V.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_CODESTRAL_2508.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_CHAT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [TNGTECH_DEEPSEEK_R1T_CHIMERA.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_CODER_FLASH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_5_FLASH_IMAGE_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_5_FLASH_PREVIEW_09_2025.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_5_FLASH_IMAGE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'top_p'
    >
  [AMAZON_NOVA_2_LITE_V1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_5_FLASH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [Z_AI_GLM_4_6.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [Z_AI_GLM_4_5.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MOONSHOTAI_KIMI_K2_0905.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_1_70B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [THEDRUMMER_UNSLOPNEMO_12B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [QWEN_QWEN_PLUS_2025_07_28.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [QWEN_QWEN_PLUS.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [Z_AI_GLM_4_7.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4_1_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MOONSHOTAI_KIMI_K2_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [MISTRALAI_DEVSTRAL_MEDIUM.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_MEDIUM_3.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_MEDIUM_3_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MINIMAX_MINIMAX_M1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN_PLUS_2025_07_28_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [BAIDU_ERNIE_4_5_VL_424B_A47B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [Z_AI_GLM_4_6_EXACTO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [UNDI95_REMM_SLERP_L2_13B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_R1_0528.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [QWEN_QWEN3_VL_235B_A22B_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MICROSOFT_WIZARDLM_2_8X22B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [ARCEE_AI_CODER_LARGE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_LARGE_2512.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [QWEN_QWEN3_VL_32B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_3_5_TURBO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_PROVER_V2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MOONSHOTAI_KIMI_K2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [GOOGLE_GEMINI_3_FLASH_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_MIXTRAL_8X7B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [THEDRUMMER_SKYFALL_36B_V2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [MINIMAX_MINIMAX_M1_80K.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [STEPFUN_AI_STEP3.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'reasoning'
      | 'response_format'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [NVIDIA_LLAMA_3_1_NEMOTRON_ULTRA_253B_V1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [Z_AI_GLM_4_5V.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MOONSHOTAI_KIMI_K2_0905_EXACTO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [GOOGLE_GEMMA_2_27B_IT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'top_p'
    >
  [SAO10K_L3_3_EURYALE_70B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [SAO10K_L3_1_EURYALE_70B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [AION_LABS_AION_1_0_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'temperature'
      | 'top_p'
    >
  [DEEPSEEK_DEEPSEEK_R1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MANCER_WEAVER.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [ARCEE_AI_VIRTUOSO_LARGE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MORPH_MORPH_V3_FAST.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature'
    >
  [ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [ELEUTHERAI_LLEMMA_7B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [AION_LABS_AION_RP_LLAMA_3_1_8B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'temperature' | 'top_p'
    >
  [AMAZON_NOVA_PRO_V1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature' | 'top_k' | 'top_p'
    >
  [QWEN_QWEN_VL_MAX.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_3_5_HAIKU.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [RELACE_RELACE_APPLY_3.id]: OpenRouterCommonOptions &
    Pick<OpenRouterBaseOptions, 'max_completion_tokens' | 'seed' | 'stop'>
  [SWITCHPOINT_ROUTER.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_70B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [MORPH_MORPH_V3_LARGE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature'
    >
  [ARCEE_AI_MAESTRO_REASONING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [PERPLEXITY_SONAR.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'temperature'
      | 'top_k'
      | 'top_p'
      | 'web_search_options'
    >
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [NEVERSLEEP_NOROMAID_20B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_3_5_TURBO_0613.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [RELACE_RELACE_SEARCH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [NOUSRESEARCH_HERMES_4_405B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_CODER_PLUS.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_HAIKU_4_5.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_O4_MINI_HIGH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_O3_MINI_HIGH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'seed' | 'tool_choice'
    >
  [OPENAI_O3_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'seed' | 'tool_choice'
    >
  [OPENAI_O4_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [QWEN_QWEN3_MAX.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [DEEPCOGITO_COGITO_V2_1_671B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_GPT_5_CHAT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'seed'
    >
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_GPT_5.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_5_CODEX.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_5_1_CODEX.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_5_1_CHAT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'seed' | 'tool_choice'
    >
  [GOOGLE_GEMINI_2_5_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_GPT_5_1_CODEX_MAX.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_5_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [SAO10K_L3_EURYALE_70B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_3_5_TURBO_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_CODEX_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [QWEN_QWEN_MAX.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_GPT_5_2.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_5_2_CHAT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'seed' | 'tool_choice'
    >
  [MISTRALAI_MISTRAL_LARGE_2411.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_PIXTRAL_LARGE_2411.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_MIXTRAL_8X22B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_LARGE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [MISTRALAI_MISTRAL_LARGE_2407.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [PERPLEXITY_SONAR_DEEP_RESEARCH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'temperature'
      | 'top_k'
      | 'top_p'
      | 'web_search_options'
    >
  [PERPLEXITY_SONAR_REASONING_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'temperature'
      | 'top_k'
      | 'top_p'
      | 'web_search_options'
    >
  [OPENAI_GPT_4_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_O3.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [AI21_JAMBA_LARGE_1_7.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_O4_MINI_DEEP_RESEARCH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_p'
    >
  [GOOGLE_GEMINI_3_PRO_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [OPENAI_GPT_5_IMAGE_MINI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4O_SEARCH_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'web_search_options'
    >
  [OPENAI_GPT_4O_AUDIO_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [COHERE_COMMAND_A.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [INFLECTION_INFLECTION_3_PI.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature' | 'top_p'
    >
  [INFLECTION_INFLECTION_3_PRODUCTIVITY.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature' | 'top_p'
    >
  [OPENAI_GPT_4O_2024_11_20.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
      | 'web_search_options'
    >
  [OPENAI_GPT_4O_2024_08_06.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
      | 'web_search_options'
    >
  [OPENAI_GPT_4O.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
      | 'web_search_options'
    >
  [COHERE_COMMAND_R_PLUS_08_2024.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [AMAZON_NOVA_PREMIER_V1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'stop' | 'temperature' | 'top_k' | 'top_p'
    >
  [SAO10K_L3_1_70B_HANAMI_X1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_3_5_TURBO_16K.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [ANTHRACITE_ORG_MAGNUM_V4_72B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_SONNET_4_5.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [X_AI_GROK_3.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_3_7_SONNET_THINKING.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_p'
    >
  [X_AI_GROK_4.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [PERPLEXITY_SONAR_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'temperature'
      | 'top_k'
      | 'top_p'
      | 'web_search_options'
    >
  [X_AI_GROK_3_BETA.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_SONNET_4.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_3_7_SONNET.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [PERPLEXITY_SONAR_PRO_SEARCH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'temperature'
      | 'top_k'
      | 'top_p'
      | 'web_search_options'
    >
  [META_LLAMA_LLAMA_3_1_405B_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_405B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'reasoning'
      | 'repetition_penalty'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [META_LLAMA_LLAMA_3_1_405B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [AION_LABS_AION_1_0.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'temperature'
      | 'top_p'
    >
  [RAIFLE_SORCERERLM_8X22B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_CHATGPT_4O_LATEST.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4O_2024_05_13.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
      | 'web_search_options'
    >
  [ANTHROPIC_CLAUDE_OPUS_4_5.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'verbosity'
    >
  [ALPINDALE_GOLIATH_120B.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_a'
      | 'top_k'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4O_EXTENDED.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
      | 'web_search_options'
    >
  [ANTHROPIC_CLAUDE_3_5_SONNET.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_5_IMAGE.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4_1106_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4_TURBO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4_TURBO_PREVIEW.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_O3_DEEP_RESEARCH.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'include_reasoning'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_O1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      'max_completion_tokens' | 'response_format' | 'seed' | 'tool_choice'
    >
  [ANTHROPIC_CLAUDE_OPUS_4_1.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_OPUS_4.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  [OPENAI_GPT_5_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_O3_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_5_2_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
      | 'tool_choice'
    >
  [OPENAI_GPT_4.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_GPT_4_0314.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'logit_bias'
      | 'logprobs'
      | 'max_completion_tokens'
      | 'presence_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_logprobs'
      | 'top_p'
    >
  [OPENAI_O1_PRO.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'include_reasoning'
      | 'max_completion_tokens'
      | 'reasoning'
      | 'response_format'
      | 'seed'
    >
  [ALLENAI_OLMO_2_0325_32B_INSTRUCT.id]: OpenRouterCommonOptions &
    OpenRouterBaseOptions
  [META_LLAMA_LLAMA_3_2_90B_VISION_INSTRUCT.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'frequency_penalty'
      | 'max_completion_tokens'
      | 'min_p'
      | 'presence_penalty'
      | 'repetition_penalty'
      | 'response_format'
      | 'seed'
      | 'stop'
      | 'temperature'
      | 'top_k'
      | 'top_p'
    >
  [ANTHROPIC_CLAUDE_3_5_HAIKU_20241022.id]: OpenRouterCommonOptions &
    Pick<
      OpenRouterBaseOptions,
      | 'max_completion_tokens'
      | 'stop'
      | 'temperature'
      | 'tool_choice'
      | 'top_k'
      | 'top_p'
    >
  'openrouter/auto': OpenRouterCommonOptions & OpenRouterBaseOptions
}

export type OpenRouterModelInputModalitiesByName = {
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_CODER_FREE.id]: ReadonlyArray<'text'>
  [TNGTECH_DEEPSEEK_R1T2_CHIMERA_FREE.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_4B_FREE.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3N_E2B_IT_FREE.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3_12B_IT_FREE.id]: ReadonlyArray<'text' | 'image'>
  [COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE.id]: ReadonlyArray<'text'>
  [Z_AI_GLM_4_5_AIR_FREE.id]: ReadonlyArray<'text'>
  [MOONSHOTAI_KIMI_K2_FREE.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3_27B_IT_FREE.id]: ReadonlyArray<'text' | 'image'>
  [GOOGLE_GEMMA_3_4B_IT_FREE.id]: ReadonlyArray<'text' | 'image'>
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE.id]: ReadonlyArray<'text'>
  [TNGTECH_TNG_R1T_CHIMERA_FREE.id]: ReadonlyArray<'text'>
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE.id]: ReadonlyArray<
    'image' | 'text' | 'video'
  >
  [ARCEE_AI_TRINITY_MINI_FREE.id]: ReadonlyArray<'text'>
  [TNGTECH_DEEPSEEK_R1T_CHIMERA_FREE.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3N_E4B_IT_FREE.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMINI_2_0_FLASH_EXP_FREE.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_OSS_120B_FREE.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_OSS_20B_FREE.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT_FREE.id]: ReadonlyArray<
    'text' | 'image'
  >
  [MISTRALAI_DEVSTRAL_2512_FREE.id]: ReadonlyArray<'text'>
  [XIAOMI_MIMO_V2_FLASH_FREE.id]: ReadonlyArray<'text'>
  [ALLENAI_MOLMO_2_8B_FREE.id]: ReadonlyArray<'text' | 'image' | 'video'>
  [DEEPSEEK_DEEPSEEK_R1_0528_FREE.id]: ReadonlyArray<'text'>
  [NVIDIA_NEMOTRON_NANO_9B_V2_FREE.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_1_405B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_2_5_VL_7B_INSTRUCT_FREE.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MISTRAL_7B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>
  [LIQUID_LFM_2_2_6B.id]: ReadonlyArray<'text'>
  [LIQUID_LFM2_8B_A1B.id]: ReadonlyArray<'text'>
  [IBM_GRANITE_GRANITE_4_0_H_MICRO.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3_4B_IT.id]: ReadonlyArray<'text' | 'image'>
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_NEMO.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3N_E4B_IT.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_1_8B_INSTRUCT.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_GUARD_3_8B.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_OSS_20B.id]: ReadonlyArray<'text'>
  [NOUSRESEARCH_DEEPHERMES_3_MISTRAL_24B_PREVIEW.id]: ReadonlyArray<'text'>
  [NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_2_1B_INSTRUCT.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_7B_INSTRUCT.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_8B_INSTRUCT.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_2_9B_IT.id]: ReadonlyArray<'text'>
  [QWEN_QWEN2_5_CODER_7B_INSTRUCT.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3_12B_IT.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_2_5_CODER_32B_INSTRUCT.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_8B.id]: ReadonlyArray<'text'>
  [AMAZON_NOVA_MICRO_V1.id]: ReadonlyArray<'text'>
  [COHERE_COMMAND_R7B_12_2024.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_OSS_120B.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_OSS_120B_EXACTO.id]: ReadonlyArray<'text'>
  [MISTRALAI_MINISTRAL_3B.id]: ReadonlyArray<'text'>
  [SAO10K_L3_LUNARIS_8B.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_2_5_7B_INSTRUCT.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_3_27B_IT.id]: ReadonlyArray<'text' | 'image'>
  [NVIDIA_NEMOTRON_NANO_9B_V2.id]: ReadonlyArray<'text'>
  [ARCEE_AI_TRINITY_MINI.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [MICROSOFT_PHI_4_MULTIMODAL_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [QWEN_QWEN_TURBO.id]: ReadonlyArray<'text'>
  [Z_AI_GLM_4_5_AIR.id]: ReadonlyArray<'text'>
  [QWEN_QWEN2_5_VL_32B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [QWEN_QWEN3_14B.id]: ReadonlyArray<'text'>
  [MISTRALAI_DEVSTRAL_2512.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_5_NANO.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [QWEN_QWEN3_30B_A3B_THINKING_2507.id]: ReadonlyArray<'text'>
  [GRYPHE_MYTHOMAX_L2_13B.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_R1_0528_QWEN3_8B.id]: ReadonlyArray<'text'>
  [MISTRALAI_DEVSTRAL_SMALL_2505.id]: ReadonlyArray<'text'>
  [MICROSOFT_PHI_4.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT.id]: ReadonlyArray<'image' | 'text'>
  [QWEN_QWEN3_30B_A3B.id]: ReadonlyArray<'text'>
  [AMAZON_NOVA_LITE_V1.id]: ReadonlyArray<'text' | 'image'>
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_CODER_30B_A3B_INSTRUCT.id]: ReadonlyArray<'text'>
  [MISTRALAI_DEVSTRAL_SMALL.id]: ReadonlyArray<'text'>
  [BAIDU_ERNIE_4_5_21B_A3B_THINKING.id]: ReadonlyArray<'text'>
  [BAIDU_ERNIE_4_5_21B_A3B.id]: ReadonlyArray<'text'>
  [MICROSOFT_PHI_4_REASONING_PLUS.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_235B_A22B_2507.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_OSS_SAFEGUARD_20B.id]: ReadonlyArray<'text'>
  [BYTEDANCE_SEED_SEED_1_6_FLASH.id]: ReadonlyArray<'image' | 'text' | 'video'>
  [GOOGLE_GEMINI_2_0_FLASH_LITE_001.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [QWEN_QWEN3_32B.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_4_SCOUT.id]: ReadonlyArray<'text' | 'image'>
  [QWEN_QWEN3_30B_A3B_INSTRUCT_2507.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_VL_8B_INSTRUCT.id]: ReadonlyArray<'image' | 'text'>
  [ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B.id]: ReadonlyArray<'text'>
  [NEVERSLEEP_LLAMA_3_1_LUMIMAID_8B.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT.id]: ReadonlyArray<'text'>
  [Z_AI_GLM_4_32B.id]: ReadonlyArray<'text'>
  [MISTRALAI_PIXTRAL_12B.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MINISTRAL_3B_2512.id]: ReadonlyArray<'text' | 'image'>
  [MISTRAL_MINISTRAL_8B.id]: ReadonlyArray<'text'>
  [MISTRALAI_MINISTRAL_8B.id]: ReadonlyArray<'text'>
  [ALLENAI_OLMO_3_7B_INSTRUCT.id]: ReadonlyArray<'text'>
  [BYTEDANCE_UI_TARS_1_5_7B.id]: ReadonlyArray<'image' | 'text'>
  [MISTRALAI_MISTRAL_SMALL_CREATIVE.id]: ReadonlyArray<'text'>
  [MISTRALAI_VOXTRAL_SMALL_24B_2507.id]: ReadonlyArray<'text' | 'audio'>
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT.id]: ReadonlyArray<'text'>
  [OPENGVLAB_INTERNVL3_78B.id]: ReadonlyArray<'image' | 'text'>
  [OPENAI_GPT_4_1_NANO.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [GOOGLE_GEMINI_2_0_FLASH_001.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [GOOGLE_GEMINI_2_5_FLASH_LITE.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_VL_4B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1.id]: ReadonlyArray<'text'>
  [NOUSRESEARCH_HERMES_4_70B.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_235B_A22B_THINKING_2507.id]: ReadonlyArray<'text'>
  [ALLENAI_OLMO_3_7B_THINK.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_2_5_72B_INSTRUCT.id]: ReadonlyArray<'text'>
  [BAIDU_ERNIE_4_5_VL_28B_A3B.id]: ReadonlyArray<'text' | 'image'>
  [TENCENT_HUNYUAN_A13B_INSTRUCT.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_14B.id]: ReadonlyArray<'text'>
  [ESSENTIALAI_RNJ_1_INSTRUCT.id]: ReadonlyArray<'text'>
  [MISTRALAI_MINISTRAL_8B_2512.id]: ReadonlyArray<'text' | 'image'>
  [QWEN_QWQ_32B.id]: ReadonlyArray<'text'>
  [ALLENAI_OLMO_3_1_32B_THINK.id]: ReadonlyArray<'text'>
  [ALLENAI_OLMO_3_32B_THINK.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_VL_30B_A3B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [META_LLAMA_LLAMA_4_MAVERICK.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_4O_MINI_SEARCH_PREVIEW.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_4O_MINI_2024_07_18.id]: ReadonlyArray<
    'text' | 'image' | 'document'
  >
  [OPENAI_GPT_4O_MINI.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [COHERE_COMMAND_R_08_2024.id]: ReadonlyArray<'text'>
  [QWEN_QWEN2_5_VL_72B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [DEEPSEEK_DEEPSEEK_CHAT_V3_1.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_NEXT_80B_A3B_THINKING.id]: ReadonlyArray<'text'>
  [THEDRUMMER_ROCINANTE_12B.id]: ReadonlyArray<'text'>
  [ARCEE_AI_SPOTLIGHT.id]: ReadonlyArray<'image' | 'text'>
  [META_LLAMA_LLAMA_GUARD_4_12B.id]: ReadonlyArray<'image' | 'text'>
  [QWEN_QWEN3_235B_A22B.id]: ReadonlyArray<'text'>
  [DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_109B_MOE.id]: ReadonlyArray<
    'image' | 'text'
  >
  [QWEN_QWEN3_VL_8B_THINKING.id]: ReadonlyArray<'image' | 'text'>
  [DEEPSEEK_DEEPSEEK_CHAT_V3_0324.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_GUARD_2_8B.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_3.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_2_5_VL_7B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MINISTRAL_14B_2512.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_2.id]: ReadonlyArray<'text'>
  [AI21_JAMBA_MINI_1_7.id]: ReadonlyArray<'text'>
  [X_AI_GROK_4_1_FAST.id]: ReadonlyArray<'text' | 'image'>
  [X_AI_GROK_4_FAST.id]: ReadonlyArray<'text' | 'image'>
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL.id]: ReadonlyArray<'image' | 'text' | 'video'>
  [MISTRALAI_MISTRAL_SABA.id]: ReadonlyArray<'text'>
  [ALLENAI_OLMO_3_1_32B_INSTRUCT.id]: ReadonlyArray<'text'>
  [MEITUAN_LONGCAT_FLASH_CHAT.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_VL_30B_A3B_THINKING.id]: ReadonlyArray<'text' | 'image'>
  [MINIMAX_MINIMAX_M2.id]: ReadonlyArray<'text'>
  [MINIMAX_MINIMAX_01.id]: ReadonlyArray<'text' | 'image'>
  [PRIME_INTELLECT_INTELLECT_3.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_VL_235B_A22B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [X_AI_GROK_CODE_FAST_1.id]: ReadonlyArray<'text'>
  [KWAIPILOT_KAT_CODER_PRO.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_V3_2_EXP.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_VL_PLUS.id]: ReadonlyArray<'text' | 'image'>
  [DEEPSEEK_DEEPSEEK_V3_1_TERMINUS_EXACTO.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_V3_1_TERMINUS.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_CODER.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_CODER_EXACTO.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_TINY.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_V3_2.id]: ReadonlyArray<'text'>
  [TNGTECH_DEEPSEEK_R1T2_CHIMERA.id]: ReadonlyArray<'text'>
  [TNGTECH_TNG_R1T_CHIMERA.id]: ReadonlyArray<'text'>
  [INCEPTION_MERCURY.id]: ReadonlyArray<'text'>
  [INCEPTION_MERCURY_CODER.id]: ReadonlyArray<'text'>
  [ANTHROPIC_CLAUDE_3_HAIKU.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_5_MINI.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [OPENAI_GPT_5_1_CODEX_MINI.id]: ReadonlyArray<'image' | 'text'>
  [BYTEDANCE_SEED_SEED_1_6.id]: ReadonlyArray<'image' | 'text' | 'video'>
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_V3_2_SPECIALE.id]: ReadonlyArray<'text'>
  [NEX_AGI_DEEPSEEK_V3_1_NEX_N1.id]: ReadonlyArray<'text'>
  [MINIMAX_MINIMAX_M2_1.id]: ReadonlyArray<'text'>
  [BAIDU_ERNIE_4_5_300B_A47B.id]: ReadonlyArray<'text'>
  [MOONSHOTAI_KIMI_DEV_72B.id]: ReadonlyArray<'text'>
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_70B_INSTRUCT.id]: ReadonlyArray<'text'>
  [THEDRUMMER_CYDONIA_24B_V4_1.id]: ReadonlyArray<'text'>
  [X_AI_GROK_3_MINI.id]: ReadonlyArray<'text'>
  [X_AI_GROK_3_MINI_BETA.id]: ReadonlyArray<'text'>
  [Z_AI_GLM_4_6V.id]: ReadonlyArray<'image' | 'text' | 'video'>
  [MISTRALAI_CODESTRAL_2508.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_CHAT.id]: ReadonlyArray<'text'>
  [TNGTECH_DEEPSEEK_R1T_CHIMERA.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_CODER_FLASH.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMINI_2_5_FLASH_IMAGE_PREVIEW.id]: ReadonlyArray<'image' | 'text'>
  [GOOGLE_GEMINI_2_5_FLASH_PREVIEW_09_2025.id]: ReadonlyArray<
    'image' | 'document' | 'text' | 'audio' | 'video'
  >
  [GOOGLE_GEMINI_2_5_FLASH_IMAGE.id]: ReadonlyArray<'image' | 'text'>
  [AMAZON_NOVA_2_LITE_V1.id]: ReadonlyArray<
    'text' | 'image' | 'video' | 'document'
  >
  [GOOGLE_GEMINI_2_5_FLASH.id]: ReadonlyArray<
    'document' | 'image' | 'text' | 'audio' | 'video'
  >
  [Z_AI_GLM_4_6.id]: ReadonlyArray<'text'>
  [Z_AI_GLM_4_5.id]: ReadonlyArray<'text'>
  [MOONSHOTAI_KIMI_K2_0905.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_1_70B_INSTRUCT.id]: ReadonlyArray<'text'>
  [THEDRUMMER_UNSLOPNEMO_12B.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_PLUS_2025_07_28.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_PLUS.id]: ReadonlyArray<'text'>
  [Z_AI_GLM_4_7.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_4_1_MINI.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [MOONSHOTAI_KIMI_K2_THINKING.id]: ReadonlyArray<'text'>
  [MISTRALAI_DEVSTRAL_MEDIUM.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_MEDIUM_3.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MISTRAL_MEDIUM_3_1.id]: ReadonlyArray<'text' | 'image'>
  [MINIMAX_MINIMAX_M1.id]: ReadonlyArray<'text'>
  [QWEN_QWEN_PLUS_2025_07_28_THINKING.id]: ReadonlyArray<'text'>
  [BAIDU_ERNIE_4_5_VL_424B_A47B.id]: ReadonlyArray<'image' | 'text'>
  [Z_AI_GLM_4_6_EXACTO.id]: ReadonlyArray<'text'>
  [UNDI95_REMM_SLERP_L2_13B.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_R1_0528.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_VL_235B_A22B_THINKING.id]: ReadonlyArray<'text' | 'image'>
  [MICROSOFT_WIZARDLM_2_8X22B.id]: ReadonlyArray<'text'>
  [ARCEE_AI_CODER_LARGE.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_LARGE_2512.id]: ReadonlyArray<'text' | 'image'>
  [QWEN_QWEN3_VL_32B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_3_5_TURBO.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_PROVER_V2.id]: ReadonlyArray<'text'>
  [MOONSHOTAI_KIMI_K2.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMINI_3_FLASH_PREVIEW.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [MISTRALAI_MIXTRAL_8X7B_INSTRUCT.id]: ReadonlyArray<'text'>
  [THEDRUMMER_SKYFALL_36B_V2.id]: ReadonlyArray<'text'>
  [MINIMAX_MINIMAX_M1_80K.id]: ReadonlyArray<'text'>
  [STEPFUN_AI_STEP3.id]: ReadonlyArray<'image' | 'text'>
  [NVIDIA_LLAMA_3_1_NEMOTRON_ULTRA_253B_V1.id]: ReadonlyArray<'text'>
  [Z_AI_GLM_4_5V.id]: ReadonlyArray<'text' | 'image'>
  [MOONSHOTAI_KIMI_K2_0905_EXACTO.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMMA_2_27B_IT.id]: ReadonlyArray<'text'>
  [SAO10K_L3_3_EURYALE_70B.id]: ReadonlyArray<'text'>
  [SAO10K_L3_1_EURYALE_70B.id]: ReadonlyArray<'text'>
  [AION_LABS_AION_1_0_MINI.id]: ReadonlyArray<'text'>
  [DEEPSEEK_DEEPSEEK_R1.id]: ReadonlyArray<'text'>
  [MANCER_WEAVER.id]: ReadonlyArray<'text'>
  [ARCEE_AI_VIRTUOSO_LARGE.id]: ReadonlyArray<'text'>
  [MORPH_MORPH_V3_FAST.id]: ReadonlyArray<'text'>
  [ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY.id]: ReadonlyArray<'text'>
  [ELEUTHERAI_LLEMMA_7B.id]: ReadonlyArray<'text'>
  [AION_LABS_AION_RP_LLAMA_3_1_8B.id]: ReadonlyArray<'text'>
  [AMAZON_NOVA_PRO_V1.id]: ReadonlyArray<'text' | 'image'>
  [QWEN_QWEN_VL_MAX.id]: ReadonlyArray<'text' | 'image'>
  [ANTHROPIC_CLAUDE_3_5_HAIKU.id]: ReadonlyArray<'text' | 'image'>
  [RELACE_RELACE_APPLY_3.id]: ReadonlyArray<'text'>
  [SWITCHPOINT_ROUTER.id]: ReadonlyArray<'text'>
  [DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_70B.id]: ReadonlyArray<'text'>
  [MORPH_MORPH_V3_LARGE.id]: ReadonlyArray<'text'>
  [ARCEE_AI_MAESTRO_REASONING.id]: ReadonlyArray<'text'>
  [PERPLEXITY_SONAR.id]: ReadonlyArray<'text' | 'image'>
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B.id]: ReadonlyArray<'text'>
  [NEVERSLEEP_NOROMAID_20B.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_3_5_TURBO_0613.id]: ReadonlyArray<'text'>
  [RELACE_RELACE_SEARCH.id]: ReadonlyArray<'text'>
  [NOUSRESEARCH_HERMES_4_405B.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_CODER_PLUS.id]: ReadonlyArray<'text'>
  [ANTHROPIC_CLAUDE_HAIKU_4_5.id]: ReadonlyArray<'image' | 'text'>
  [OPENAI_O4_MINI_HIGH.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [OPENAI_O3_MINI_HIGH.id]: ReadonlyArray<'text' | 'document'>
  [OPENAI_O3_MINI.id]: ReadonlyArray<'text' | 'document'>
  [OPENAI_O4_MINI.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT.id]: ReadonlyArray<'text'>
  [QWEN_QWEN3_MAX.id]: ReadonlyArray<'text'>
  [DEEPCOGITO_COGITO_V2_1_671B.id]: ReadonlyArray<'text'>
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW.id]: ReadonlyArray<
    'document' | 'image' | 'text' | 'audio'
  >
  [OPENAI_GPT_5_CHAT.id]: ReadonlyArray<'document' | 'image' | 'text'>
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [OPENAI_GPT_5.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [OPENAI_GPT_5_CODEX.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_5_1_CODEX.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_5_1_CHAT.id]: ReadonlyArray<'document' | 'image' | 'text'>
  [GOOGLE_GEMINI_2_5_PRO.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [OPENAI_GPT_5_1_CODEX_MAX.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_5_1.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [SAO10K_L3_EURYALE_70B.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_3_5_TURBO_INSTRUCT.id]: ReadonlyArray<'text'>
  [OPENAI_CODEX_MINI.id]: ReadonlyArray<'image' | 'text'>
  [QWEN_QWEN_MAX.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_5_2.id]: ReadonlyArray<'document' | 'image' | 'text'>
  [OPENAI_GPT_5_2_CHAT.id]: ReadonlyArray<'document' | 'image' | 'text'>
  [MISTRALAI_MISTRAL_LARGE_2411.id]: ReadonlyArray<'text'>
  [MISTRALAI_PIXTRAL_LARGE_2411.id]: ReadonlyArray<'text' | 'image'>
  [MISTRALAI_MIXTRAL_8X22B_INSTRUCT.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_LARGE.id]: ReadonlyArray<'text'>
  [MISTRALAI_MISTRAL_LARGE_2407.id]: ReadonlyArray<'text'>
  [PERPLEXITY_SONAR_DEEP_RESEARCH.id]: ReadonlyArray<'text'>
  [PERPLEXITY_SONAR_REASONING_PRO.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_4_1.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [OPENAI_O3.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [AI21_JAMBA_LARGE_1_7.id]: ReadonlyArray<'text'>
  [OPENAI_O4_MINI_DEEP_RESEARCH.id]: ReadonlyArray<
    'document' | 'image' | 'text'
  >
  [GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id]: ReadonlyArray<'image' | 'text'>
  [GOOGLE_GEMINI_3_PRO_PREVIEW.id]: ReadonlyArray<
    'text' | 'image' | 'document' | 'audio' | 'video'
  >
  [OPENAI_GPT_5_IMAGE_MINI.id]: ReadonlyArray<'document' | 'image' | 'text'>
  [OPENAI_GPT_4O_SEARCH_PREVIEW.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_4O_AUDIO_PREVIEW.id]: ReadonlyArray<'audio' | 'text'>
  [COHERE_COMMAND_A.id]: ReadonlyArray<'text'>
  [INFLECTION_INFLECTION_3_PI.id]: ReadonlyArray<'text'>
  [INFLECTION_INFLECTION_3_PRODUCTIVITY.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_4O_2024_11_20.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [OPENAI_GPT_4O_2024_08_06.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [OPENAI_GPT_4O.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [COHERE_COMMAND_R_PLUS_08_2024.id]: ReadonlyArray<'text'>
  [AMAZON_NOVA_PREMIER_V1.id]: ReadonlyArray<'text' | 'image'>
  [SAO10K_L3_1_70B_HANAMI_X1.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_3_5_TURBO_16K.id]: ReadonlyArray<'text'>
  [ANTHRACITE_ORG_MAGNUM_V4_72B.id]: ReadonlyArray<'text'>
  [ANTHROPIC_CLAUDE_SONNET_4_5.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [X_AI_GROK_3.id]: ReadonlyArray<'text'>
  [ANTHROPIC_CLAUDE_3_7_SONNET_THINKING.id]: ReadonlyArray<
    'text' | 'image' | 'document'
  >
  [X_AI_GROK_4.id]: ReadonlyArray<'image' | 'text'>
  [PERPLEXITY_SONAR_PRO.id]: ReadonlyArray<'text' | 'image'>
  [X_AI_GROK_3_BETA.id]: ReadonlyArray<'text'>
  [ANTHROPIC_CLAUDE_SONNET_4.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [ANTHROPIC_CLAUDE_3_7_SONNET.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [PERPLEXITY_SONAR_PRO_SEARCH.id]: ReadonlyArray<'text' | 'image'>
  [META_LLAMA_LLAMA_3_1_405B_INSTRUCT.id]: ReadonlyArray<'text'>
  [DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_405B.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_1_405B.id]: ReadonlyArray<'text'>
  [AION_LABS_AION_1_0.id]: ReadonlyArray<'text'>
  [RAIFLE_SORCERERLM_8X22B.id]: ReadonlyArray<'text'>
  [OPENAI_CHATGPT_4O_LATEST.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_4O_2024_05_13.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [ANTHROPIC_CLAUDE_OPUS_4_5.id]: ReadonlyArray<'document' | 'image' | 'text'>
  [ALPINDALE_GOLIATH_120B.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_4O_EXTENDED.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [ANTHROPIC_CLAUDE_3_5_SONNET.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [OPENAI_GPT_5_IMAGE.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [OPENAI_GPT_4_1106_PREVIEW.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_4_TURBO.id]: ReadonlyArray<'text' | 'image'>
  [OPENAI_GPT_4_TURBO_PREVIEW.id]: ReadonlyArray<'text'>
  [OPENAI_O3_DEEP_RESEARCH.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [OPENAI_O1.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [ANTHROPIC_CLAUDE_OPUS_4_1.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [ANTHROPIC_CLAUDE_OPUS_4.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [OPENAI_GPT_5_PRO.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [OPENAI_O3_PRO.id]: ReadonlyArray<'text' | 'document' | 'image'>
  [OPENAI_GPT_5_2_PRO.id]: ReadonlyArray<'image' | 'text' | 'document'>
  [OPENAI_GPT_4.id]: ReadonlyArray<'text'>
  [OPENAI_GPT_4_0314.id]: ReadonlyArray<'text'>
  [OPENAI_O1_PRO.id]: ReadonlyArray<'text' | 'image' | 'document'>
  [ALLENAI_OLMO_2_0325_32B_INSTRUCT.id]: ReadonlyArray<'text'>
  [META_LLAMA_LLAMA_3_2_90B_VISION_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>
  [ANTHROPIC_CLAUDE_3_5_HAIKU_20241022.id]: ReadonlyArray<
    'text' | 'image' | 'document'
  >
  'openrouter/auto': ReadonlyArray<
    'text' | 'image' | 'audio' | 'video' | 'document'
  >
}

export const OPENROUTER_CHAT_MODELS = [
  NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE.id,
  META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE.id,
  QWEN_QWEN3_CODER_FREE.id,
  TNGTECH_DEEPSEEK_R1T2_CHIMERA_FREE.id,
  QWEN_QWEN3_4B_FREE.id,
  GOOGLE_GEMMA_3N_E2B_IT_FREE.id,
  META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE.id,
  GOOGLE_GEMMA_3_12B_IT_FREE.id,
  COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE.id,
  Z_AI_GLM_4_5_AIR_FREE.id,
  MOONSHOTAI_KIMI_K2_FREE.id,
  GOOGLE_GEMMA_3_27B_IT_FREE.id,
  GOOGLE_GEMMA_3_4B_IT_FREE.id,
  NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE.id,
  TNGTECH_TNG_R1T_CHIMERA_FREE.id,
  NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE.id,
  ARCEE_AI_TRINITY_MINI_FREE.id,
  TNGTECH_DEEPSEEK_R1T_CHIMERA_FREE.id,
  GOOGLE_GEMMA_3N_E4B_IT_FREE.id,
  GOOGLE_GEMINI_2_0_FLASH_EXP_FREE.id,
  OPENAI_GPT_OSS_120B_FREE.id,
  OPENAI_GPT_OSS_20B_FREE.id,
  MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT_FREE.id,
  MISTRALAI_DEVSTRAL_2512_FREE.id,
  XIAOMI_MIMO_V2_FLASH_FREE.id,
  ALLENAI_MOLMO_2_8B_FREE.id,
  DEEPSEEK_DEEPSEEK_R1_0528_FREE.id,
  NVIDIA_NEMOTRON_NANO_9B_V2_FREE.id,
  META_LLAMA_LLAMA_3_1_405B_INSTRUCT_FREE.id,
  QWEN_QWEN_2_5_VL_7B_INSTRUCT_FREE.id,
  MISTRALAI_MISTRAL_7B_INSTRUCT_FREE.id,
  LIQUID_LFM_2_2_6B.id,
  LIQUID_LFM2_8B_A1B.id,
  IBM_GRANITE_GRANITE_4_0_H_MICRO.id,
  GOOGLE_GEMMA_3_4B_IT.id,
  META_LLAMA_LLAMA_3_2_3B_INSTRUCT.id,
  MISTRALAI_MISTRAL_NEMO.id,
  GOOGLE_GEMMA_3N_E4B_IT.id,
  META_LLAMA_LLAMA_3_1_8B_INSTRUCT.id,
  META_LLAMA_LLAMA_GUARD_3_8B.id,
  OPENAI_GPT_OSS_20B.id,
  NOUSRESEARCH_DEEPHERMES_3_MISTRAL_24B_PREVIEW.id,
  NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B.id,
  META_LLAMA_LLAMA_3_2_1B_INSTRUCT.id,
  MISTRALAI_MISTRAL_7B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_8B_INSTRUCT.id,
  GOOGLE_GEMMA_2_9B_IT.id,
  QWEN_QWEN2_5_CODER_7B_INSTRUCT.id,
  GOOGLE_GEMMA_3_12B_IT.id,
  MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT.id,
  DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B.id,
  QWEN_QWEN_2_5_CODER_32B_INSTRUCT.id,
  MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501.id,
  QWEN_QWEN3_8B.id,
  AMAZON_NOVA_MICRO_V1.id,
  COHERE_COMMAND_R7B_12_2024.id,
  OPENAI_GPT_OSS_120B.id,
  OPENAI_GPT_OSS_120B_EXACTO.id,
  MISTRALAI_MINISTRAL_3B.id,
  SAO10K_L3_LUNARIS_8B.id,
  QWEN_QWEN_2_5_7B_INSTRUCT.id,
  GOOGLE_GEMMA_3_27B_IT.id,
  NVIDIA_NEMOTRON_NANO_9B_V2.id,
  ARCEE_AI_TRINITY_MINI.id,
  META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT.id,
  MICROSOFT_PHI_4_MULTIMODAL_INSTRUCT.id,
  QWEN_QWEN_TURBO.id,
  Z_AI_GLM_4_5_AIR.id,
  QWEN_QWEN2_5_VL_32B_INSTRUCT.id,
  QWEN_QWEN3_14B.id,
  MISTRALAI_DEVSTRAL_2512.id,
  OPENAI_GPT_5_NANO.id,
  QWEN_QWEN3_30B_A3B_THINKING_2507.id,
  GRYPHE_MYTHOMAX_L2_13B.id,
  DEEPSEEK_DEEPSEEK_R1_0528_QWEN3_8B.id,
  MISTRALAI_DEVSTRAL_SMALL_2505.id,
  MICROSOFT_PHI_4.id,
  MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT.id,
  QWEN_QWEN3_30B_A3B.id,
  AMAZON_NOVA_LITE_V1.id,
  NVIDIA_NEMOTRON_3_NANO_30B_A3B.id,
  QWEN_QWEN3_CODER_30B_A3B_INSTRUCT.id,
  MISTRALAI_DEVSTRAL_SMALL.id,
  BAIDU_ERNIE_4_5_21B_A3B_THINKING.id,
  BAIDU_ERNIE_4_5_21B_A3B.id,
  MICROSOFT_PHI_4_REASONING_PLUS.id,
  QWEN_QWEN3_235B_A22B_2507.id,
  OPENAI_GPT_OSS_SAFEGUARD_20B.id,
  BYTEDANCE_SEED_SEED_1_6_FLASH.id,
  GOOGLE_GEMINI_2_0_FLASH_LITE_001.id,
  QWEN_QWEN3_32B.id,
  META_LLAMA_LLAMA_4_SCOUT.id,
  QWEN_QWEN3_30B_A3B_INSTRUCT_2507.id,
  QWEN_QWEN3_VL_8B_INSTRUCT.id,
  ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B.id,
  NEVERSLEEP_LLAMA_3_1_LUMIMAID_8B.id,
  QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT.id,
  Z_AI_GLM_4_32B.id,
  MISTRALAI_PIXTRAL_12B.id,
  MISTRALAI_MINISTRAL_3B_2512.id,
  MISTRAL_MINISTRAL_8B.id,
  MISTRALAI_MINISTRAL_8B.id,
  ALLENAI_OLMO_3_7B_INSTRUCT.id,
  BYTEDANCE_UI_TARS_1_5_7B.id,
  MISTRALAI_MISTRAL_SMALL_CREATIVE.id,
  MISTRALAI_VOXTRAL_SMALL_24B_2507.id,
  META_LLAMA_LLAMA_3_3_70B_INSTRUCT.id,
  OPENGVLAB_INTERNVL3_78B.id,
  OPENAI_GPT_4_1_NANO.id,
  GOOGLE_GEMINI_2_0_FLASH_001.id,
  GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025.id,
  GOOGLE_GEMINI_2_5_FLASH_LITE.id,
  NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5.id,
  QWEN_QWEN3_VL_4B_INSTRUCT.id,
  MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1.id,
  NOUSRESEARCH_HERMES_4_70B.id,
  QWEN_QWEN3_235B_A22B_THINKING_2507.id,
  ALLENAI_OLMO_3_7B_THINK.id,
  QWEN_QWEN_2_5_72B_INSTRUCT.id,
  BAIDU_ERNIE_4_5_VL_28B_A3B.id,
  TENCENT_HUNYUAN_A13B_INSTRUCT.id,
  DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_14B.id,
  ESSENTIALAI_RNJ_1_INSTRUCT.id,
  MISTRALAI_MINISTRAL_8B_2512.id,
  QWEN_QWQ_32B.id,
  ALLENAI_OLMO_3_1_32B_THINK.id,
  ALLENAI_OLMO_3_32B_THINK.id,
  QWEN_QWEN3_VL_30B_A3B_INSTRUCT.id,
  META_LLAMA_LLAMA_4_MAVERICK.id,
  OPENAI_GPT_4O_MINI_SEARCH_PREVIEW.id,
  OPENAI_GPT_4O_MINI_2024_07_18.id,
  OPENAI_GPT_4O_MINI.id,
  COHERE_COMMAND_R_08_2024.id,
  QWEN_QWEN2_5_VL_72B_INSTRUCT.id,
  DEEPSEEK_DEEPSEEK_CHAT_V3_1.id,
  QWEN_QWEN3_NEXT_80B_A3B_THINKING.id,
  THEDRUMMER_ROCINANTE_12B.id,
  ARCEE_AI_SPOTLIGHT.id,
  META_LLAMA_LLAMA_GUARD_4_12B.id,
  QWEN_QWEN3_235B_A22B.id,
  DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_109B_MOE.id,
  QWEN_QWEN3_VL_8B_THINKING.id,
  DEEPSEEK_DEEPSEEK_CHAT_V3_0324.id,
  META_LLAMA_LLAMA_GUARD_2_8B.id,
  MISTRALAI_MISTRAL_7B_INSTRUCT_V0_3.id,
  QWEN_QWEN_2_5_VL_7B_INSTRUCT.id,
  MISTRALAI_MINISTRAL_14B_2512.id,
  MISTRALAI_MISTRAL_7B_INSTRUCT_V0_2.id,
  AI21_JAMBA_MINI_1_7.id,
  X_AI_GROK_4_1_FAST.id,
  X_AI_GROK_4_FAST.id,
  NVIDIA_NEMOTRON_NANO_12B_V2_VL.id,
  MISTRALAI_MISTRAL_SABA.id,
  ALLENAI_OLMO_3_1_32B_INSTRUCT.id,
  MEITUAN_LONGCAT_FLASH_CHAT.id,
  QWEN_QWEN3_VL_30B_A3B_THINKING.id,
  MINIMAX_MINIMAX_M2.id,
  MINIMAX_MINIMAX_01.id,
  PRIME_INTELLECT_INTELLECT_3.id,
  QWEN_QWEN3_VL_235B_A22B_INSTRUCT.id,
  X_AI_GROK_CODE_FAST_1.id,
  KWAIPILOT_KAT_CODER_PRO.id,
  DEEPSEEK_DEEPSEEK_V3_2_EXP.id,
  QWEN_QWEN_VL_PLUS.id,
  DEEPSEEK_DEEPSEEK_V3_1_TERMINUS_EXACTO.id,
  DEEPSEEK_DEEPSEEK_V3_1_TERMINUS.id,
  QWEN_QWEN3_CODER.id,
  QWEN_QWEN3_CODER_EXACTO.id,
  MISTRALAI_MISTRAL_TINY.id,
  DEEPSEEK_DEEPSEEK_V3_2.id,
  TNGTECH_DEEPSEEK_R1T2_CHIMERA.id,
  TNGTECH_TNG_R1T_CHIMERA.id,
  INCEPTION_MERCURY.id,
  INCEPTION_MERCURY_CODER.id,
  ANTHROPIC_CLAUDE_3_HAIKU.id,
  OPENAI_GPT_5_MINI.id,
  OPENAI_GPT_5_1_CODEX_MINI.id,
  BYTEDANCE_SEED_SEED_1_6.id,
  DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B.id,
  DEEPSEEK_DEEPSEEK_V3_2_SPECIALE.id,
  NEX_AGI_DEEPSEEK_V3_1_NEX_N1.id,
  MINIMAX_MINIMAX_M2_1.id,
  BAIDU_ERNIE_4_5_300B_A47B.id,
  MOONSHOTAI_KIMI_DEV_72B.id,
  NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B.id,
  META_LLAMA_LLAMA_3_70B_INSTRUCT.id,
  THEDRUMMER_CYDONIA_24B_V4_1.id,
  X_AI_GROK_3_MINI.id,
  X_AI_GROK_3_MINI_BETA.id,
  Z_AI_GLM_4_6V.id,
  MISTRALAI_CODESTRAL_2508.id,
  DEEPSEEK_DEEPSEEK_CHAT.id,
  TNGTECH_DEEPSEEK_R1T_CHIMERA.id,
  QWEN_QWEN3_CODER_FLASH.id,
  GOOGLE_GEMINI_2_5_FLASH_IMAGE_PREVIEW.id,
  GOOGLE_GEMINI_2_5_FLASH_PREVIEW_09_2025.id,
  GOOGLE_GEMINI_2_5_FLASH_IMAGE.id,
  AMAZON_NOVA_2_LITE_V1.id,
  GOOGLE_GEMINI_2_5_FLASH.id,
  Z_AI_GLM_4_6.id,
  Z_AI_GLM_4_5.id,
  MOONSHOTAI_KIMI_K2_0905.id,
  META_LLAMA_LLAMA_3_1_70B_INSTRUCT.id,
  THEDRUMMER_UNSLOPNEMO_12B.id,
  QWEN_QWEN_PLUS_2025_07_28.id,
  QWEN_QWEN_PLUS.id,
  Z_AI_GLM_4_7.id,
  OPENAI_GPT_4_1_MINI.id,
  MOONSHOTAI_KIMI_K2_THINKING.id,
  MISTRALAI_DEVSTRAL_MEDIUM.id,
  MISTRALAI_MISTRAL_MEDIUM_3.id,
  MISTRALAI_MISTRAL_MEDIUM_3_1.id,
  MINIMAX_MINIMAX_M1.id,
  QWEN_QWEN_PLUS_2025_07_28_THINKING.id,
  BAIDU_ERNIE_4_5_VL_424B_A47B.id,
  Z_AI_GLM_4_6_EXACTO.id,
  UNDI95_REMM_SLERP_L2_13B.id,
  DEEPSEEK_DEEPSEEK_R1_0528.id,
  QWEN_QWEN3_VL_235B_A22B_THINKING.id,
  MICROSOFT_WIZARDLM_2_8X22B.id,
  ARCEE_AI_CODER_LARGE.id,
  MISTRALAI_MISTRAL_LARGE_2512.id,
  QWEN_QWEN3_VL_32B_INSTRUCT.id,
  OPENAI_GPT_3_5_TURBO.id,
  DEEPSEEK_DEEPSEEK_PROVER_V2.id,
  MOONSHOTAI_KIMI_K2.id,
  GOOGLE_GEMINI_3_FLASH_PREVIEW.id,
  MISTRALAI_MIXTRAL_8X7B_INSTRUCT.id,
  THEDRUMMER_SKYFALL_36B_V2.id,
  MINIMAX_MINIMAX_M1_80K.id,
  STEPFUN_AI_STEP3.id,
  NVIDIA_LLAMA_3_1_NEMOTRON_ULTRA_253B_V1.id,
  Z_AI_GLM_4_5V.id,
  MOONSHOTAI_KIMI_K2_0905_EXACTO.id,
  GOOGLE_GEMMA_2_27B_IT.id,
  SAO10K_L3_3_EURYALE_70B.id,
  SAO10K_L3_1_EURYALE_70B.id,
  AION_LABS_AION_1_0_MINI.id,
  DEEPSEEK_DEEPSEEK_R1.id,
  MANCER_WEAVER.id,
  ARCEE_AI_VIRTUOSO_LARGE.id,
  MORPH_MORPH_V3_FAST.id,
  ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY.id,
  ELEUTHERAI_LLEMMA_7B.id,
  AION_LABS_AION_RP_LLAMA_3_1_8B.id,
  AMAZON_NOVA_PRO_V1.id,
  QWEN_QWEN_VL_MAX.id,
  ANTHROPIC_CLAUDE_3_5_HAIKU.id,
  RELACE_RELACE_APPLY_3.id,
  SWITCHPOINT_ROUTER.id,
  DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_70B.id,
  MORPH_MORPH_V3_LARGE.id,
  ARCEE_AI_MAESTRO_REASONING.id,
  PERPLEXITY_SONAR.id,
  NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B.id,
  NEVERSLEEP_NOROMAID_20B.id,
  OPENAI_GPT_3_5_TURBO_0613.id,
  RELACE_RELACE_SEARCH.id,
  NOUSRESEARCH_HERMES_4_405B.id,
  QWEN_QWEN3_CODER_PLUS.id,
  ANTHROPIC_CLAUDE_HAIKU_4_5.id,
  OPENAI_O4_MINI_HIGH.id,
  OPENAI_O3_MINI_HIGH.id,
  OPENAI_O3_MINI.id,
  OPENAI_O4_MINI.id,
  NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT.id,
  QWEN_QWEN3_MAX.id,
  DEEPCOGITO_COGITO_V2_1_671B.id,
  GOOGLE_GEMINI_2_5_PRO_PREVIEW.id,
  OPENAI_GPT_5_CHAT.id,
  GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06.id,
  OPENAI_GPT_5.id,
  OPENAI_GPT_5_CODEX.id,
  OPENAI_GPT_5_1_CODEX.id,
  OPENAI_GPT_5_1_CHAT.id,
  GOOGLE_GEMINI_2_5_PRO.id,
  OPENAI_GPT_5_1_CODEX_MAX.id,
  OPENAI_GPT_5_1.id,
  SAO10K_L3_EURYALE_70B.id,
  OPENAI_GPT_3_5_TURBO_INSTRUCT.id,
  OPENAI_CODEX_MINI.id,
  QWEN_QWEN_MAX.id,
  OPENAI_GPT_5_2.id,
  OPENAI_GPT_5_2_CHAT.id,
  MISTRALAI_MISTRAL_LARGE_2411.id,
  MISTRALAI_PIXTRAL_LARGE_2411.id,
  MISTRALAI_MIXTRAL_8X22B_INSTRUCT.id,
  MISTRALAI_MISTRAL_LARGE.id,
  MISTRALAI_MISTRAL_LARGE_2407.id,
  PERPLEXITY_SONAR_DEEP_RESEARCH.id,
  PERPLEXITY_SONAR_REASONING_PRO.id,
  OPENAI_GPT_4_1.id,
  OPENAI_O3.id,
  AI21_JAMBA_LARGE_1_7.id,
  OPENAI_O4_MINI_DEEP_RESEARCH.id,
  GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id,
  GOOGLE_GEMINI_3_PRO_PREVIEW.id,
  OPENAI_GPT_5_IMAGE_MINI.id,
  OPENAI_GPT_4O_SEARCH_PREVIEW.id,
  OPENAI_GPT_4O_AUDIO_PREVIEW.id,
  COHERE_COMMAND_A.id,
  INFLECTION_INFLECTION_3_PI.id,
  INFLECTION_INFLECTION_3_PRODUCTIVITY.id,
  OPENAI_GPT_4O_2024_11_20.id,
  OPENAI_GPT_4O_2024_08_06.id,
  OPENAI_GPT_4O.id,
  COHERE_COMMAND_R_PLUS_08_2024.id,
  AMAZON_NOVA_PREMIER_V1.id,
  SAO10K_L3_1_70B_HANAMI_X1.id,
  OPENAI_GPT_3_5_TURBO_16K.id,
  ANTHRACITE_ORG_MAGNUM_V4_72B.id,
  ANTHROPIC_CLAUDE_SONNET_4_5.id,
  X_AI_GROK_3.id,
  ANTHROPIC_CLAUDE_3_7_SONNET_THINKING.id,
  X_AI_GROK_4.id,
  PERPLEXITY_SONAR_PRO.id,
  X_AI_GROK_3_BETA.id,
  ANTHROPIC_CLAUDE_SONNET_4.id,
  ANTHROPIC_CLAUDE_3_7_SONNET.id,
  PERPLEXITY_SONAR_PRO_SEARCH.id,
  META_LLAMA_LLAMA_3_1_405B_INSTRUCT.id,
  DEEPCOGITO_COGITO_V2_PREVIEW_LLAMA_405B.id,
  META_LLAMA_LLAMA_3_1_405B.id,
  AION_LABS_AION_1_0.id,
  RAIFLE_SORCERERLM_8X22B.id,
  OPENAI_CHATGPT_4O_LATEST.id,
  OPENAI_GPT_4O_2024_05_13.id,
  ANTHROPIC_CLAUDE_OPUS_4_5.id,
  ALPINDALE_GOLIATH_120B.id,
  OPENAI_GPT_4O_EXTENDED.id,
  ANTHROPIC_CLAUDE_3_5_SONNET.id,
  OPENAI_GPT_5_IMAGE.id,
  OPENAI_GPT_4_1106_PREVIEW.id,
  OPENAI_GPT_4_TURBO.id,
  OPENAI_GPT_4_TURBO_PREVIEW.id,
  OPENAI_O3_DEEP_RESEARCH.id,
  OPENAI_O1.id,
  ANTHROPIC_CLAUDE_OPUS_4_1.id,
  ANTHROPIC_CLAUDE_OPUS_4.id,
  OPENAI_GPT_5_PRO.id,
  OPENAI_O3_PRO.id,
  OPENAI_GPT_5_2_PRO.id,
  OPENAI_GPT_4.id,
  OPENAI_GPT_4_0314.id,
  OPENAI_O1_PRO.id,
  ALLENAI_OLMO_2_0325_32B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_2_90B_VISION_INSTRUCT.id,
  ANTHROPIC_CLAUDE_3_5_HAIKU_20241022.id,
  'openrouter/auto',
] as const

export const OPENROUTER_IMAGE_MODELS = [
  GOOGLE_GEMINI_2_5_FLASH_IMAGE_PREVIEW.id,
  GOOGLE_GEMINI_2_5_FLASH_IMAGE.id,
  GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id,
  OPENAI_GPT_5_IMAGE_MINI.id,
  OPENAI_GPT_5_IMAGE.id,
] as const
