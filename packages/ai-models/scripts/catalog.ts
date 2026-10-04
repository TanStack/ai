import { BORROW, ONLY } from './known-ids'
import { EXTRA_MODELS, MODEL_OVERRIDES } from './overrides'
import {
  inputModalities,
  makesText,
  modelHints,
  reasoningMapFrom,
  takesBudget,
} from './rules'
import type { ProviderRow, Wire } from './providers'
import type { DevModel } from './rules'
import type {
  ModelCompat,
  ModelRecord,
  ProviderRecord,
  WireApi,
} from '../src/types'

/** The trimmed models.dev catalog (`scripts/models-dev.models.json`). */
export type DevCatalog = Readonly<
  Record<string, { models: Readonly<Record<string, DevModel>> }>
>

/** A gateway's own model list, turned into models.dev's shape. */
export type GatewayModels = ReadonlyArray<DevModel>

/** The inputs of one build. */
export interface CatalogInputs {
  dev: DevCatalog
  /** Extra model lists per provider id, for example OpenRouter's own API. */
  gateways?: Readonly<Record<string, GatewayModels>>
}

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

/** Turn one models.dev model into a catalog record for `row`. */
export function toRecord(
  row: ProviderRow,
  id: string,
  model: DevModel,
  sourceId: string,
  borrowedFrom?: string,
): ModelRecord {
  const wire: Wire = row.wire?.({
    id: sourceId,
    ...(model.provider?.npm ? { npm: model.provider.npm } : {}),
  }) ?? { api: row.api, baseUrl: row.baseUrl }
  const reasoning = model.reasoning === true
  const map = reasoning ? reasoningMapFrom(model.reasoning_options) : undefined
  const budget = reasoning && takesBudget(model.reasoning_options)
  const compat = mergeCompat(
    row.compat,
    row.modelCompat?.(id, wire),
    modelHints(model, wire, row.effortByModel === true),
  )
  return compact({
    id,
    provider: row.id,
    name: model.name ?? id,
    api: wire.api,
    baseUrl: wire.baseUrl,
    input: inputModalities(model.modalities?.input),
    reasoning,
    reasoningMap: map,
    reasoningBudget: budget || undefined,
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
      cacheRead: model.cost?.cache_read ?? 0,
      cacheWrite: model.cost?.cache_write ?? 0,
    },
    contextWindow: model.limit?.context ?? 0,
    maxTokens: model.limit?.output ?? 0,
    headers: row.headers,
    compat,
    borrowedFrom,
  })
}

/** Find `provider/model` in the catalog. Model ids can hold `/`. */
function lookup(dev: DevCatalog, source: string): DevModel | undefined {
  const slash = source.indexOf('/')
  return dev[source.slice(0, slash)]?.models[source.slice(slash + 1)]
}

/** Every model of one provider, sorted by id. */
export function buildModels(
  row: ProviderRow,
  inputs: CatalogInputs,
): ReadonlyArray<ModelRecord> {
  const records = new Map<string, ModelRecord>()
  const only = ONLY[row.id]
  const allowed = (id: string) => !only || only.includes(id)

  for (const source of row.sources)
    for (const [sourceId, model] of Object.entries(
      inputs.dev[source]?.models ?? {},
    )) {
      const id = row.modelId?.(sourceId) ?? sourceId
      if (records.has(id) || !allowed(id) || !makesText(model)) continue
      records.set(id, toRecord(row, id, model, sourceId))
    }

  // The gateway's own list has models models.dev does not (for example
  // OpenRouter's `:batch` variants).
  for (const model of inputs.gateways?.[row.id] ?? []) {
    if (records.has(model.id) || !makesText(model)) continue
    records.set(model.id, toRecord(row, model.id, model, model.id))
  }

  for (const [id, source] of Object.entries(BORROW[row.id] ?? {})) {
    if (records.has(id)) continue
    const model = lookup(inputs.dev, source)
    if (model) records.set(id, toRecord(row, id, model, id, source))
  }

  for (const extra of EXTRA_MODELS[row.id] ?? [])
    if (!records.has(extra.id))
      records.set(extra.id, {
        provider: row.id,
        api: row.api,
        baseUrl: row.baseUrl,
        ...(row.headers ? { headers: row.headers } : {}),
        ...extra,
      })

  for (const [id, override] of Object.entries(MODEL_OVERRIDES[row.id] ?? {})) {
    const record = records.get(id)
    if (record) records.set(id, { ...record, ...override })
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
