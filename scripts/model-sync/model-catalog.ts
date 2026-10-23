/**
 * Turns modelschemas rows (`GET /v1/models?pricing=1`) into the `ModelRecord`s
 * that each provider package exports at its `./models` subpath. Each fact
 * comes from the row. A fact the row does not have stays `undefined`, and a
 * value this file does not know throws, so a new shape fails the sync instead
 * of writing a wrong record.
 */

import type {
  Modality,
  ModelPrices,
  ModelRates,
  ModelReasoning,
  ModelRecord,
  ReasoningLevel,
  ReasoningLevels,
} from '@tanstack/ai'

/** One catalog file: a modelschemas provider and the file it is written to. */
export interface CatalogTarget {
  /** The modelschemas provider id. */
  source: string
  name: string
  /** The generated file, from the repo root. */
  file: string
}

/** Only providers with an adapter package have a catalog. */
export const CATALOGS: ReadonlyArray<CatalogTarget> = [
  {
    source: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    file: 'packages/ai-bedrock/src/models.ts',
  },
  {
    source: 'anthropic',
    name: 'Anthropic',
    file: 'packages/ai-anthropic/src/models.ts',
  },
  {
    source: 'azure',
    name: 'Azure OpenAI',
    file: 'packages/ai-openai/src/azure-models.ts',
  },
  {
    source: 'cloudflare-ai-gateway',
    name: 'Cloudflare AI Gateway',
    file: 'packages/ai-cloudflare/src/gateway-models.ts',
  },
  {
    source: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI',
    file: 'packages/ai-cloudflare/src/models.ts',
  },
  {
    source: 'gemini',
    name: 'Gemini',
    file: 'packages/ai-gemini/src/models.ts',
  },
  {
    source: 'google-vertex',
    name: 'Vertex AI',
    file: 'packages/ai-vertex/src/models.ts',
  },
  { source: 'grok', name: 'xAI', file: 'packages/ai-grok/src/models.ts' },
  { source: 'groq', name: 'Groq', file: 'packages/ai-groq/src/models.ts' },
  {
    source: 'mistral',
    name: 'Mistral',
    file: 'packages/ai-mistral/src/models.ts',
  },
  {
    source: 'openai',
    name: 'OpenAI',
    file: 'packages/ai-openai/src/models.ts',
  },
  {
    source: 'openrouter',
    name: 'OpenRouter',
    file: 'packages/ai-openrouter/src/models.ts',
  },
  {
    source: 'vercel',
    name: 'Vercel AI Gateway',
    file: 'packages/ai-vercel-gateway/src/models.ts',
  },
]

/** The fields of a modelschemas row that the sync reads. */
export interface SchemaModel {
  provider: string
  rawId: string
  displayName?: string | null
  activity?: string | null
  deprecatedAt?: number | null
  aliases?: ReadonlyArray<string> | null
  contextWindow?: number | null
  maxOutput?: number | null
  modalities?: {
    input?: ReadonlyArray<string> | null
    output?: ReadonlyArray<string> | null
  } | null
  capabilities?: { reasoning?: boolean | null } | null
  reasoning?: {
    mode?: string | null
    efforts?: ReadonlyArray<string> | null
  } | null
  requestMap?: {
    thinking?: {
      /** The provider value per level. `null`: the model does not have it. */
      levels?: Partial<Record<ReasoningLevel, string | null>> | null
    } | null
  } | null
  pricing?: {
    tables?: Readonly<Record<string, unknown>> | null
    /** A JSON Logic expression with `lookup` and `currency`. */
    price?: unknown
  } | null
}

/** A current chat model that writes text. */
export function isChatModel(model: SchemaModel): boolean {
  const output = model.modalities?.output
  return (
    model.activity === 'chat' &&
    !model.deprecatedAt &&
    (!output?.length || output.includes('text'))
  )
}

const INPUTS: Readonly<Record<string, Modality>> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  pdf: 'document',
  file: 'document',
}

export function inputModalities(
  model: SchemaModel,
): ReadonlyArray<Modality> | undefined {
  const kinds = model.modalities?.input
  if (!kinds?.length) return undefined
  return [
    ...new Set(
      kinds.map((kind) => {
        const modality = INPUTS[kind]
        if (!modality)
          throw new Error(`${model.rawId}: unknown input modality '${kind}'`)
        return modality
      }),
    ),
  ]
}

