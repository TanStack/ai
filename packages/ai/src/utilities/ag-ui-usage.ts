import type { TokenUsage } from '../types'

/** AG-UI spec `usage[]` item (provider/model labels + token counts only). */
export interface SpecTokenUsage {
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

export interface ToSpecTokenUsageOptions {
  provider?: string
  model?: string
}

type TokenUsageLeftover = Omit<
  TokenUsage,
  'promptTokens' | 'completionTokens' | 'totalTokens'
>

function definedDetails<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

export function toSpecTokenUsage(
  usage: TokenUsage,
  options?: ToSpecTokenUsageOptions,
): { usage: Array<SpecTokenUsage>; leftover?: TokenUsageLeftover } {
  const { promptTokens, completionTokens, totalTokens, ...leftover } = usage

  const spec: SpecTokenUsage = {
    ...(options?.provider !== undefined ? { provider: options.provider } : {}),
    ...(options?.model !== undefined ? { model: options.model } : {}),
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    totalTokens,
  }
  const cachedInputTokens = leftover.promptTokensDetails?.cachedTokens
  if (cachedInputTokens !== undefined) {
    spec.cachedInputTokens = cachedInputTokens
  }
  const reasoningTokens = leftover.completionTokensDetails?.reasoningTokens
  if (reasoningTokens !== undefined) {
    spec.reasoningTokens = reasoningTokens
  }

  return {
    usage: [spec],
    leftover: definedDetails(leftover),
  }
}

export function fromSpecTokenUsage(
  usage: ReadonlyArray<SpecTokenUsage> | undefined,
  leftover?: TokenUsageLeftover,
): TokenUsage | undefined {
  const spec = usage?.[0]
  if (spec == null && leftover == null) {
    return undefined
  }

  const {
    promptTokensDetails: leftoverPromptDetails,
    completionTokensDetails: leftoverCompletionDetails,
    ...leftoverRest
  } = leftover ?? {}

  const promptTokensDetails = definedDetails({
    ...(spec?.cachedInputTokens !== undefined
      ? { cachedTokens: spec.cachedInputTokens }
      : {}),
    ...leftoverPromptDetails,
  })
  const completionTokensDetails = definedDetails({
    ...(spec?.reasoningTokens !== undefined
      ? { reasoningTokens: spec.reasoningTokens }
      : {}),
    ...leftoverCompletionDetails,
  })

  return {
    promptTokens: spec?.inputTokens ?? 0,
    completionTokens: spec?.outputTokens ?? 0,
    totalTokens: spec?.totalTokens ?? 0,
    ...leftoverRest,
    ...(promptTokensDetails !== undefined ? { promptTokensDetails } : {}),
    ...(completionTokensDetails !== undefined
      ? { completionTokensDetails }
      : {}),
  }
}
