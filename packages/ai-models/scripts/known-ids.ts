// Model ids that the generator cannot tell apart on its own. Keep it by hand.

/**
 * Plan providers that share a modelschemas list with the full API but serve
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

/**
 * Fireworks models on the Anthropic endpoint that think with a budget (pi
 * 0.87.1). The others think adaptively: pi has `effort` levels for them.
 */
export const FIREWORKS_BUDGET_THINKING: ReadonlyArray<string> = [
  'accounts/fireworks/models/inkling',
  'accounts/fireworks/models/kimi-k2p6',
  'accounts/fireworks/models/kimi-k2p7-code',
  'accounts/fireworks/models/nemotron-3-ultra-nvfp4',
  'accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b',
  'accounts/fireworks/routers/qwen-max-latest',
]

/** The models with mid-conversation effort, by provider (pi 0.87.1 `supportsMidConvoEffort`). */
export const MID_CONVERSATION_EFFORT: Readonly<
  Record<string, ReadonlyArray<string>>
> = {
  anthropic: ['claude-fable-5-1', 'claude-opus-5', 'claude-opus-5-5'],
  openrouter: ['anthropic/claude-fable-5.1', 'anthropic/claude-opus-5.5'],
}
