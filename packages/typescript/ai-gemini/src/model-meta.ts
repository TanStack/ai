interface ModelMeta {
  name: string;
  supports: {
    input: ("text" | "image" | "audio" | "video" | "pdf")[];
    output: ("text" | "image" | "audio" | "video")[];
    capabilities?: ("audio_generation" | "batch_api" | "caching" | "code_execution" | "file_search" | "function_calling" | "grounding_with_gmaps" | "image_generation" | "live_api" | "search_grounding" | "structured_output" | "thinking" | "url_context")[]
  };
  max_input_tokens?: number;
  max_output_tokens?: number;
  knowledge_cutoff?: string;
  pricing?: {
    input: {
      normal: number;
      cached?: number;
    };
    output: {
      normal: number;
    };
  };
}


const GEMINI_3_PRO = {
  name: "gemini-3-pro-preview",
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: "2025-01-01",
  supports: {
    input: ["text", "image", "audio", "video", "pdf"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "code_execution",
      "file_search",
      "function_calling",
      "search_grounding",
      "structured_output",
      "thinking",
      "url_context"
    ]
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_5_PRO = {
  name: "gemini-2.5-pro",
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: "2025-01-01",
  supports: {
    input: ["text", "image", "audio", "video", "pdf"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "code_execution",
      "file_search",
      "function_calling",
      "grounding_with_gmaps",
      "search_grounding",
      "structured_output",
      "thinking",
      "url_context"
    ]
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15
    }
  }
} as const satisfies ModelMeta

const GEMINI_2_5_PRO_TTS = {
  name: "gemini-2.5-pro-preview-tts",
  max_input_tokens: 8_192,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2025-05-01",
  supports: {
    input: ["text",],
    output: ["audio"],
    capabilities: [
      "audio_generation",
      "file_search"
    ]
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15
    }
  }
} as const satisfies ModelMeta

const GEMINI_2_5_FLASH = {
  name: "gemini-2.5-flash",
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: "2025-01-01",
  supports: {
    input: ["text", "image", "audio", "video"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "code_execution",
      "file_search",
      "function_calling",
      "grounding_with_gmaps",
      "search_grounding",
      "structured_output",
      "thinking",
      "url_context"
    ]
  },
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 2.5
    }
  }
} as const satisfies ModelMeta

