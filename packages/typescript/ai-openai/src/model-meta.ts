interface ModelMeta {
  name: string;
  supports: {
    input: ("text" | "image" | "audio" | "video")[];
    output: ("text" | "image" | "audio" | "video")[];
    endpoints: ("chat" | "chat-completions" | "assistants" | "speech_generation" | "image-generation" | "fine-tuning" | "batch" | "image-edit" | "moderation" | "translation" | "realtime" | "embedding" | "audio" | "video" | "transcription")[];
    features: ("streaming" | "function_calling" | "structured_outputs" | "predicted_outcomes" | "distillation" | "fine_tuning")[];
    tools?: ("web_search" | "file_search" | "image_generation" | "code_interpreter" | "mcp" | "computer_use")[];
  };
  context_window?: number;
  max_output_tokens?: number;
  knowledge_cutoff?: string;
  pricing: {
    input: {
      normal: number;
      cached?: number;
    };
    output: {
      normal: number;
    };
  };
}

const GPT5_1 = {
  name: "gpt-5.1",
  context_window: 400_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: "2024-09-30",
  supports: {
    input: ["text", "image"],
    output: ["text", "image"],
    endpoints: ["chat", "chat-completions"],
    features: ["streaming", "function_calling", "structured_outputs", "distillation"],
    tools: ["web_search", "file_search", "image_generation", "code_interpreter", "mcp"]
  },
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125
    },
    output: {
      normal: 10
    }
  }
} as const satisfies ModelMeta

const GPT5_1_CODEX = {
  name: "gpt-5.1-codex",
  context_window: 400_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: "2024-09-30",
  supports: {
    input: ["text", "image"],
    output: ["text", "image"],
    endpoints: ["chat",],
    features: ["streaming", "function_calling", "structured_outputs",],

  },
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125
    },
    output: {
      normal: 10
    }
  }
} as const satisfies ModelMeta

const GPT5 = {
  name: "gpt-5",
  context_window: 400_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: "2024-09-30",
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "batch"],
    features: ["streaming", "function_calling", "structured_outputs", "distillation"],
    tools: ["web_search", "file_search", "image_generation", "code_interpreter", "mcp"]
  },
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125
    },
    output: {
      normal: 10
    }
  }
} as const satisfies ModelMeta

const GPT5_MINI = {
  name: "gpt-5-mini",
  context_window: 400_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: "2024-05-31",
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "batch"],
    features: ["streaming", "structured_outputs", "function_calling"],
    tools: ["web_search", "file_search", "mcp", "code_interpreter"]
  },
  pricing: {
    input: {
      normal: 0.25,
      cached: 0.025
    },
    output: {
      normal: 2
    }
  }
} as const satisfies ModelMeta

const GPT5_NANO = {
  name: "gpt-5-nano",
  context_window: 400_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: "2024-05-31",
  pricing: {
    input: {
      normal: 0.05,
      cached: 0.005
    },
    output: {
      normal: 0.4
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "batch"],
    features: [
      "streaming",
      "structured_outputs",
      "function_calling"
    ],
    tools: ["web_search", "file_search", "mcp", "image_generation", "code_interpreter"]
  }
} as const satisfies ModelMeta

const GPT5_PRO = {
  name: "gpt-5-pro",
  context_window: 400_000,
  max_output_tokens: 272_000,
  knowledge_cutoff: "2024-09-30",
  pricing: {
    input: {
      normal: 15,

    }, output: {
      normal: 120
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch"],
    features: [
      "streaming",
      "structured_outputs",
      "function_calling",],
    tools: ["web_search", "file_search", "image_generation", "mcp"]
  }
} as const satisfies ModelMeta

const GPT5_CODEX = {
  name: "gpt-5-codex",
  context_window: 400_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: "2024-09-30",
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125
    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text", "image"],
    endpoints: ["chat",],
    features: [
      "streaming",
      "structured_outputs",
      "function_calling"],

  }
} as const satisfies ModelMeta


