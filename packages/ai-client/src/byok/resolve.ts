import { isProviderId } from '@tanstack/ai/byok'
import type { ProviderId } from '@tanstack/ai/byok'

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
