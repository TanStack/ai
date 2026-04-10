import type {
  GeminiCachedContentOptions,
  GeminiCommonConfigOptions,
  GeminiSafetyOptions,
  GeminiStructuredOutputOptions,
  GeminiThinkingAdvancedOptions,
  GeminiThinkingOptions,
  GeminiToolConfigOptions,
} from './text/text-provider-options'

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: Array<'text' | 'image' | 'audio' | 'video'>
    capabilities?: Array<
      | 'audio_generation'
      | 'batch_api'
      | 'caching'
      | 'code_execution'
      | 'file_search'
      | 'function_calling'
      | 'grounding_with_gmaps'
      | 'image_generation'
      | 'live_api'
      | 'search_grounding'
      | 'structured_output'
      | 'thinking'
      | 'url_context'
    >
  }
  max_input_tokens?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  pricing?: {
    input: {
      normal: number
      cached?: number
    }
    output: {
      normal: number
    }
  }
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions
}

const GEMINI_3_1_PRO = {
  name: 'gemini-3.1-pro-preview',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions &
    GeminiThinkingAdvancedOptions
>

const GEMINI_3_PRO = {
  name: 'gemini-3-pro-preview',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions &
    GeminiThinkingAdvancedOptions
>

const GEMINI_3_FLASH = {
  name: 'gemini-3-flash-preview',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 0.5,
    },
    output: {
      normal: 3,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions &
    GeminiThinkingAdvancedOptions
>

const GEMINI_3_PRO_IMAGE = {
  name: 'gemini-3-pro-image-preview',
  max_input_tokens: 65_536,
  max_output_tokens: 32_768,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image'],
    output: ['text', 'image'],
    capabilities: [
      'batch_api',
      'image_generation',
      'search_grounding',
      'structured_output',
      'thinking',
    ],
  },
  pricing: {
    input: {
      normal: 2,
    },
    output: {
      normal: 0.134,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions &
    GeminiThinkingAdvancedOptions
>

const GEMINI_3_1_FLASH_IMAGE = {
  name: 'gemini-3.1-flash-image-preview',
  max_input_tokens: 65_536,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image'],
    output: ['text', 'image'],
    capabilities: [
      'batch_api',
      'image_generation',
      'search_grounding',
      'structured_output',
      'thinking',
    ],
  },
  pricing: {
    input: {
      normal: 0.25,
    },
    output: {
      normal: 1.5,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>

const GEMINI_3_1_FLASH_LITE = {
  name: 'gemini-3.1-flash-lite-preview',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 0.25,
    },
    output: {
      normal: 1.5,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>

const GEMINI_2_5_PRO = {
  name: 'gemini-2.5-pro',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'grounding_with_gmaps',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>

const GEMINI_2_5_PRO_TTS = {
  name: 'gemini-2.5-pro-preview-tts',
  max_input_tokens: 8_192,
  max_output_tokens: 16_384,
  knowledge_cutoff: '2025-05-01',
  supports: {
    input: ['text'],
    output: ['audio'],
    capabilities: ['audio_generation', 'file_search'],
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>

const GEMINI_2_5_FLASH = {
  name: 'gemini-2.5-flash',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'grounding_with_gmaps',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 2.5,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>

const GEMINI_2_5_FLASH_PREVIEW = {
  name: 'gemini-2.5-flash-preview-09-2025',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 2.5,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>

const GEMINI_2_5_FLASH_IMAGE = {
  name: 'gemini-2.5-flash-image',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-06-01',
  supports: {
    input: ['text', 'image'],
    output: ['text', 'image'],
    capabilities: [
      'batch_api',
      'caching',
      'file_search',
      'image_generation',
      'structured_output',
    ],
  },
  pricing: {
    input: {
      normal: 0.3,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>
/**
const GEMINI_2_5_FLASH_LIVE = {
  name: 'gemini-2.5-flash-native-audio-preview-09-2025',
  max_input_tokens: 141_072,
  max_output_tokens: 8_192,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'audio', 'video'],
    output: ['text', 'audio'],
    capabilities: [
      'audio_generation',
      'file_search',
      'function_calling',
      'live_api',
      'search_grounding',
      'thinking',
    ],
  },
  pricing: {
    // todo find this info
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions &
  GeminiThinkingOptions
>
*/
const GEMINI_2_5_FLASH_TTS = {
  name: 'gemini-2.5-flash-preview-tts',
  max_input_tokens: 8_192,
  max_output_tokens: 16_384,
  knowledge_cutoff: '2025-05-01',
  supports: {
    input: ['text'],
    output: ['audio'],
    capabilities: ['audio_generation', 'batch_api', 'file_search'],
  },
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 2.5,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>

const GEMINI_2_5_FLASH_LITE = {
  name: 'gemini-2.5-flash-lite',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'function_calling',
      'grounding_with_gmaps',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>

const GEMINI_2_5_FLASH_LITE_PREVIEW = {
  name: 'gemini-2.5-flash-lite-preview-09-2025',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'function_calling',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>

const GEMINI_2_FLASH = {
  name: 'gemini-2.0-flash',
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  knowledge_cutoff: '2024-08-01',
  supports: {
    input: ['text', 'image', 'audio', 'video'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'function_calling',
      'grounding_with_gmaps',
      'live_api',
      'search_grounding',
      'structured_output',
    ],
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions
>

const GEMINI_2_FLASH_IMAGE = {
  name: 'gemini-2.0-flash-preview-image-generation',
  max_input_tokens: 32_768,
  max_output_tokens: 8_192,
  knowledge_cutoff: '2024-08-01',
  supports: {
    input: ['text', 'image', 'audio', 'video'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'image_generation',
      'structured_output',
    ],
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.039,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>
/* 
const GEMINI_2_FLASH_LIVE = {
  name: 'gemini-2.0-flash-live-001',
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  knowledge_cutoff: '2024-08-01',
  supports: {
    input: ['text', 'audio', 'video'],
    output: ['text', 'audio'],
    capabilities: [
      'audio_generation',
      'code_execution',
      'function_calling',
      'live_api',
      'search_grounding',
      'structured_output',
      'url_context',
    ],
  },
  pricing: {
    // todo find this info
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions
> */

const GEMINI_2_FLASH_LITE = {
  name: 'gemini-2.0-flash-lite',
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  knowledge_cutoff: '2024-08-01',
  supports: {
    input: ['text', 'audio', 'video', 'image'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'function_calling',
      'structured_output',
    ],
  },
  pricing: {
    input: {
      normal: 0.075,
    },
    output: {
      normal: 0.3,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions
>

const IMAGEN_4_GENERATE = {
  name: 'imagen-4.0-generate-001',
  max_input_tokens: 480,
  max_output_tokens: 4,
  supports: {
    input: ['text'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>

const IMAGEN_4_GENERATE_ULTRA = {
  name: 'imagen-4.0-ultra-generate-001',
  max_input_tokens: 480,
  max_output_tokens: 4,
  supports: {
    input: ['text'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.6,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>

const IMAGEN_4_GENERATE_FAST = {
  name: 'imagen-4.0-fast-generate-001',
  max_input_tokens: 480,
  max_output_tokens: 4,
  supports: {
    input: ['text'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.2,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>

const IMAGEN_3 = {
  name: 'imagen-3.0-generate-002',
  max_output_tokens: 4,
  supports: {
    input: ['text'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.03,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions
>
/** 
const VEO_3_1_PREVIEW = {
  name: 'veo-3.1-generate-preview',
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ['text', 'image'],
    output: ['video', 'audio'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions
>

const VEO_3_1_FAST_PREVIEW = {
  name: 'veo-3.1-fast-generate-preview',
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ['text', 'image'],
    output: ['video', 'audio'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.15,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions
>

const VEO_3 = {
  name: 'veo-3.0-generate-001',
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ['text', 'image'],
    output: ['video', 'audio'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions
>

const VEO_3_FAST = {
  name: 'veo-3.0-fast-generate-001',
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ['text', 'image'],
    output: ['video', 'audio'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.15,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions
>

const VEO_2 = {
  name: 'veo-2.0-generate-001',
  max_output_tokens: 2,
  supports: {
    input: ['text', 'image'],
    output: ['video'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.35,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions
> */

/* const GEMINI_MODEL_META = {
  [GEMINI_3_PRO.name]: GEMINI_3_PRO,
  [GEMINI_2_5_PRO.name]: GEMINI_2_5_PRO,
  [GEMINI_2_5_PRO_TTS.name]: GEMINI_2_5_PRO_TTS,
  [GEMINI_2_5_FLASH.name]: GEMINI_2_5_FLASH,
  [GEMINI_2_5_FLASH_PREVIEW.name]: GEMINI_2_5_FLASH_PREVIEW,
  [GEMINI_2_5_FLASH_IMAGE.name]: GEMINI_2_5_FLASH_IMAGE,
  [GEMINI_2_5_FLASH_LIVE.name]: GEMINI_2_5_FLASH_LIVE,
  [GEMINI_2_5_FLASH_TTS.name]: GEMINI_2_5_FLASH_TTS,
  [GEMINI_2_5_FLASH_LITE.name]: GEMINI_2_5_FLASH_LITE,
  [GEMINI_2_5_FLASH_LITE_PREVIEW.name]: GEMINI_2_5_FLASH_LITE_PREVIEW,
  [GEMINI_2_FLASH.name]: GEMINI_2_FLASH,
  [GEMINI_2_FLASH_IMAGE.name]: GEMINI_2_FLASH_IMAGE,
  [GEMINI_2_FLASH_LIVE.name]: GEMINI_2_FLASH_LIVE,
  [GEMINI_2_FLASH_LITE.name]: GEMINI_2_FLASH_LITE,
  [IMAGEN_4_GENERATE.name]: IMAGEN_4_GENERATE,
  [IMAGEN_4_GENERATE_ULTRA.name]: IMAGEN_4_GENERATE_ULTRA,
  [IMAGEN_4_GENERATE_FAST.name]: IMAGEN_4_GENERATE_FAST,
  [IMAGEN_3.name]: IMAGEN_3,
  [VEO_3_1_PREVIEW.name]: VEO_3_1_PREVIEW,
  [VEO_3_1_FAST_PREVIEW.name]: VEO_3_1_FAST_PREVIEW,
  [VEO_3.name]: VEO_3,
  [VEO_3_FAST.name]: VEO_3_FAST,
  [VEO_2.name]: VEO_2,
} as const */

const GEMINI_2_0_FLASH_001 = {
  name: 'gemini-2.0-flash-001',
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.1,
      cached: 0.025,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMINI_2_0_FLASH_LITE_001 = {
  name: 'gemini-2.0-flash-lite-001',
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.075,
    },
    output: {
      normal: 0.3,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMINI_2_5_PRO_PREVIEW = {
  name: 'gemini-2.5-pro-preview',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  supports: {
    input: ['document', 'image', 'text', 'audio'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125,
    },
    output: {
      normal: 10,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMINI_2_5_PRO_PREVIEW_05_06 = {
  name: 'gemini-2.5-pro-preview-05-06',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_535,
  supports: {
    input: ['text', 'image', 'document', 'audio', 'video'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125,
    },
    output: {
      normal: 10,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS = {
  name: 'gemini-3.1-pro-preview-customtools',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  supports: {
    input: ['text', 'audio', 'image', 'video', 'document'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 2,
      cached: 0.2,
    },
    output: {
      normal: 12,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_2_27B_IT = {
  name: 'gemma-2-27b-it',
  max_input_tokens: 8_192,
  max_output_tokens: 2_048,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.65,
    },
    output: {
      normal: 0.65,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_2_9B_IT = {
  name: 'gemma-2-9b-it',
  max_input_tokens: 8_192,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.03,
    },
    output: {
      normal: 0.09,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_3_12B_IT = {
  name: 'gemma-3-12b-it',
  max_input_tokens: 131_072,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.04,
    },
    output: {
      normal: 0.13,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_3_27B_IT = {
  name: 'gemma-3-27b-it',
  max_input_tokens: 131_072,
  max_output_tokens: 16_384,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.08,
    },
    output: {
      normal: 0.16,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_3_4B_IT = {
  name: 'gemma-3-4b-it',
  max_input_tokens: 131_072,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.04,
    },
    output: {
      normal: 0.08,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_3N_E4B_IT = {
  name: 'gemma-3n-e4b-it',
  max_input_tokens: 32_768,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.02,
    },
    output: {
      normal: 0.04,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_4_26B_A4B_IT = {
  name: 'gemma-4-26b-a4b-it',
  max_input_tokens: 262_144,
  max_output_tokens: 262_144,
  supports: {
    input: ['image', 'text', 'video'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.13,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

const GEMMA_4_31B_IT = {
  name: 'gemma-4-31b-it',
  max_input_tokens: 262_144,
  max_output_tokens: 131_072,
  supports: {
    input: ['image', 'text', 'video'],
    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],
  },
  pricing: {
    input: {
      normal: 0.14,
    },
    output: {
      normal: 0.4,
    },
  },
} as const satisfies ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>

export const GEMINI_MODELS = [
  GEMINI_3_1_PRO.name,
  GEMINI_3_PRO.name,
  GEMINI_3_FLASH.name,
  GEMINI_3_1_FLASH_LITE.name,
  GEMINI_2_5_PRO.name,
  GEMINI_2_5_FLASH.name,
  GEMINI_2_5_FLASH_PREVIEW.name,
  GEMINI_2_5_FLASH_LITE.name,
  GEMINI_2_5_FLASH_LITE_PREVIEW.name,
  GEMINI_2_FLASH.name,
  GEMINI_2_FLASH_LITE.name,

  GEMINI_2_0_FLASH_001.name,
  GEMINI_2_0_FLASH_LITE_001.name,
  GEMINI_2_5_PRO_PREVIEW.name,
  GEMINI_2_5_PRO_PREVIEW_05_06.name,
  GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS.name,
  GEMMA_2_27B_IT.name,
  GEMMA_2_9B_IT.name,
  GEMMA_3_12B_IT.name,
  GEMMA_3_27B_IT.name,
  GEMMA_3_4B_IT.name,
  GEMMA_3N_E4B_IT.name,
  GEMMA_4_26B_A4B_IT.name,
  GEMMA_4_31B_IT.name,
] as const

export type GeminiModels = (typeof GEMINI_MODELS)[number]

export type GeminiImageModels = (typeof GEMINI_IMAGE_MODELS)[number]

export const GEMINI_IMAGE_MODELS = [
  GEMINI_3_1_FLASH_IMAGE.name,
  GEMINI_3_PRO_IMAGE.name,
  GEMINI_2_5_FLASH_IMAGE.name,
  GEMINI_2_FLASH_IMAGE.name,
  IMAGEN_3.name,
  IMAGEN_4_GENERATE.name,
  IMAGEN_4_GENERATE_FAST.name,
  IMAGEN_4_GENERATE_ULTRA.name,
] as const

/**
 * Text-to-speech models
 * @experimental Gemini TTS is an experimental feature and may change.
 */
export const GEMINI_TTS_MODELS = [
  GEMINI_2_5_FLASH_TTS.name,
  GEMINI_2_5_PRO_TTS.name,
] as const

/**
 * Available voice names for Gemini TTS
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export const GEMINI_TTS_VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const

export type GeminiTTSVoice = (typeof GEMINI_TTS_VOICES)[number]

/*   const GEMINI_AUDIO_MODELS = [
  GEMINI_2_5_PRO_TTS.name,
  GEMINI_2_5_FLASH_TTS.name,
  GEMINI_2_5_FLASH_LIVE.name,
  GEMINI_2_FLASH_LIVE.name,
] as const

  const GEMINI_VIDEO_MODELS = [
  VEO_3_1_PREVIEW.name,
  VEO_3_1_FAST_PREVIEW.name,
  VEO_3.name,
  VEO_3_FAST.name,
  VEO_2.name,
] as const */

// Manual type map for per-model provider options
export type GeminiChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GEMINI_3_1_PRO.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions &
    GeminiThinkingAdvancedOptions
  [GEMINI_3_PRO.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions &
    GeminiThinkingAdvancedOptions
  [GEMINI_3_FLASH.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions &
    GeminiThinkingAdvancedOptions
  [GEMINI_3_1_FLASH_LITE.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  [GEMINI_2_5_PRO.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  [GEMINI_2_5_FLASH.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  [GEMINI_2_5_FLASH_PREVIEW.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  [GEMINI_2_5_FLASH_LITE.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  [GEMINI_2_5_FLASH_LITE_PREVIEW.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  // Models with structured output but no thinking support
  [GEMINI_2_FLASH.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions
  [GEMINI_2_FLASH_LITE.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiCommonConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions
  [GEMINI_2_0_FLASH_001.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMINI_2_0_FLASH_LITE_001.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMINI_2_5_PRO_PREVIEW.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMINI_2_5_PRO_PREVIEW_05_06.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_2_27B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_2_9B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_3_12B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_3_27B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_3_4B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_3N_E4B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_4_26B_A4B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
  [GEMMA_4_31B_IT.name]: GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions
}

/**
 * Type-only map from chat model name to its supported input modalities.
 * Based on the 'supports.input' arrays defined for each model.
 * Note: 'document' in the model meta is mapped to 'document' modality.
 * Used by the core AI types to constrain ContentPart types based on the selected model.
 * Note: These must be inlined as readonly arrays (not typeof) because the model
 * constants are not exported and typeof references don't work in .d.ts files
 * when consumed by external packages.
 *
 * @see https://ai.google.dev/gemini-api/docs/vision
 * @see https://ai.google.dev/gemini-api/docs/audio
 * @see https://ai.google.dev/gemini-api/docs/document-processing
 */
export type GeminiModelInputModalitiesByName = {
  // Models with full multimodal support (text, image, audio, video, document)
  [GEMINI_3_1_PRO.name]: typeof GEMINI_3_1_PRO.supports.input
  [GEMINI_3_PRO.name]: typeof GEMINI_3_PRO.supports.input
  [GEMINI_3_FLASH.name]: typeof GEMINI_3_FLASH.supports.input
  [GEMINI_3_1_FLASH_LITE.name]: typeof GEMINI_3_1_FLASH_LITE.supports.input
  [GEMINI_2_5_PRO.name]: typeof GEMINI_2_5_PRO.supports.input
  [GEMINI_2_5_FLASH_LITE.name]: typeof GEMINI_2_5_FLASH_LITE.supports.input
  [GEMINI_2_5_FLASH_LITE_PREVIEW.name]: typeof GEMINI_2_5_FLASH_LITE_PREVIEW.supports.input

  // Models with text, image, audio, video (no document)
  [GEMINI_2_5_FLASH.name]: typeof GEMINI_2_5_FLASH.supports.input
  [GEMINI_2_5_FLASH_PREVIEW.name]: typeof GEMINI_2_5_FLASH_PREVIEW.supports.input
  [GEMINI_2_FLASH.name]: typeof GEMINI_2_FLASH.supports.input
  [GEMINI_2_FLASH_LITE.name]: typeof GEMINI_2_FLASH_LITE.supports.input
  [GEMINI_2_0_FLASH_001.name]: typeof GEMINI_2_0_FLASH_001.supports.input
  [GEMINI_2_0_FLASH_LITE_001.name]: typeof GEMINI_2_0_FLASH_LITE_001.supports.input
  [GEMINI_2_5_PRO_PREVIEW.name]: typeof GEMINI_2_5_PRO_PREVIEW.supports.input
  [GEMINI_2_5_PRO_PREVIEW_05_06.name]: typeof GEMINI_2_5_PRO_PREVIEW_05_06.supports.input
  [GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS.name]: typeof GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS.supports.input
  [GEMMA_2_27B_IT.name]: typeof GEMMA_2_27B_IT.supports.input
  [GEMMA_2_9B_IT.name]: typeof GEMMA_2_9B_IT.supports.input
  [GEMMA_3_12B_IT.name]: typeof GEMMA_3_12B_IT.supports.input
  [GEMMA_3_27B_IT.name]: typeof GEMMA_3_27B_IT.supports.input
  [GEMMA_3_4B_IT.name]: typeof GEMMA_3_4B_IT.supports.input
  [GEMMA_3N_E4B_IT.name]: typeof GEMMA_3N_E4B_IT.supports.input
  [GEMMA_4_26B_A4B_IT.name]: typeof GEMMA_4_26B_A4B_IT.supports.input
  [GEMMA_4_31B_IT.name]: typeof GEMMA_4_31B_IT.supports.input
}
