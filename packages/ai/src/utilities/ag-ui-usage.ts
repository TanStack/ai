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

/** TokenUsage fields that have no AG-UI `usage[]` equivalent. */
export type TokenUsageLeftover = Omit<
  TokenUsage,
  'promptTokens' | 'completionTokens' | 'totalTokens'
>

function definedDetails<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

function withoutKey<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const next = { ...value }
  delete next[key]
  return next
}

export function isTanstackUsage(usage: unknown): usage is TokenUsage {
  return (
    typeof usage === 'object' &&
    usage != null &&
    !Array.isArray(usage) &&
    'promptTokens' in usage
  )
}

export function toSpecTokenUsage(
  usage: TokenUsage,
  options?: ToSpecTokenUsageOptions,
): { usage: Array<SpecTokenUsage>; leftover?: TokenUsageLeftover } {
  const {
    promptTokens,
    completionTokens,
    totalTokens,
    promptTokensDetails,
    completionTokensDetails,
    ...rest
  } = usage

  const spec: SpecTokenUsage = {
    ...(options?.provider !== undefined ? { provider: options.provider } : {}),
    ...(options?.model !== undefined ? { model: options.model } : {}),
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    totalTokens,
  }
  const cachedInputTokens = promptTokensDetails?.cachedTokens
  if (cachedInputTokens !== undefined) {
    spec.cachedInputTokens = cachedInputTokens
  }
  const reasoningTokens = completionTokensDetails?.reasoningTokens
  if (reasoningTokens !== undefined) {
    spec.reasoningTokens = reasoningTokens
  }

  const leftoverPrompt = promptTokensDetails
    ? definedDetails(withoutKey(promptTokensDetails, 'cachedTokens'))
    : undefined
  const leftoverCompletion = completionTokensDetails
    ? definedDetails(withoutKey(completionTokensDetails, 'reasoningTokens'))
    : undefined

  return {
    usage: [spec],
    leftover: definedDetails({
      ...rest,
      ...(leftoverPrompt !== undefined
        ? { promptTokensDetails: leftoverPrompt }
        : {}),
      ...(leftoverCompletion !== undefined
        ? { completionTokensDetails: leftoverCompletion }
        : {}),
    }),
  }
}

export function rebuildTokenUsage(
  usage: unknown,
  leftover?: TokenUsageLeftover,
): TokenUsage | undefined {
  if (isTanstackUsage(usage)) {
    return usage
  }
  if (Array.isArray(usage)) {
    return fromSpecTokenUsage(usage, leftover)
  }
  return fromSpecTokenUsage(undefined, leftover)
}

export function fromSpecTokenUsage(
  usage: ReadonlyArray<SpecTokenUsage> | undefined,
  leftover?: TokenUsageLeftover,
): TokenUsage | undefined {
  const spec = usage?.[0]
  const isMissingSpec = spec == null && leftover == null
  if (isMissingSpec) {
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
