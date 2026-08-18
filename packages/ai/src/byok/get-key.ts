import { byokHeaderName } from './providers'
import type { ProviderId } from './providers'

export function getByokKey(
  request: Request,
  provider: ProviderId,
): string | null {
  const value = request.headers.get(byokHeaderName(provider))
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getByokOrEnvKey(
  request: Request,
  provider: ProviderId,
  envNames: ReadonlyArray<string>,
): string | null {
  const fromHeader = getByokKey(request, provider)
  if (fromHeader) return fromHeader
  for (const name of envNames) {
    const value = process.env[name]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}
