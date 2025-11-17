interface ModelMeta {
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
const GPT5_1: ModelMeta = {
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
}

const GP5_1_CODEX: ModelMeta = {
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
}

const GPT5: ModelMeta = {
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
}

const GPT5_MINI: ModelMeta = {
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
}

const GPT5_NANO: ModelMeta = {
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
}

const GPT5_PRO: ModelMeta = {
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
}

const GPT5_CODEX: ModelMeta = {
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
}


const SORA2: ModelMeta = {
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
}

const SORA2_PRO: ModelMeta = {
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
}

const GPT_IMAGE_1: ModelMeta = {
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
}

const GPT_IMAGE_1_MINI: ModelMeta = {
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
}

const O3_DEEP_RESEARCH: ModelMeta = {
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
}

const O4_MINI_DEEP_RESEARCH: ModelMeta = {
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
}

const O3_PRO: ModelMeta = {
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
}

const GPT_AUDIO: ModelMeta = {
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
}


const GPT_REALTIME: ModelMeta = {
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
}

const GPT_REALTIME_MINI: ModelMeta = {
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
}


const GPT_AUDIO_MINI: ModelMeta = {
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
}

const O3: ModelMeta = {
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
}

const O4_MINI: ModelMeta = {
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
}

const GPT4_1: ModelMeta = {
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
}

const GPT4_1_MINI: ModelMeta = {
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
}

const GPT4_1_NANO: ModelMeta = {
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
}

const O1_PRO: ModelMeta = {
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
}

const COMPUTER_USE_PREVIEW: ModelMeta = {
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
}

const GPT_4O_MINI_SEARCH_PREVIEW: ModelMeta = {
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
}

const GPT_4O_SEARCH_PREVIEW: ModelMeta = {
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
}

const O3_MINI: ModelMeta = {
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
}

const GPT_4O_MINI_AUDIO: ModelMeta = {
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
}

const GPT_4O_MINI_REALTIME: ModelMeta = {
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
}

const O1: ModelMeta = {
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
}

const OMNI_MODERATION: ModelMeta = {
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

}

const GPT_4O: ModelMeta = {
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
}


const GPT_4O_AUDIO: ModelMeta = {
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
}

const GPT_40_MINI: ModelMeta = {
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
}

const GPT__4O_REALTIME: ModelMeta = {
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
}

const GPT_4_TURBO: ModelMeta = {
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
}

const CHATGPT_40: ModelMeta = {
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
}

const GPT_5_1_CODEX_MINI: ModelMeta = {
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
}


const CODEX_MINI_LATEST: ModelMeta = {
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
}

const DALL_E_2: ModelMeta = {
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
}

const DALL_E_3: ModelMeta = {
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
}

const GPT_3_5_TURBO: ModelMeta = {
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
}

const GPT_4: ModelMeta = {
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
}

const GPT_4O_MINI_TRANSCRIBE: ModelMeta = {
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
}

const GPT_4O_MINI_TTS: ModelMeta = {
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
}


const GPT_4O_TRANSCRIBE: ModelMeta = {
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
}

const GPT_4O_TRANSCRIBE_DIARIZE: ModelMeta = {
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
}

const GPT_5_1_CHAT: ModelMeta = {
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
}

const GPT_5_CHAT: ModelMeta = {
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
}

const TEXT_EMBEDDING_3_LARGE: ModelMeta = {
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
}

const TEXT_EMBEDDING_3_SMALL: ModelMeta = {
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
}


const TEXT_EMBEDDING_3_ADA_002: ModelMeta = {
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
}

const TTS_1: ModelMeta = {
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
}

const TTS_1_HD: ModelMeta = {
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
}