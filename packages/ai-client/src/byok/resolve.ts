import { ByokUnresolvedProviderError, isProviderId } from '@tanstack/ai/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { ByokClient } from './client'

/**
 * Picks the BYOK slug(s) for a request. Returns a list because some
 * credentials are made of several stored values (for example a Cloudflare
 * account id plus API token), each sent as its own `x-byok-<id>` header.
 */
export type ByokProviderSelector = () =>
  | string
  | ReadonlyArray<string>
  | undefined

export function resolveByokProviderIds(
  byokProvider: ByokProviderSelector | undefined,
  ...candidates: Array<unknown>
): Array<ProviderId> {
  const fromFn = byokProvider?.()
  const fromList = (Array.isArray(fromFn) ? fromFn : [fromFn]).filter(
    isProviderId,
  )
  if (fromList.length > 0) return fromList
  for (const candidate of candidates) {
    if (isProviderId(candidate)) return [candidate]
  }
  return []
}

/** First slug from {@link resolveByokProviderIds}. */
export function resolveByokProviderId(
  byokProvider: ByokProviderSelector | undefined,
  ...candidates: Array<unknown>
): ProviderId | undefined {
  return resolveByokProviderIds(byokProvider, ...candidates)[0]
}

/**
 * Prepare and stamp headers for the resolved slug(s). Throws instead of
 * attaching every stored key when no slug resolved.
 */
export async function prepareResolvedByokHeaders(
  byok: ByokClient,
  provider: ProviderId | ReadonlyArray<ProviderId> | undefined,
): Promise<Record<string, string>> {
  const ids =
    provider === undefined
      ? []
      : typeof provider === 'string'
        ? [provider]
        : [...provider]
  if (ids.length === 0) {
    throw new ByokUnresolvedProviderError()
  }
  const headers: Record<string, string> = {}
  for (const id of ids) {
    await byok.prepare(id)
    Object.assign(headers, byok.headers(id))
  }
  return headers
}
