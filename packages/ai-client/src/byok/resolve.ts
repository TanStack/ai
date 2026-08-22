import { ByokUnresolvedProviderError, isProviderId } from '@tanstack/ai/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { ByokClient } from './client'

export function resolveByokProviderId(
  byokProvider: (() => string | undefined) | undefined,
  ...candidates: Array<unknown>
): ProviderId | undefined {
  const fromFn = byokProvider?.()
  if (isProviderId(fromFn)) return fromFn
  for (const candidate of candidates) {
    if (isProviderId(candidate)) return candidate
  }
  return undefined
}

/**
 * Prepare and stamp headers for one resolved slug. Throws instead of
 * attaching every stored key when the slug is missing.
 */
export async function prepareResolvedByokHeaders(
  byok: ByokClient,
  provider: ProviderId | undefined,
): Promise<Record<string, string>> {
  if (!provider) {
    throw new ByokUnresolvedProviderError()
  }
  await byok.prepare(provider)
  return byok.headers(provider)
}
