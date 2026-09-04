import { getApiKeyFromEnv } from '@tanstack/ai-utils'

export const DEFAULT_REACTOR_API_URL = 'https://api.reactor.inc'

export interface ReactorClientConfig {
  apiKey?: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function getReactorApiKeyFromEnv(): string {
  return getApiKeyFromEnv('REACTOR_API_KEY')
}

export function resolveReactorApiKey(config?: ReactorClientConfig): string {
  return config?.apiKey ?? getReactorApiKeyFromEnv()
}

export function resolveReactorApiUrl(config?: ReactorClientConfig): string {
  return (config?.baseUrl ?? DEFAULT_REACTOR_API_URL).replace(/\/+$/, '')
}

export interface ReactorTokenResponse {
  jwt: string
  expires_at: number
}

export async function mintReactorSessionToken(args: {
  apiKey: string
  apiUrl: string
  modelSlug: string
  fetchImpl?: typeof fetch
  abortSignal?: AbortSignal
}): Promise<ReactorTokenResponse> {
  const fetchImpl = args.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'global fetch is not available. Pass `fetch` in the Reactor adapter config.',
    )
  }

  const response = await fetchImpl(`${args.apiUrl}/tokens`, {
    method: 'POST',
    headers: {
      'Reactor-API-Key': args.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      authorization_details: [
        {
          type: 'session',
          resources: { models: { match: [args.modelSlug] } },
        },
      ],
    }),
    ...(args.abortSignal ? { signal: args.abortSignal } : {}),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Reactor token request failed (${response.status}${
        response.statusText ? ` ${response.statusText}` : ''
      })${detail ? `: ${detail}` : ''}`,
    )
  }

  const body = (await response.json()) as {
    jwt?: unknown
    expires_at?: unknown
  }

  if (typeof body.jwt !== 'string' || body.jwt.length === 0) {
    throw new Error('Reactor token response did not include a jwt.')
  }

  const expiresAt =
    typeof body.expires_at === 'number' && Number.isFinite(body.expires_at)
      ? body.expires_at
      : Math.floor(Date.now() / 1000) + 3600

  return { jwt: body.jwt, expires_at: expiresAt }
}
