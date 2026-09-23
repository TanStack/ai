import type { TokenUsage as SpecTokenUsage } from '@ag-ui/core'
import type { TokenUsage } from '../types'

/** AG-UI spec `usage[]` item (provider/model labels + token counts only). */
export type { TokenUsage as SpecTokenUsage } from '@ag-ui/core'

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
  if (promptTokensDetails?.cacheWriteTokens !== undefined) {
    spec.cacheWriteInputTokens = promptTokensDetails.cacheWriteTokens
  }
  const reasoningTokens = completionTokensDetails?.reasoningTokens
  if (reasoningTokens !== undefined) {
    spec.reasoningTokens = reasoningTokens
  }

  // cacheWriteTokens stays in the leftover too: readers built before
  // cacheWriteInputTokens existed (older clients, devtools) read it from there.
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
  const spec = usage?.reduce<SpecTokenUsage>((total, entry) => {
    for (const key of [
      'inputTokens',
      'outputTokens',
      'totalTokens',
      'cachedInputTokens',
      'cacheWriteInputTokens',
      'reasoningTokens',
    ] as const) {
      if (entry[key] !== undefined) total[key] = (total[key] ?? 0) + entry[key]
    }
    return total
  }, {})
  if ((usage === undefined || usage.length === 0) && leftover == null) {
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
    ...(spec?.cacheWriteInputTokens !== undefined
      ? { cacheWriteTokens: spec.cacheWriteInputTokens }
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