const EFFORT_LEVELS: Readonly<Record<string, ReasoningLevel>> = {
  none: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

/**
 * The reasoning data of a row:
 * - `requestMap.thinking.levels`, when the row has it: each level with a value.
 * - Else the `efforts`: each names its level (any case), and `none` is `off`.
 *   `default` (the provider's own default) is not a level.
 * - Else no levels. `budget` says whether the model takes a token budget.
 */
export function reasoningFrom(model: SchemaModel): ModelReasoning {
  const reasoning = model.reasoning
  if (!reasoning?.mode && model.capabilities?.reasoning !== true) return false
  const budget = reasoning?.mode === 'budget'
  const map = model.requestMap?.thinking?.levels
  if (map)
    return {
      levels: Object.fromEntries(
        Object.entries(map).filter(([, value]) => typeof value === 'string'),
      ),
      budget,
    }
  const levels: ReasoningLevels = {}
  for (const effort of reasoning?.efforts ?? []) {
    if (effort === 'default') continue
    const level = EFFORT_LEVELS[effort.toLowerCase()]
    if (!level)
      throw new Error(`${model.rawId}: unknown reasoning effort '${effort}'`)
    levels[level] = effort
  }
  return { levels, budget }
}

/** Run a modelschemas price expression. Any other operator throws. */
export function evaluatePrice(
  expression: unknown,
  vars: Readonly<Record<string, number>>,
  tables: Readonly<Record<string, unknown>>,
): number {
  const run = (node: unknown): unknown => {
    if (node === null || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(run)
    const entries = Object.entries(node)
    const [op, arg] = entries[0] ?? []
    if (entries.length !== 1 || op === undefined)
      throw new Error(`Price operator with ${entries.length} keys`)
    const args: Array<unknown> = Array.isArray(arg) ? arg : [arg]
    switch (op) {
      case 'var':
        return vars[String(args[0])] ?? 0
      case '+':
        return args.reduce<number>((sum, part) => sum + Number(run(part)), 0)
      case '*':
        return args.reduce<number>(
          (product, part) => product * Number(run(part)),
          1,
        )
      case '>':
        return Number(run(args[0])) > Number(run(args[1]))
      case 'if':
        for (let i = 0; i + 1 < args.length; i += 2)
          if (run(args[i])) return run(args[i + 1])
        return args.length % 2 === 1 ? run(args[args.length - 1]) : 0
      case 'currency':
        return run(args[1])
      case 'lookup': {
        const { table, keys } = arg as { table: string; keys: Array<unknown> }
        let value: unknown = tables[table]
        for (const key of keys)
          value =
            value && typeof value === 'object'
              ? (value as Record<string, unknown>)[String(run(key))]
              : undefined
        if (typeof value !== 'number')
          throw new Error(
            `Price lookup ${table}/${keys.join('/')} is not a number`,
          )
        return value
      }
      default:
        throw new Error(`Unknown price operator '${op}'`)
    }
  }
  return Number(run(expression))
}

/** The `var` names an expression reads. */
function varsOf(node: unknown, names = new Set<string>()): Set<string> {
  if (node && typeof node === 'object')
    for (const [key, value] of Object.entries(node))
      if (key === 'var')
        names.add(String(Array.isArray(value) ? value[0] : value))
      else varsOf(value, names)
  return names
}

const RATE_VARS: Readonly<Record<keyof ModelRates, string>> = {
  input: 'input_tokens',
  output: 'output_tokens',
  cacheRead: 'cache_read_tokens',
  cacheWrite: 'cache_write_tokens',
  cacheWrite1h: 'cache_write_1h_tokens',
}

/**
 * The prices of a row per 1M tokens, from its price expression. Each rate is
 * the cost of one more token on top of `inputTokens` input tokens. A rate the
 * expression does not read stays `undefined`. No price expression: no prices.
 */
export function pricesFrom(model: SchemaModel): ModelPrices | undefined {
  const price = model.pricing?.price
  if (price === undefined || price === null) return undefined
  const tables = model.pricing?.tables ?? {}
  const read = varsOf(price)
  const ratesAt = (inputTokens: number): ModelRates => {
    const at = (extra: Record<string, number>) =>
      evaluatePrice(price, { input_tokens: inputTokens, ...extra }, tables)
    const base = at({})
    const rates: ModelRates = {}
    for (const [field, name] of Object.entries(RATE_VARS) as Array<
      [keyof ModelRates, string]
    >)
      if (read.has(name)) {
        const more = name === 'input_tokens' ? inputTokens + 1 : 1
        // Rounded to 1e-6 USD per 1M tokens, so float noise does not reach the files.
        rates[field] = Number(((at({ [name]: more }) - base) * 1e6).toFixed(6))
      }
    return rates
  }
  const rate = tables.rate
  const tiers = Object.keys(rate && typeof rate === 'object' ? rate : {})
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b)
    .map((above) => ({ inputTokensAbove: above, ...ratesAt(above + 1) }))
  const currency =
    typeof price === 'object' && 'currency' in price
      ? String((price as { currency: [unknown] }).currency[0])
      : 'USD'
  return {
    currency,
    ...ratesAt(0),
    ...(tiers.length > 0 ? { tiers } : {}),
  }
}

/** The records of one provider, sorted by id. An alias is a record of its own. */
export function buildRecords(
  rows: ReadonlyArray<SchemaModel>,
): Array<ModelRecord> {
  const records = new Map<string, ModelRecord>()
  for (const model of rows) {
    const record = {
      name: model.displayName ?? model.rawId,
      input: inputModalities(model),
      reasoning: reasoningFrom(model),
      prices: pricesFrom(model),
      contextWindow: model.contextWindow ?? undefined,
      maxOutputTokens: model.maxOutput ?? undefined,
    }
    for (const id of [model.rawId, ...(model.aliases ?? [])]) {
      if (records.has(id)) throw new Error(`Two rows have the id '${id}'`)
      records.set(id, { id, ...record })
    }
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id))
}
