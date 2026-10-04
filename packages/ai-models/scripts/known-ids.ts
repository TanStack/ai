// Model ids that the generator cannot find on its own. It compares with the
// catalog of pi 0.87.1 (the models Flue users write today). Keep it by hand:
// add an id here when a provider drops it from models.dev but still serves it.

/** A model id at a provider, and the models.dev model to take its data from. */
export const BORROW: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  'ant-ling': {
    'Ling-2.6-1T': 'novita-ai/inclusionai/ling-2.6-1t',
    'Ling-2.6-flash': 'novita-ai/inclusionai/ling-2.6-flash',
    'Ring-2.6-1T': 'novita-ai/inclusionai/ring-2.6-1t',
  },
  'azure-openai-responses': {
    'gpt-4': 'openai/gpt-4',
    'gpt-4o-2024-05-13': 'openai/gpt-4o-2024-05-13',
    'gpt-4o-2024-08-06': 'openai/gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20': 'openai/gpt-4o-2024-11-20',
    'gpt-5-chat-latest': 'jiekou/gpt-5-chat-latest',
    'gpt-5.2-chat-latest': 'openai/gpt-5.2-chat-latest',
    'gpt-5.2-pro': 'openai/gpt-5.2-pro',
    'gpt-5.3-chat-latest': 'openai/gpt-5.3-chat-latest',
    'gpt-5.3-codex-spark': 'openai/gpt-5.3-codex-spark',
    'gpt-5.5-pro': 'openai/gpt-5.5-pro',
    'gpt-realtime-2.1': 'openai/gpt-realtime-2.1',
    'o1-pro': 'openai/o1-pro',
    'o3-pro': 'openai/o3-pro',
  },
  'cloudflare-ai-gateway': {
    'workers-ai/@cf/deepseek-ai/deepseek-v4-flash-0731':
      'cloudflare-workers-ai/@cf/deepseek-ai/deepseek-v4-flash-0731',
    'workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813':
      'cloudflare-workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813',
    'workers-ai/@cf/google/gemma-4-26b-a4b-it':
      'cloudflare-workers-ai/@cf/google/gemma-4-26b-a4b-it',
    'workers-ai/@cf/ibm-granite/granite-4.0-h-micro':
      'cloudflare-workers-ai/@cf/ibm-granite/granite-4.0-h-micro',
    'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast':
      'cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct':
      'cloudflare-workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct',
    'workers-ai/@cf/mistralai/mistral-small-3.1-24b-instruct':
      'cloudflare-workers-ai/@cf/mistralai/mistral-small-3.1-24b-instruct',
    'workers-ai/@cf/moonshotai/kimi-k2.6':
      'cloudflare-workers-ai/@cf/moonshotai/kimi-k2.6',
    'workers-ai/@cf/moonshotai/kimi-k2.7-code':
      'cloudflare-workers-ai/@cf/moonshotai/kimi-k2.7-code',
    'workers-ai/@cf/nvidia/nemotron-3-120b-a12b':
      'cloudflare-workers-ai/@cf/nvidia/nemotron-3-120b-a12b',
    'workers-ai/@cf/openai/gpt-oss-120b':
      'cloudflare-workers-ai/@cf/openai/gpt-oss-120b',
    'workers-ai/@cf/openai/gpt-oss-20b':
      'cloudflare-workers-ai/@cf/openai/gpt-oss-20b',
    'workers-ai/@cf/qwen/qwen3-30b-a3b-fp8':
      'cloudflare-workers-ai/@cf/qwen/qwen3-30b-a3b-fp8',
    'workers-ai/@cf/qwen/qwen3.8-27b':
      'cloudflare-workers-ai/@cf/qwen/qwen3.8-27b',
    'workers-ai/@cf/zai-org/glm-4.7-flash':
      'cloudflare-workers-ai/@cf/zai-org/glm-4.7-flash',
    'workers-ai/@cf/zai-org/glm-5.2':
      'cloudflare-workers-ai/@cf/zai-org/glm-5.2',
    'workers-ai/@cf/zai-org/glm-5.3':
      'cloudflare-workers-ai/@cf/zai-org/glm-5.3',
    'workers-ai/@cf/zai-org/glm-5.3-flash':
      'cloudflare-workers-ai/@cf/zai-org/glm-5.3-flash',
  },
  fireworks: {
    'accounts/fireworks/models/deepseek-v4-flash-0731':
      'deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731',
    'accounts/fireworks/models/deepseek-v4-flash-vision-exp':
      'deepseek/deepseek-v4-flash-vision-exp',
    'accounts/fireworks/models/deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
    'accounts/fireworks/models/deepseek-v4-pro-0813':
      'deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813',
    'accounts/fireworks/models/kimi-k2p6': 'moonshotai/kimi-k2.6',
    'accounts/fireworks/models/kimi-k2p7-code': 'moonshotai/kimi-k2.7-code',
    'accounts/fireworks/models/minimax-m2p7': 'minimax/MiniMax-M2.7',
    'accounts/fireworks/models/muse-glimmer-30b':
      'empiriolabs/muse-glimmer-30b',
    'accounts/fireworks/models/qwen3p7-plus': 'alibaba/qwen3.7-plus',
    'accounts/fireworks/routers/deepseek-pro-latest':
      'kilo/~deepseek/deepseek-pro-latest',
    'accounts/fireworks/models/glm-5p2': 'zai/glm-5.2',
    'accounts/fireworks/routers/glm-5p2-fast': 'baseten/zai-org/GLM-5.2-Fast',
  },
  mistral: {
    'mistral-medium-3.5': 'nano-gpt/mistralai/mistral-medium-3.5',
  },
  openai: {
    'gpt-5-chat-latest': 'jiekou/gpt-5-chat-latest',
  },
  'opencode-go': {
    'glm-5.1': 'zai/glm-5.1',
  },
  openrouter: {
    'anthropic/claude-3-haiku': 'vercel/anthropic/claude-3-haiku',
    auto: 'kilo/openrouter/auto',
    'inclusionai/ling-3.0-flash-fin:free':
      'kilo/inclusionai/ling-3.0-flash-fin',
    'inclusionai/ling-3.0-flash-vl:free':
      'nano-gpt/inclusionai/ling-3.0-flash-vl',
    'nex-agi/nex-n2.5-mini:free': 'kilo/nex-agi/nex-n2.5-mini',
    'nex-agi/nex-n2.5-pro:free': 'kilo/nex-agi/nex-n2.5-pro',
  },
  'qwen-token-plan': {
    'MiniMax-M2.5': 'minimax/MiniMax-M2.5',
    'deepseek-v3.2': 'deepinfra/deepseek-ai/DeepSeek-V3.2',
    'deepseek-v4-flash': 'deepseek/deepseek-v4-flash',
    'deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
    'deepseek-v4-pro-0813': 'deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813',
    'deepseek-v4.1-flash': 'deepinfra/deepseek-ai/DeepSeek-V4.1-Flash',
    'glm-5': 'zai/glm-5',
    'glm-5.1': 'zai/glm-5.1',
    'glm-5.3': 'zai/glm-5.3',
    'kimi-k2.5': 'deepinfra/moonshotai/Kimi-K2.5',
    'kimi-k2.6': 'moonshotai/kimi-k2.6',
    'kimi-k2.7-code': 'moonshotai/kimi-k2.7-code',
  },
  'qwen-token-plan-cn': {
    'deepseek-v3.2': 'deepinfra/deepseek-ai/DeepSeek-V3.2',
    'deepseek-v4-flash-0731': 'deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731',
    'deepseek-v4-pro-0813': 'deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813',
    'kimi-k2.7-code': 'moonshotai/kimi-k2.7-code',
  },
  'qwen-token-plan-individual': {
    'deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
    'deepseek-v4-pro-0813': 'deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813',
  },
  together: {
    'moonshotai/Kimi-K2.6': 'moonshotai/kimi-k2.6',
    'moonshotai/Kimi-K2.7-Code': 'moonshotai/kimi-k2.7-code',
  },
  'vercel-ai-gateway': {
    'inclusionai/ling-3.0-flash-fin-free':
      'kilo/inclusionai/ling-3.0-flash-fin',
    'inclusionai/ling-3.0-flash-vl-free':
      'nano-gpt/inclusionai/ling-3.0-flash-vl',
  },
  zai: {
    'glm-5.2-highspeed': 'zai-coding-plan/glm-5.2-highspeed',
    'glm-5.3-highspeed': 'zhipuai-coding-plan/glm-5.3-highspeed',
  },
}