const SORA2 = {
  name: "sora-2",
  pricing: {
    input: {
      normal: 0
    },
    output: {
      // per second of video
      normal: 0.1
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["video", "audio"],
    endpoints: ["video"],
    features: [],

  }
} as const satisfies ModelMeta

const SORA2_PRO = {
  name: "sora-2-pro",
  pricing: {
    input: {
      normal: 0
    },
    output: {
      // per second of video
      normal: 0.5
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["video", "audio"],
    endpoints: ["video"],
    features: [],

  }
} as const satisfies ModelMeta

const GPT_IMAGE_1 = {
  name: "gpt-image-1",
  // todo fix for images
  pricing: {
    input: {
      normal: 5,
      cached: 1.25
    },
    output: {
      normal: 0.1
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["image"],
    endpoints: ["image-generation", "image-edit"],

    features: [],
  }
} as const satisfies ModelMeta

const GPT_IMAGE_1_MINI = {
  name: "gpt-image-1-mini",
  // todo fix for images
  pricing: {
    input: {
      normal: 2,
      cached: 0.2
    },
    output: {
      normal: 0.03
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["image"],
    endpoints: ["image-generation", "image-edit"],

    features: [],
  }
} as const satisfies ModelMeta

const O3_DEEP_RESEARCH = {
  name: "o3-deep-research",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 10,
      cached: 2.5
    },
    output: {
      normal: 40
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch"],
    features: ["streaming"],

  }
} as const satisfies ModelMeta

const O4_MINI_DEEP_RESEARCH = {
  name: "o4-mini-deep-research",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 2,
      cached: 0.5
    },
    output: {
      normal: 8
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch"],
    features: ["streaming"],

  }
} as const satisfies ModelMeta

const O3_PRO = {
  name: "o3-pro",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 20
    },
    output: {
      normal: 80
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch"],
    features: ["function_calling", "structured_outputs"],

  }
} as const satisfies ModelMeta

const GPT_AUDIO = {
  name: "gpt-audio",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo add  audio tokens to input output
    input: {
      normal: 2.5,

    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["text", "audio"],
    output: ["text", "audio"],
    endpoints: ["chat-completions"],
    features: ["function_calling"],

  }
} as const satisfies ModelMeta


const GPT_REALTIME = {
  name: "gpt-realtime",
  context_window: 32_000,
  max_output_tokens: 4_096,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo add  audio tokens to input output
    input: {
      normal: 4,
      cached: 0.5,
    },
    output: {
      normal: 16
    }
  },
  supports: {
    input: ["text", "audio", "image"],
    output: ["text", "audio"],
    endpoints: ["realtime"],
    features: ["function_calling"],

  }
} as const satisfies ModelMeta

const GPT_REALTIME_MINI = {
  name: "gpt-realtime-mini",
  context_window: 32_000,
  max_output_tokens: 4_096,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo add  audio and image tokens to input output
    input: {
      normal: 0.6,
      cached: 0.06,
    },
    output: {
      normal: 2.4
    }
  },
  supports: {
    input: ["text", "audio", "image"],
    output: ["text", "audio"],
    endpoints: ["realtime"],
    features: ["function_calling"],

  }
} as const satisfies ModelMeta


const GPT_AUDIO_MINI = {
  name: "gpt-audio-mini",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo add  audio tokens to input output
    input: {
      normal: 0.6,

    },
    output: {
      normal: 2.4
    }
  },
  supports: {
    input: ["text", "audio"],
    output: ["text", "audio"],
    endpoints: ["chat-completions"],
    features: ["function_calling"],

  }
} as const satisfies ModelMeta

const O3 = {
  name: "o3",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 2,
      cached: 0.5
    },
    output: {
      normal: 8
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch", "chat-completions"],
    features: ["function_calling", "structured_outputs", "streaming"],

  }
} as const satisfies ModelMeta

const O4_MINI = {
  name: "o4-mini",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 1.1,
      cached: 0.275
    },
    output: {
      normal: 4.4
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch", "chat-completions", "fine-tuning"],
    features: ["function_calling", "structured_outputs", "streaming", "fine_tuning"],

  }
} as const satisfies ModelMeta

const GPT4_1 = {
  name: "gpt-4.1",
  context_window: 1_047_576,
  max_output_tokens: 32_768,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 2,
      cached: 0.5
    },
    output: {
      normal: 8
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "assistants", "fine-tuning", "batch"],
    features: ["streaming", "function_calling", "structured_outputs", "distillation", "fine_tuning"],
    tools: [
      "web_search",
      "file_search",
      "image_generation",
      "code_interpreter",
      "mcp"
    ]
  }
} as const satisfies ModelMeta

