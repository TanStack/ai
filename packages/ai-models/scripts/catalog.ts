import { ONLY } from './known-ids'
import {
  costFrom,
  inputModalities,
  makesText,
  modelHints,
  reasoningFrom,
} from './rules'
import type { ProviderRow, Wire } from './providers'
import type { SchemaModel } from './rules'
import type {
  ModelCompat,
  ModelRecord,
  ProviderRecord,
  WireApi,
} from '../src/types'

/** The trimmed modelschemas rows (`scripts/modelschemas.models.json`), by provider. */
export type SchemaCatalog = Readonly<Record<string, ReadonlyArray<SchemaModel>>>

/** Drop undefined fields, so the generated files stay small. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T
}

const mergeCompat = (
  ...parts: ReadonlyArray<ModelCompat | undefined>
): ModelCompat | undefined => {
  const merged: ModelCompat = Object.assign({}, ...parts)
  return Object.keys(merged).length > 0 ? merged : undefined
}

/** Turn one modelschemas row into a catalog record for `row`. */
export function toRecord(
  row: ProviderRow,
  id: string,
  model: SchemaModel,
): ModelRecord {
  const wire: Wire = row.wire?.({
    id: model.rawId,
    ...(model.schemaEndpointId ? { endpoint: model.schemaEndpointId } : {}),
  }) ?? { api: row.api, baseUrl: row.baseUrl }
  const compat = mergeCompat(
    row.compat,
    row.modelCompat?.(id, wire),
    modelHints(model, wire, row.effortByModel === true),
  )
  return compact({
    id,
    provider: row.id,
    name: model.displayName ?? id,
    api: wire.api,
    baseUrl: wire.baseUrl,
    input: inputModalities(model.modalities?.input),
    reasoning: reasoningFrom(model),
    cost: costFrom(model),
    contextWindow: model.contextWindow ?? 0,
    maxTokens: model.maxOutput ?? 0,
    headers: row.headers,
    compat,
  })
}

/** Every model of one provider, sorted by id. An alias is a record of its own. */
export function buildModels(
  row: ProviderRow,
  catalog: SchemaCatalog,
): ReadonlyArray<ModelRecord> {
  const records = new Map<string, ModelRecord>()
  const only = ONLY[row.id]
  const allowed = (id: string) => !only || only.includes(id)

  for (const source of row.sources)
    for (const model of catalog[source] ?? []) {
      if (!makesText(model)) continue
      for (const sourceId of [model.rawId, ...(model.aliases ?? [])]) {
        const id = row.modelId?.(sourceId) ?? sourceId
        if (records.has(id) || !allowed(id)) continue
        records.set(id, toRecord(row, id, model))
      }
    }

  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** The provider record of a row, with the wires its models use. */
export function buildProvider(
  row: ProviderRow,
  models: ReadonlyArray<ModelRecord>,
): ProviderRecord {
  const apis = [...new Set<WireApi>([row.api, ...models.map((m) => m.api)])]
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apis: apis.sort(),
    env: row.env,
  }
}
