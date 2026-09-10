/**
 * Thin wrapper around `@modelschemas/client` for the native model sync.
 */

import { createModelschemasClient, listModels } from '@modelschemas/client'
import { parseCatalogModels } from './catalog'
import type { CatalogModel } from './catalog'
import { SYNCED_PROVIDERS } from './provider-supports'
import type { SyncedProvider } from './provider-supports'

export const MODELSCHEMAS_BASE_URL = 'https://modelschemas.com'

export function createSyncClient(options?: {
  apiKey?: string
  fetch?: typeof globalThis.fetch
  baseUrl?: string
}) {
  const apiKey = options?.apiKey ?? process.env.MODELSCHEMAS_API_KEY
  return createModelschemasClient({
    baseUrl: options?.baseUrl ?? MODELSCHEMAS_BASE_URL,
    ...(apiKey ? { apiKey } : {}),
    ...(options?.fetch ? { fetch: options.fetch } : {}),
  })
}

type SyncClient = ReturnType<typeof createSyncClient>

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return String(error)
  const record = error as Record<string, unknown>
  const nested = record.error
  if (nested && typeof nested === 'object') {
    const inner = nested as Record<string, unknown>
    if (typeof inner.message === 'string') return inner.message
  }
  if (typeof record.message === 'string') return record.message
  return JSON.stringify(error)
}

export async function fetchCatalog(
  client: SyncClient,
  query: {
    provider: string
    activity?:
      | 'chat'
      | 'image'
      | 'video'
      | 'audio'
      | 'embeddings'
      | 'moderation'
  },
): Promise<Array<CatalogModel>> {
  const result = await listModels({ client, query })
  if (result.error !== undefined) {
    throw new Error(
      `modelschemas listModels provider=${query.provider}: ${errorMessage(result.error)}`,
    )
  }
  return parseCatalogModels(result.data)
}

export async function fetchSyncCatalogs(client: SyncClient): Promise<{
  native: Record<SyncedProvider, Array<CatalogModel>>
  openrouter: Array<CatalogModel>
}> {
  const [openrouter, ...nativeLists] = await Promise.all([
    fetchCatalog(client, { provider: 'openrouter' }),
    ...SYNCED_PROVIDERS.map((provider) => fetchCatalog(client, { provider })),
  ])
  const native = {} as Record<SyncedProvider, Array<CatalogModel>>
  for (const [index, provider] of SYNCED_PROVIDERS.entries()) {
    native[provider] = nativeLists[index] ?? []
  }
  return { native, openrouter }
}