const GPT4_1_MINI = {
  name: "gpt-4.1-mini",
  context_window: 1_047_576,
  max_output_tokens: 32_768,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 0.4,
      cached: 0.1
    },
    output: {
      normal: 1.6
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "assistants", "fine-tuning", "batch"],
    features: ["streaming", "function_calling", "structured_outputs", "fine_tuning"],

  }
} as const satisfies ModelMeta

const GPT4_1_NANO = {
  name: "gpt-4.1-nano",
  context_window: 1_047_576,
  max_output_tokens: 32_768,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    input: {
      normal: 0.1,
      cached: 0.025
    },
    output: {
      normal: 0.4
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "assistants", "fine-tuning", "batch"],
    features: ["streaming", "function_calling", "structured_outputs", "fine_tuning", "predicted_outcomes"],

  }
} as const satisfies ModelMeta

const O1_PRO = {
  name: "o1-pro",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 150,

    },
    output: {
      normal: 600
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch",],
    features: ["function_calling", "structured_outputs",],

  }
} as const satisfies ModelMeta

const COMPUTER_USE_PREVIEW = {
  name: "computer-use-preview",
  context_window: 8_192,
  max_output_tokens: 1_024,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 3
    },
    output: {
      normal: 12
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch"],
    features: ["function_calling"],

  }
} as const satisfies ModelMeta

const GPT_4O_MINI_SEARCH_PREVIEW = {
  name: "gpt-4o-mini-search-preview",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 0.15,
    },
    output: {
      normal: 0.6
    }
  },
  supports: {
    input: ["text",],
    output: ["text"],
    endpoints: ["chat-completions",],
    features: ["streaming", "structured_outputs",],
  }
} as const satisfies ModelMeta

const GPT_4O_SEARCH_PREVIEW = {
  name: "gpt-4o-search-preview",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["text",],
    output: ["text"],
    endpoints: ["chat-completions",],
    features: ["streaming", "structured_outputs",],
  }
} as const satisfies ModelMeta

const O3_MINI = {
  name: "o3-mini",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 1.1,
      cached: 0.55
    },
    output: {
      normal: 4.4
    }
  },
  supports: {
    input: ["text"],
    output: ["text"],
    endpoints: ["chat", "batch", "chat-completions", "assistants"],
    features: ["function_calling", "structured_outputs", "streaming"],

  }
} as const satisfies ModelMeta

const GPT_4O_MINI_AUDIO = {
  name: "gpt-4o-mini-audio",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo audio tokens
    input: {
      normal: 0.15,

    },
    output: {
      normal: 0.6
    }
  },
  supports: {
    input: ["text", "audio"],
    output: ["text", "audio"],
    endpoints: ["chat-completions"],
    features: ["function_calling", "streaming"],
  }
} as const satisfies ModelMeta

const GPT_4O_MINI_REALTIME = {
  name: "gpt-4o-mini-realtime",
  context_window: 16_000,
  max_output_tokens: 4_096,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo add audio tokens
    input: {
      normal: 0.6,
      cached: 0.3
    },
    output: {
      normal: 2.4
    }
  },
  supports: {
    input: ["text", "audio",],
    output: ["text", "audio"],
    endpoints: ["realtime"],
    features: ["function_calling",],
  }
} as const satisfies ModelMeta

const O1 = {
  name: "o1",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 15,
      cached: 7.5
    },
    output: {
      normal: 60
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "batch", "chat-completions", "assistants"],
    features: ["function_calling", "structured_outputs", "streaming"],

  }
} as const satisfies ModelMeta

const OMNI_MODERATION = {
  name: "omni-moderation",
  pricing: {
    input: {
      normal: 0
    }, output: {
      normal: 0
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["batch", "moderation"],
    features: []
  },

} as const satisfies ModelMeta

const GPT_4O = {
  name: "gpt-4o",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {

    input: {
      normal: 2.5,
      cached: 1.25
    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "assistants", "fine-tuning", "batch"],
    features: ["streaming", "function_calling", "structured_outputs", "distillation", "fine_tuning", "predicted_outcomes"],
  }
} as const satisfies ModelMeta


const GPT_4O_AUDIO = {
  name: "gpt-4o-audio",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo audio tokens
    input: {
      normal: 2.5,

    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["text", "audio"],
    output: ["text", "audio"],
    endpoints: ["chat-completions",],
    features: ["streaming", "function_calling",],
  }
} as const satisfies ModelMeta

const GPT_40_MINI = {
  name: "gpt-4o-mini",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 0.15,
      cached: 0.075
    },
    output: {
      normal: 0.6
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions", "assistants", "fine-tuning", "batch"],
    features: ["streaming", "function_calling", "structured_outputs", "fine_tuning", "predicted_outcomes"],
  }
} as const satisfies ModelMeta

