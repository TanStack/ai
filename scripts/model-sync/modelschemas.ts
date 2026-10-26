/**
 * Thin wrapper around `@modelschemas/client` for the model sync scripts.
 */

import {
  createModelschemasClient,
  getSchema,
  listModels,
} from '@modelschemas/client'
import type { GetSchemaData } from '@modelschemas/client'
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

/** The raw `listModels` payload for one provider. */
export async function listRawModels(
  client: SyncClient,
  provider: string,
): Promise<unknown> {
  const result = await listModels({ client, query: { provider } })
  if (result.error !== undefined) {
    throw new Error(
      `modelschemas listModels provider=${provider}: ${errorMessage(result.error)}`,
    )
  }
  return result.data
}

export async function fetchCatalog(
  client: SyncClient,
  provider: string,
): Promise<Array<CatalogModel>> {
  return parseCatalogModels(await listRawModels(client, provider))
}

/** The raw input-schema payload for one endpoint, e.g. `v1/music`. */
export async function getInputSchema(
  client: SyncClient,
  path: GetSchemaData['path'],
): Promise<unknown> {
  const result = await getSchema({ client, path, query: { kind: 'input' } })
  if (result.error !== undefined) {
    const { provider, activity, endpointId } = path
    throw new Error(
      `modelschemas getSchema ${provider}/${activity}/${endpointId}: ${errorMessage(result.error)}`,
    )
  }
  return result.data
}

/**
 * Every synced provider's own catalog. An empty catalog throws: it would
 * hide every insert for that provider behind a "no new models" exit 0.
 */
export async function fetchSyncCatalogs(
  client: SyncClient,
): Promise<Record<SyncedProvider, Array<CatalogModel>>> {
  const nativeLists = await Promise.all(
    SYNCED_PROVIDERS.map((provider) => fetchCatalog(client, provider)),
  )
  const native = {} as Record<SyncedProvider, Array<CatalogModel>>
  for (const [index, provider] of SYNCED_PROVIDERS.entries()) {
    const rows = nativeLists[index]
    if (!rows?.length) {
      throw new Error(`modelschemas returned an empty ${provider} catalog`)
    }
    native[provider] = rows
  }
  return native
}