const GEMINI_2_5_FLASH_PREVIEW = {
  name: "gemini-2.5-flash-preview-09-2025",
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: "2025-01-01",
  supports: {
    input: ["text", "image", "audio", "video"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "code_execution",
      "file_search",
      "function_calling",
      "search_grounding",
      "structured_output",
      "thinking",
      "url_context"
    ]
  },
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 2.5
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_5_FLASH_IMAGE = {
  name: "gemini-2.5-flash-image",
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: "2025-06-01",
  supports: {
    input: ["text", "image"],
    output: ["text", "image"],
    capabilities: [
      "batch_api",
      "caching",
      "file_search",
      "image_generation",
      "structured_output",
    ]
  },
  pricing: {
    input: {
      normal: 0.3,
    },
    output: {
      normal: 0.4
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_5_FLASH_LIVE = {
  name: "gemini-2.5-flash-native-audio-preview-09-2025",
  max_input_tokens: 141_072,
  max_output_tokens: 8_192,
  knowledge_cutoff: "2025-01-01",
  supports: {
    input: ["text", "audio", "video"],
    output: ["text", "audio"],
    capabilities: [
      "audio_generation",
      "file_search",
      "function_calling",
      "live_api",
      "search_grounding",
      "thinking"
    ]
  },
  pricing: {
    // todo find this info
    input: {
      normal: 0,
    },
    output: {
      normal: 0
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_5_FLASH_TTS = {
  name: "gemini-2.5-flash-preview-tts",
  max_input_tokens: 8_192,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2025-05-01",
  supports: {
    input: ["text",],
    output: ["audio"],
    capabilities: [
      "audio_generation",
      "batch_api",
      "file_search"
    ]
  },
  pricing: {
    input: {
      normal: 1,
    },
    output: {
      normal: 2.5
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_5_FLASH_LITE = {
  name: "gemini-2.5-flash-lite",
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: "2025-01-01",
  supports: {
    input: ["text", "image", "audio", "video", "pdf"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "code_execution",
      "function_calling",
      "grounding_with_gmaps",
      "search_grounding",
      "structured_output",
      "thinking",
      "url_context"
    ]
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.4
    }
  }
} as const satisfies ModelMeta

const GEMINI_2_5_FLASH_LITE_PREVIEW = {
  name: "gemini-2.5-flash-lite-preview-09-2025",
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: "2025-01-01",
  supports: {
    input: ["text", "image", "audio", "video", "pdf"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "code_execution",
      "function_calling",
      "search_grounding",
      "structured_output",
      "thinking",
      "url_context"
    ]
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.4
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_FLASH = {
  name: "gemini-2.0-flash",
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  knowledge_cutoff: "2024-08-01",
  supports: {
    input: ["text", "image", "audio", "video"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "code_execution",
      "function_calling",
      "grounding_with_gmaps",
      "live_api",
      "search_grounding",
      "structured_output"
    ]
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.4
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_FLASH_IMAGE = {
  name: "gemini-2.0-flash-preview-image-generation",
  max_input_tokens: 32_768,
  max_output_tokens: 8_192,
  knowledge_cutoff: "2024-08-01",
  supports: {
    input: ["text", "image", "audio", "video"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "image_generation",
      "structured_output"
    ]
  },
  pricing: {
    input: {
      normal: 0.1,
    },
    output: {
      normal: 0.039
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_FLASH_LIVE = {
  name: "gemini-2.0-flash-live-001",
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  knowledge_cutoff: "2024-08-01",
  supports: {
    input: ["text", "audio", "video"],
    output: ["text", "audio"],
    capabilities: [
      "audio_generation",
      "code_execution",
      "function_calling",
      "live_api",
      "search_grounding",
      "structured_output",
      "url_context"
    ]
  },
  pricing: {
    // todo find this info
    input: {
      normal: 0,
    },
    output: {
      normal: 0
    }
  }
} as const satisfies ModelMeta


const GEMINI_2_FLASH_LITE = {
  name: "gemini-2.0-flash-lite",
  max_input_tokens: 1_048_576,
  max_output_tokens: 8_192,
  knowledge_cutoff: "2024-08-01",
  supports: {
    input: ["text", "audio", "video", "image"],
    output: ["text"],
    capabilities: [
      "batch_api",
      "caching",
      "function_calling",
      "structured_output"
    ]
  },
  pricing: {
    input: {
      normal: 0.075,
    },
    output: {
      normal: 0.3
    }
  }
} as const satisfies ModelMeta

const IMAGEN_4_GENERATE = {
  name: "imagen-4.0-generate-001",
  max_input_tokens: 480,
  max_output_tokens: 4,
  supports: {
    input: ["text"],
    output: ["image"],

  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.4
    }
  }
} as const satisfies ModelMeta

const IMAGEN_4_GENERATE_ULTRA = {
  name: "imagen-4.0-ultra-generate-001",
  max_input_tokens: 480,
  max_output_tokens: 4,
  supports: {
    input: ["text"],
    output: ["image"],

  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.6
    }
  }
} as const satisfies ModelMeta


const IMAGEN_4_GENERATE_FAST = {
  name: "imagen-4.0-fast-generate-001",
  max_input_tokens: 480,
  max_output_tokens: 4,
  supports: {
    input: ["text"],
    output: ["image"],

  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.2
    }
  }
} as const satisfies ModelMeta


const IMAGEN_3 = {
  name: "imagen-3.0-generate-002",
  max_output_tokens: 4,
  supports: {
    input: ["text"],
    output: ["image"],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.03
    }
  }
} as const satisfies ModelMeta

const VEO_3_1_PREVIEW = {
  name: "veo-3.1-generate-preview",
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ["text", "image"],
    output: ["video", "audio"],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.4
    }
  }
} as const satisfies ModelMeta


const VEO_3_1_FAST_PREVIEW = {
  name: "veo-3.1-fast-generate-preview",
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ["text", "image"],
    output: ["video", "audio"],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.15
    }
  }
} as const satisfies ModelMeta

const VEO_3 = {
  name: "veo-3.0-generate-001",
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ["text", "image"],
    output: ["video", "audio"],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.4
    }
  }
} as const satisfies ModelMeta


const VEO_3_FAST = {
  name: "veo-3.0-fast-generate-001",
  max_input_tokens: 1024,
  max_output_tokens: 1,
  supports: {
    input: ["text", "image"],
    output: ["video", "audio"],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.15
    }
  }
} as const satisfies ModelMeta


const VEO_2 = {
  name: "veo-2.0-generate-001",
  max_output_tokens: 2,
  supports: {
    input: ["text", "image"],
    output: ["video",],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.35
    }
  }
} as const satisfies ModelMeta

const GEMINI_EMBEDDING = {
  name: "gemini-embedding-001",
  max_input_tokens: 2048,
  supports: {
    input: ["text"],
    output: ["text"],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0.15
    }
  }
} as const satisfies ModelMeta;

export const GEMINI_MODELS = [
  GEMINI_3_PRO.name,
  GEMINI_2_5_PRO.name,
  GEMINI_2_5_FLASH.name,
  GEMINI_2_5_FLASH_PREVIEW.name,
  GEMINI_2_5_FLASH_LITE.name,
  GEMINI_2_5_FLASH_LITE_PREVIEW.name,
  GEMINI_2_FLASH.name,
  GEMINI_2_FLASH_LITE.name,
] as const


export const GEMINI_IMAGE_MODELS = [
  GEMINI_2_5_FLASH_IMAGE.name,
  GEMINI_2_FLASH_IMAGE.name,
  IMAGEN_3.name,
  IMAGEN_4_GENERATE.name,
  IMAGEN_4_GENERATE_FAST.name,
  IMAGEN_4_GENERATE_ULTRA.name

] as const;

export const GEMINI_EMBEDDING_MODELS = [
  GEMINI_EMBEDDING.name
] as const;

export const GEMINI_AUDIO_MODELS = [
  GEMINI_2_5_PRO_TTS.name,
  GEMINI_2_5_FLASH_TTS.name,
  GEMINI_2_5_FLASH_LIVE.name,
  GEMINI_2_FLASH_LIVE.name
] as const;

export const GEMINI_VIDEO_MODELS = [
  VEO_3_1_PREVIEW.name,
  VEO_3_1_FAST_PREVIEW.name,
  VEO_3.name,
  VEO_3_FAST.name,
  VEO_2.name
] as const;

export type GeminiChatModels = typeof GEMINI_MODELS[number];