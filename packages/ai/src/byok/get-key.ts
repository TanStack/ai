import { byokHeaderName, resolveProviderId } from './providers'
import type { ByokProvider } from './define-provider'
import type { ProviderId } from './providers'

export function getByokKey(
  request: Request,
  provider: ProviderId | ByokProvider,
): string | null {
  const value = request.headers.get(byokHeaderName(resolveProviderId(provider)))
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  if (typeof provider === 'string') return null
  for (const name of provider.env ?? []) {
    const envValue = process.env[name]
    if (typeof envValue === 'string' && envValue.length > 0) return envValue
  }
  return null
}
