import { isProviderId, resolveProviderId } from './providers'
import type { ByokProvider } from './define-provider'
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

export function byokMissing(provider: ProviderId | ByokProvider): Response {
  const id = resolveProviderId(provider)
  if (!isProviderId(id)) {
    throw new Error(`Invalid BYOK provider id: ${id}`)
  }
  const body: ByokMissingBody = {
    error: {
      type: 'byok_missing',
      provider: id,
      message: `Missing ${id} API key`,
    },
  }
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}
