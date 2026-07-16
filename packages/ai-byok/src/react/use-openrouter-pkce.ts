import { useCallback, useEffect, useState } from 'react'
import {
  completeOpenRouterPkceFromUrl,
  defaultOpenRouterCallbackUrl,
  startOpenRouterPkceLogin,
} from '../client/openrouter-pkce'
import { useByok } from './use-byok'

export interface UseOpenRouterPkceOptions {
  /**
   * Where OpenRouter redirects after login. Defaults to
   * `origin + pathname` of the current page.
   */
  callbackUrl?: string
  /**
   * When `true` (default), completes the flow on mount if the URL contains
   * `?code=…` from an OpenRouter redirect.
   */
  autoComplete?: boolean
  /** Use S256 PKCE (recommended). Default `true`. */
  useS256?: boolean
}

/**
 * OpenRouter PKCE login for BYOK. On return from OpenRouter, exchanges the
 * authorization code and saves the key via `setKey('openrouter', key)`.
 */
export function useOpenRouterPkce(options: UseOpenRouterPkceOptions = {}) {
  const { setKey } = useByok()
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callbackUrl = options.callbackUrl ?? defaultOpenRouterCallbackUrl()

  useEffect(() => {
    if (options.autoComplete === false) return
    if (typeof globalThis.location !== 'undefined') {
      const code = new URL(globalThis.location.href).searchParams.get('code')
      if (!code) return
    }
    let cancelled = false
    setCompleting(true)
    setError(null)
    void completeOpenRouterPkceFromUrl()
      .then((key) => {
        if (cancelled || !key) return
        return setKey('openrouter', key)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setCompleting(false)
      })
    return () => {
      cancelled = true
    }
  }, [options.autoComplete, setKey])

  const login = useCallback(async () => {
    setError(null)
    try {
      await startOpenRouterPkceLogin({
        callbackUrl,
        useS256: options.useS256,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [callbackUrl, options.useS256])

  return { login, completing, error, callbackUrl }
}