const GPT__4O_REALTIME = {
  name: "gpt-4o-realtime",
  context_window: 32_000,
  max_output_tokens: 4_096,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    // todo add  audio tokens to input output
    input: {
      normal: 5,
      cached: 2.5,
    },
    output: {
      normal: 20
    }
  },
  supports: {
    input: ["text", "audio",],
    output: ["text", "audio"],
    endpoints: ["realtime"],
    features: ["function_calling"],

  }
} as const satisfies ModelMeta

const GPT_4_TURBO = {
  name: "gpt-4-turbo",
  context_window: 128_000,
  max_output_tokens: 4_096,
  knowledge_cutoff: "2023-12-01",
  pricing: {
    input: {
      normal: 10
    },
    output: {
      normal: 30
    }
  },
  supports: {
    input: ["text", "image",],
    output: ["text",],
    endpoints: ["chat", "chat-completions", "assistants", "batch"],
    features: ["function_calling", "streaming"],

  }
} as const satisfies ModelMeta

const CHATGPT_40 = {
  name: "chatgpt-4.0",
  context_window: 128_000,
  max_output_tokens: 4_096,
  knowledge_cutoff: "2023-10-01",
  pricing: {
    input: {
      normal: 5
    },
    output: {
      normal: 15
    }
  },
  supports: {
    input: ["text", "image",],
    output: ["text",],
    endpoints: ["chat", "chat-completions",],
    features: ["predicted_outcomes", "streaming"],
  }
} as const satisfies ModelMeta

const GPT_5_1_CODEX_MINI = {
  name: "gpt-5.1-codex-mini",
  context_window: 400_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: "2024-09-30",
  pricing: {
    input: {
      normal: 0.25,
      cached: 0.025
    },
    output: {
      normal: 2
    }
  },
  supports: {
    input: ["text", "image",],
    output: ["text", "image"],
    endpoints: ["chat",],
    features: ["streaming", "function_calling", "structured_outputs"],
  }
} as const satisfies ModelMeta


const CODEX_MINI_LATEST = {
  name: "codex-mini-latest",
  context_window: 200_000,
  max_output_tokens: 100_000,
  knowledge_cutoff: "2024-06-01",
  pricing: {
    input: {
      normal: 1.5,
      cached: 0.375
    },
    output: {
      normal: 6
    }
  },
  supports: {
    input: ["text", "image",],
    output: ["text"],
    endpoints: ["chat",],
    features: ["streaming", "function_calling", "structured_outputs"],
  }
} as const satisfies ModelMeta

const DALL_E_2 = {
  name: "dall-e-2",
  pricing: {
    // todo image tokens
    input: {
      normal: 0.016,

    },
    output: {
      normal: 0.02
    }
  },
  supports: {
    input: ["text",],
    output: ["image"],
    endpoints: ["image-generation", "image-edit",],
    features: [],
  }
} as const satisfies ModelMeta

const DALL_E_3 = {
  name: "dall-e-3",
  pricing: {
    // todo image tokens
    input: {
      normal: 0.04,
    }
    ,
    output: {
      normal: 0.08
    }
  },
  supports: {
    input: ["text",],
    output: ["image"],
    endpoints: ["image-generation", "image-edit",],
    features: [],
  }
} as const satisfies ModelMeta

const GPT_3_5_TURBO = {
  name: "gpt-3.5-turbo",
  context_window: 16_385,
  max_output_tokens: 4_096,
  knowledge_cutoff: "2021-09-01",
  pricing: {
    input: {
      normal: 0.5,

    },
    output: {
      normal: 1.5
    }
  },
  supports: {
    input: ["text",],
    output: ["text",],
    endpoints: ["chat", "chat-completions", "batch", "fine-tuning"],
    features: ["fine_tuning"],
  }
} as const satisfies ModelMeta