/**
 * Plan providers that share a models.dev list with the full API but serve
 * only some of its models. Only these ids are in the catalog.
 */
export const ONLY: Readonly<Record<string, ReadonlyArray<string>>> = {
  'qwen-token-plan': [
    'MiniMax-M2.5',
    'deepseek-v3.2',
    'deepseek-v4-flash',
    'deepseek-v4-flash-0731',
    'deepseek-v4-pro',
    'deepseek-v4-pro-0813',
    'deepseek-v4.1-flash',
    'glm-5',
    'glm-5.1',
    'glm-5.2',
    'glm-5.3',
    'kimi-k2.5',
    'kimi-k2.6',
    'kimi-k2.7-code',
    'qwen3.6-flash',
    'qwen3.6-plus',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.8-flash',
    'qwen3.8-max',
  ],
  'qwen-token-plan-cn': [
    'MiniMax-M2.5',
    'deepseek-v3.2',
    'deepseek-v4-flash',
    'deepseek-v4-flash-0731',
    'deepseek-v4-pro',
    'deepseek-v4-pro-0813',
    'deepseek-v4.1-flash',
    'glm-5',
    'glm-5.1',
    'glm-5.2',
    'glm-5.3',
    'kimi-k2.5',
    'kimi-k2.6',
    'kimi-k2.7-code',
    'qwen3.6-flash',
    'qwen3.6-plus',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.8-flash',
    'qwen3.8-max',
  ],
  'qwen-token-plan-individual': [
    'deepseek-v4-flash-0731',
    'deepseek-v4-pro',
    'deepseek-v4-pro-0813',
    'glm-5.2',
    'qwen3.6-flash',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.8-flash',
    'qwen3.8-max',
  ],
  'xiaomi-token-plan-ams': [
    'mimo-v2.5',
    'mimo-v2.5-pro',
    'mimo-v2.6-flash',
    'mimo-v2.6-pro',
  ],
  'xiaomi-token-plan-cn': [
    'mimo-v2.5',
    'mimo-v2.5-pro',
    'mimo-v2.6-flash',
    'mimo-v2.6-pro',
  ],
  'xiaomi-token-plan-sgp': [
    'mimo-v2.5',
    'mimo-v2.5-pro',
    'mimo-v2.6-flash',
    'mimo-v2.6-pro',
  ],
}

