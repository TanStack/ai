import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { byteplusByok } from '@tanstack/ai-byteplus/byok'
import { falByok } from '@tanstack/ai-fal/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { reactorByok } from '@tanstack/ai-reactor/byok'
import { createServerFn } from '@tanstack/react-start'
import {
  ByokBlockedError,
  ByokMissingError,
  isByokMissingBody,
} from '@tanstack/ai/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export {
  byteplusByok,
  falByok,
  geminiByok,
  grokByok,
  openrouterByok,
  reactorByok,
}

export const KEYED_PROVIDERS = [
  falByok,
  geminiByok,
  grokByok,
  openrouterByok,
  byteplusByok,
  reactorByok,
] as const

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: KEYED_PROVIDERS,
})

// Let the relay decide when a key is missing. The server prefers the
// `x-byok-*` header, then env.
byok.setServerCoverage(true)

export function toByokProvider(
  provider: 'fal' | 'gemini' | 'xai' | 'byteplus' | 'openrouter' | 'reactor',
): ProviderId {
  if (provider === 'xai') return grokByok.id
  return provider
}

function byokMissingFromUnknown(value: unknown): ByokMissingError | null {
  if (value instanceof ByokMissingError) return value
  if (isByokMissingBody(value)) {
    return new ByokMissingError(value.error.provider)
  }
  if (!(value instanceof Error)) return null
  try {
    const parsed: unknown = JSON.parse(value.message)
    if (isByokMissingBody(parsed)) {
      return new ByokMissingError(parsed.error.provider)
    }
  } catch {
    // The message is not a byok_missing JSON body.
  }
  return null
}

/**
 * Start serializes a thrown `byokMissing()` Response as a 401 whose body
 * is the JSON string. Rehydrate that (or a raw Response) into
 * `ByokMissingError` so generation hooks and Live/World can `byok.request`.
 */
export async function callWithByok<T>(task: Promise<T>): Promise<T> {
  try {
    const result = await task
    if (result instanceof Response) {
      const missing = byokMissingFromUnknown(
        await result
          .clone()
          .json()
          .catch(() => null),
      )
      if (missing) throw missing
    }
    return result
  } catch (error) {
    if (error instanceof Response) {
      const missing = byokMissingFromUnknown(
        await error
          .clone()
          .json()
          .catch(() => null),
      )
      if (missing) throw missing
    }
    const missing = byokMissingFromUnknown(error)
    if (missing) throw missing
    throw error
  }
}

/** Open the key dialog for a missing or locked key. */
export function requestByokFromError(error: unknown): void {
  if (error instanceof ByokMissingError) {
    byok.request(error.provider, 'missing')
    return
  }
  if (error instanceof ByokBlockedError) {
    byok.request(error.provider, error.reason)
  }
}

/** Booleans only — which keyed providers have an env key on the relay. */
export const getEnvKeyStatus = createServerFn({ method: 'GET' }).handler(
  (): Record<string, boolean> => {
    const status: Record<string, boolean> = {}
    for (const provider of KEYED_PROVIDERS) {
      status[provider.id] = (provider.env ?? []).some((name) =>
        Boolean(process.env[name]),
      )
    }
    return status
  },
)