const GPT_4 = {
  name: "gpt-4",
  context_window: 8_192,
  max_output_tokens: 8_192,
  knowledge_cutoff: "2023-12-01",
  pricing: {
    input: {
      normal: 30,

    },
    output: {
      normal: 60
    }
  },
  supports: {
    input: ["text",],
    output: ["text",],
    endpoints: ["chat", "chat-completions", "batch", "fine-tuning", "assistants"],
    features: ["fine_tuning", "streaming"],
  }
} as const satisfies ModelMeta

const GPT_4O_MINI_TRANSCRIBE = {
  name: "gpt-4o-mini-transcribe",
  context_window: 16_000,
  max_output_tokens: 2_000,
  knowledge_cutoff: "2024-01-01",
  pricing: {
    // todo audio tokens
    input: {
      normal: 1.25,
    },
    output: {
      normal: 5
    }
  },
  supports: {
    input: ["audio", "text"],
    output: ["text"],
    endpoints: ["realtime", "transcription"],
    features: []
  }
} as const satisfies ModelMeta

const GPT_4O_MINI_TTS = {
  name: "gpt-4o-mini-tts",
  pricing: {
    // todo audio tokens
    input: {
      normal: 0.6,
    },
    output: {
      normal: 12
    }
  },
  supports: {
    input: ["text"],
    output: ["audio"],
    endpoints: ["speech_generation"],
    features: []
  }
} as const satisfies ModelMeta