/** Fireworks models on its Anthropic Messages endpoint. The rest use Chat Completions. */
export const FIREWORKS_ANTHROPIC_WIRE: ReadonlyArray<string> = [
  'accounts/fireworks/models/deepseek-v4-flash-0731',
  'accounts/fireworks/models/deepseek-v4-flash-vision-exp',
  'accounts/fireworks/models/deepseek-v4-pro',
  'accounts/fireworks/models/deepseek-v4-pro-0813',
  'accounts/fireworks/models/deepseek-v4p1-flash',
  'accounts/fireworks/models/gpt-oss-120b',
  'accounts/fireworks/models/inkling',
  'accounts/fireworks/models/kimi-k2p6',
  'accounts/fireworks/models/kimi-k2p7-code',
  'accounts/fireworks/models/minimax-m2p7',
  'accounts/fireworks/models/minimax-m3',
  'accounts/fireworks/models/muse-glimmer-30b',
  'accounts/fireworks/models/nemotron-3-ultra-nvfp4',
  'accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b',
  'accounts/fireworks/models/qwen3p7-plus',
  'accounts/fireworks/models/qwen3p8-2p4t-a95b',
  'accounts/fireworks/models/qwen3p8-max',
  'accounts/fireworks/routers/deepseek-flash-latest',
  'accounts/fireworks/routers/deepseek-pro-latest',
  'accounts/fireworks/routers/kimi-fast-latest',
  'accounts/fireworks/routers/kimi-latest',
  'accounts/fireworks/routers/minimax-latest',
  'accounts/fireworks/routers/qwen-max-latest',
]
