/**
 * Thin wrapper around `@modelschemas/client` for the native model sync.
 */

import { createModelschemasClient, listModels } from '@modelschemas/client'
import { isRecord, parseCatalogModels } from './catalog'
import type { CatalogModel } from './catalog'
import { SYNCED_PROVIDERS } from './provider-supports'
import type { SyncedProvider } from './provider-supports'

export function createSyncClient(options?: {
  apiKey?: string
  fetch?: typeof globalThis.fetch
}): ReturnType<typeof createModelschemasClient> {
  const apiKey = options?.apiKey ?? process.env.MODELSCHEMAS_API_KEY
  return createModelschemasClient({
    baseUrl: 'https://modelschemas.com',
    ...(apiKey ? { apiKey } : {}),
    ...(options?.fetch ? { fetch: options.fetch } : {}),
  })
}

type SyncClient = ReturnType<typeof createSyncClient>

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (!isRecord(error)) return String(error)
  if (isRecord(error.error) && typeof error.error.message === 'string') {
    return error.error.message
  }
  if (typeof error.message === 'string') return error.message
  return JSON.stringify(error)
}

export async function fetchCatalog(
  client: SyncClient,
  provider: string,
): Promise<Array<CatalogModel>> {
  const result = await listModels({ client, query: { provider } })
  if (result.error !== undefined) {
    throw new Error(
      `modelschemas listModels provider=${provider}: ${errorMessage(result.error)}`,
    )
  }
  return parseCatalogModels(result.data)
}

/**
 * Every synced provider's native catalog plus the OpenRouter catalog.
 * An empty catalog throws: it would hide every insert for that provider
 * (or every price, for OpenRouter) behind a "no new models" exit 0.
 */
export async function fetchSyncCatalogs(client: SyncClient): Promise<{
  native: Record<SyncedProvider, Array<CatalogModel>>
  openrouter: Array<CatalogModel>
}> {
  const [openrouter, ...nativeLists] = await Promise.all([
    fetchCatalog(client, 'openrouter'),
    ...SYNCED_PROVIDERS.map((provider) => fetchCatalog(client, provider)),
  ])
  if (openrouter.length === 0) {
    throw new Error('modelschemas returned an empty openrouter catalog')
  }
  const native = {} as Record<SyncedProvider, Array<CatalogModel>>
  for (const [index, provider] of SYNCED_PROVIDERS.entries()) {
    const rows = nativeLists[index]
    if (!rows?.length) {
      throw new Error(`modelschemas returned an empty ${provider} catalog`)
    }
    native[provider] = rows
  }
  return { native, openrouter }
}