const GPT_4O_TRANSCRIBE = {
  name: "gpt-4o-transcribe",
  context_window: 16_000,
  max_output_tokens: 2_000,
  knowledge_cutoff: "2024-06-01",
  pricing: {
    // todo audio tokens
    input: {
      normal: 2.5,
    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["audio", "text"],
    output: ["text"],
    endpoints: ["realtime", "transcription"],
    features: []
  }
} as const satisfies ModelMeta

const GPT_4O_TRANSCRIBE_DIARIZE = {
  name: "gpt-4o-transcribe-diarize",
  context_window: 16_000,
  max_output_tokens: 2_000,
  knowledge_cutoff: "2024-06-01",
  pricing: {
    // todo audio tokens
    input: {
      normal: 2.5,
    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["audio", "text"],
    output: ["text"],
    endpoints: ["transcription"],
    features: []
  }
} as const satisfies ModelMeta

const GPT_5_1_CHAT = {
  name: "gpt-5.1-chat",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2024-09-30",
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125
    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions"],
    features: ["streaming", "function_calling", "structured_outputs"],
  }
} as const satisfies ModelMeta

const GPT_5_CHAT = {
  name: "gpt-5-chat",
  context_window: 128_000,
  max_output_tokens: 16_384,
  knowledge_cutoff: "2024-09-30",
  pricing: {
    input: {
      normal: 1.25,
      cached: 0.125
    },
    output: {
      normal: 10
    }
  },
  supports: {
    input: ["text", "image"],
    output: ["text"],
    endpoints: ["chat", "chat-completions"],
    features: ["streaming", "function_calling", "structured_outputs"],
    tools: [
      "web_search",
      "file_search",
      "image_generation",
      "code_interpreter",
      "mcp"
    ]
  }
} as const satisfies ModelMeta

const TEXT_EMBEDDING_3_LARGE = {
  name: "text-embedding-3-large",
  pricing: {
    // todo embedding tokens
    input: {
      normal: 0.13
    },
    output: {
      normal: 0.13
    }
  },
  supports: {
    input: ["text"],
    output: ["text"],
    endpoints: ["embedding", "batch"],
    features: []
  }
} as const satisfies ModelMeta

const TEXT_EMBEDDING_3_SMALL = {
  name: "text-embedding-3-small",
  pricing: {
    // todo embedding tokens
    input: {
      normal: 0.02
    },
    output: {
      normal: 0.02
    }
  },
  supports: {
    input: ["text"],
    output: ["text"],
    endpoints: ["embedding", "batch"],
    features: []
  }
} as const satisfies ModelMeta


const TEXT_EMBEDDING_3_ADA_002 = {
  name: "text-embedding-3-ada-002",
  pricing: {
    // todo embedding tokens
    input: {
      normal: 0.1
    },
    output: {
      normal: 0.1
    }
  },
  supports: {
    input: ["text"],
    output: ["text"],
    endpoints: ["embedding", "batch"],
    features: []
  }
} as const satisfies ModelMeta

const TTS_1 = {
  name: "tts-1",
  pricing: {
    // todo figure out pricing
    input: {
      normal: 15
    },
    output: {
      normal: 15
    }
  },
  supports: {
    input: ["text"],
    output: ["audio"],
    endpoints: ["speech_generation"],
    features: []
  }
} as const satisfies ModelMeta

const TTS_1_HD = {
  name: "tts-1-hd",
  pricing: {
    // todo figure out pricing
    input: {
      normal: 30
    },
    output: {
      normal: 30
    }
  },
  supports: {
    input: ["text"],
    output: ["audio"],
    endpoints: ["speech_generation"],
    features: []
  }
} as const satisfies ModelMeta

// Chat/text completion models (based on endpoints: "chat" or "chat-completions")
export const OPENAI_CHAT_MODELS = [
  // Frontier models
  GPT5_1.name,
  GPT5_1_CODEX.name,
  GPT5.name,
  GPT5_MINI.name,
  GPT5_NANO.name,
  GPT5_PRO.name,
  GPT5_CODEX.name,
  // Reasoning models
  O3.name,
  O3_PRO.name,
  O3_MINI.name,
  O4_MINI.name,
  O3_DEEP_RESEARCH.name,
  O4_MINI_DEEP_RESEARCH.name,
  // GPT-4 series
  GPT4_1.name,
  GPT4_1_MINI.name,
  GPT4_1_NANO.name,
  GPT_4.name,
  GPT_4_TURBO.name,
  GPT_4O.name,
  GPT_40_MINI.name,
  // GPT-3.5
  GPT_3_5_TURBO.name,
  // Audio-enabled chat models
  GPT_AUDIO.name,
  GPT_AUDIO_MINI.name,
  GPT_4O_AUDIO.name,
  GPT_4O_MINI_AUDIO.name,
  // ChatGPT models
  GPT_5_1_CHAT.name,
  GPT_5_CHAT.name,
  CHATGPT_40.name,
  // Specialized
  GPT_5_1_CODEX_MINI.name,
  CODEX_MINI_LATEST.name,
  // Preview models
  GPT_4O_SEARCH_PREVIEW.name,
  GPT_4O_MINI_SEARCH_PREVIEW.name,
  COMPUTER_USE_PREVIEW.name,
  // Legacy reasoning
  O1.name,
  O1_PRO.name,
] as const;

// Image generation models (based on endpoints: "image-generation" or "image-edit")
export const OPENAI_IMAGE_MODELS = [
  GPT_IMAGE_1.name,
  GPT_IMAGE_1_MINI.name,
  DALL_E_3.name,
  DALL_E_2.name,
] as const;

// Embedding models (based on endpoints: "embedding")
export const OPENAI_EMBEDDING_MODELS = [
  TEXT_EMBEDDING_3_LARGE.name,
  TEXT_EMBEDDING_3_SMALL.name,
  TEXT_EMBEDDING_3_ADA_002.name,
] as const;

// Audio models (based on endpoints: "transcription", "speech_generation", or "realtime")
export const OPENAI_AUDIO_MODELS = [
  // Transcription models
  GPT_4O_TRANSCRIBE.name,
  GPT_4O_TRANSCRIBE_DIARIZE.name,
  GPT_4O_MINI_TRANSCRIBE.name,
  // Realtime models
  GPT_REALTIME.name,
  GPT_REALTIME_MINI.name,
  GPT__4O_REALTIME.name,
  GPT_4O_MINI_REALTIME.name,
  // Text-to-speech models
  GPT_4O_MINI_TTS.name,
  TTS_1.name,
  TTS_1_HD.name,
] as const;

// Transcription-only models (based on endpoints: "transcription")
export const OPENAI_TRANSCRIPTION_MODELS = [
  GPT_4O_TRANSCRIBE.name,
  GPT_4O_TRANSCRIBE_DIARIZE.name,
  GPT_4O_MINI_TRANSCRIBE.name,
] as const;

// Video generation models (based on endpoints: "video")
export const OPENAI_VIDEO_MODELS = [
  SORA2.name,
  SORA2_PRO.name,
] as const;

export const OPENAI_MODERATION_MODELS = [
  OMNI_MODERATION.name,
] as const;