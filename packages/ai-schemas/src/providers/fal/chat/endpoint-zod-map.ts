// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zBytedanceSeedV2MiniInput,
  zBytedanceSeedV2MiniOutput,
  zNemotron3NanoOmniInput,
  zNemotron3NanoOmniOutput,
  zNemotron3NanoOmniVideoInput,
  zNemotron3NanoOmniVideoOutput,
  zNemotron3NanoOmniVisionInput,
  zNemotron3NanoOmniVisionOutput,
  zRouterInput,
  zRouterOpenaiV1ChatCompletionsInput,
  zRouterOpenaiV1ChatCompletionsOutput,
  zRouterOpenaiV1EmbeddingsInput,
  zRouterOpenaiV1EmbeddingsOutput,
  zRouterOpenaiV1ResponsesInput,
  zRouterOpenaiV1ResponsesOutput,
  zRouterOutput,
  zRouterVideoEnterpriseInput,
  zRouterVideoEnterpriseOutput,
  zRouterVideoInput,
  zRouterVideoOutput,
  zVideoPromptGeneratorInput,
  zVideoPromptGeneratorOutput,
} from './zod.gen.js'

/**
 * Map of fal-chat endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const falChatEndpointZodMap: {
  readonly 'fal-ai/bytedance/seed/v2/mini': {
    readonly input: typeof zBytedanceSeedV2MiniInput
    readonly output: typeof zBytedanceSeedV2MiniOutput
  }
  readonly 'fal-ai/video-prompt-generator': {
    readonly input: typeof zVideoPromptGeneratorInput
    readonly output: typeof zVideoPromptGeneratorOutput
  }
  readonly 'nvidia/nemotron-3-nano-omni': {
    readonly input: typeof zNemotron3NanoOmniInput
    readonly output: typeof zNemotron3NanoOmniOutput
  }
  readonly 'nvidia/nemotron-3-nano-omni/video': {
    readonly input: typeof zNemotron3NanoOmniVideoInput
    readonly output: typeof zNemotron3NanoOmniVideoOutput
  }
  readonly 'nvidia/nemotron-3-nano-omni/vision': {
    readonly input: typeof zNemotron3NanoOmniVisionInput
    readonly output: typeof zNemotron3NanoOmniVisionOutput
  }
  readonly 'openrouter/router': {
    readonly input: typeof zRouterInput
    readonly output: typeof zRouterOutput
  }
  readonly 'openrouter/router/openai/v1/chat/completions': {
    readonly input: typeof zRouterOpenaiV1ChatCompletionsInput
    readonly output: typeof zRouterOpenaiV1ChatCompletionsOutput
  }
  readonly 'openrouter/router/openai/v1/embeddings': {
    readonly input: typeof zRouterOpenaiV1EmbeddingsInput
    readonly output: typeof zRouterOpenaiV1EmbeddingsOutput
  }
  readonly 'openrouter/router/openai/v1/responses': {
    readonly input: typeof zRouterOpenaiV1ResponsesInput
    readonly output: typeof zRouterOpenaiV1ResponsesOutput
  }
  readonly 'openrouter/router/video': {
    readonly input: typeof zRouterVideoInput
    readonly output: typeof zRouterVideoOutput
  }
  readonly 'openrouter/router/video/enterprise': {
    readonly input: typeof zRouterVideoEnterpriseInput
    readonly output: typeof zRouterVideoEnterpriseOutput
  }
} = {
  'fal-ai/bytedance/seed/v2/mini': {
    input: zBytedanceSeedV2MiniInput,
    output: zBytedanceSeedV2MiniOutput,
  },
  'fal-ai/video-prompt-generator': {
    input: zVideoPromptGeneratorInput,
    output: zVideoPromptGeneratorOutput,
  },
  'nvidia/nemotron-3-nano-omni': {
    input: zNemotron3NanoOmniInput,
    output: zNemotron3NanoOmniOutput,
  },
  'nvidia/nemotron-3-nano-omni/video': {
    input: zNemotron3NanoOmniVideoInput,
    output: zNemotron3NanoOmniVideoOutput,
  },
  'nvidia/nemotron-3-nano-omni/vision': {
    input: zNemotron3NanoOmniVisionInput,
    output: zNemotron3NanoOmniVisionOutput,
  },
  'openrouter/router': { input: zRouterInput, output: zRouterOutput },
  'openrouter/router/openai/v1/chat/completions': {
    input: zRouterOpenaiV1ChatCompletionsInput,
    output: zRouterOpenaiV1ChatCompletionsOutput,
  },
  'openrouter/router/openai/v1/embeddings': {
    input: zRouterOpenaiV1EmbeddingsInput,
    output: zRouterOpenaiV1EmbeddingsOutput,
  },
  'openrouter/router/openai/v1/responses': {
    input: zRouterOpenaiV1ResponsesInput,
    output: zRouterOpenaiV1ResponsesOutput,
  },
  'openrouter/router/video': {
    input: zRouterVideoInput,
    output: zRouterVideoOutput,
  },
  'openrouter/router/video/enterprise': {
    input: zRouterVideoEnterpriseInput,
    output: zRouterVideoEnterpriseOutput,
  },
}

/** Union of valid fal-chat endpoint ids. */
export type FalChatEndpointId = keyof typeof falChatEndpointZodMap
