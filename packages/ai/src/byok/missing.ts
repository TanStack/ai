import { isProviderId } from './providers'
import type { ProviderId } from './providers'

export interface ByokMissingBody {
  error: {
    type: 'byok_missing'
    provider: ProviderId
    message: string
  }
}

export function isByokMissingBody(value: unknown): value is ByokMissingBody {
  if (typeof value !== 'object' || value === null) return false
  if (!('error' in value)) return false
  const error = value.error
  if (typeof error !== 'object' || error === null) return false
  if (!('type' in error) || error.type !== 'byok_missing') return false
  if (!('provider' in error) || typeof error.provider !== 'string') {
    return false
  }
  if (!isProviderId(error.provider)) return false
  if (!('message' in error) || typeof error.message !== 'string') return false
  return true
}

export function byokMissing(provider: ProviderId): Response {
  if (!isProviderId(provider)) {
    throw new Error(`Invalid BYOK provider id: ${provider}`)
  }
  const body: ByokMissingBody = {
    error: {
      type: 'byok_missing',
      provider,
      message: `Missing ${provider} API key`,
    },
  }
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}
