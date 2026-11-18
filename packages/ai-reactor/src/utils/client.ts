import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import { sendWith } from '@tanstack/ai-utils/kubb'
import { createSessionToken } from '../generated/client/sdk'
import type { CreateSessionTokenResponse } from '../generated/client/types'

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

export type ReactorTokenResponse = CreateSessionTokenResponse

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

  const { response } = await createSessionToken({
    client: sendWith(async (request) => {
      const res = await fetchImpl(`${args.apiUrl}${request.path}`, {
        method: request.method,
        headers: { ...request.headers, 'Content-Type': 'application/json' },
        body: request.body,
        ...(request.signal ? { signal: request.signal } : {}),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(
          `Reactor token request failed (${res.status}${
            res.statusText ? ` ${res.statusText}` : ''
          })${detail ? `: ${detail}` : ''}`,
        )
      }
      return res
    }),
    headers: { 'Reactor-API-Key': args.apiKey },
    body: {
      authorization_details: [
        {
          type: 'session',
          resources: { models: { match: [args.modelSlug] } },
        },
      ],
    },
    signal: args.abortSignal,
  })

  const body = (await response.json()) as {
    jwt?: unknown
    expires_at?: unknown
  }

  if (typeof body.jwt !== 'string' || body.jwt.length === 0) {
    throw new Error('Reactor token response did not include a jwt.')
  }

  if (
    typeof body.expires_at !== 'number' ||
    !Number.isFinite(body.expires_at)
  ) {
    throw new Error('Reactor token response did not include expires_at.')
  }

  return { jwt: body.jwt, expires_at: body.expires_at }
}
