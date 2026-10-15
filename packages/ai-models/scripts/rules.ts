import type { Wire } from './providers'
import type {
  InputModality,
  ModelCompat,
  ModelCostRates,
  ModelReasoning,
  ReasoningLevel,
  ReasoningLevels,
} from '../src/types'

/** A modelschemas price expression (JSON Logic with `lookup` and `currency`). */
export type PriceExpression = unknown

/** The fields of a modelschemas model row that the generator reads. */
export interface SchemaModel {
  rawId: string
  displayName?: string | null
  activity?: string | null
  /** The endpoint path the model is served on, for example `v1/messages`. */
  schemaEndpointId?: string | null
  contextWindow?: number | null
  maxOutput?: number | null
  modalities?: {
    input?: ReadonlyArray<string> | null
    output?: ReadonlyArray<string> | null
  } | null
  capabilities?: { reasoning?: boolean; temperature?: boolean } | null
  reasoning?: {
    mode?: 'effort' | 'toggle' | 'adaptive' | 'budget' | null
    mandatory?: boolean | null
    efforts?: ReadonlyArray<string> | null
  } | null
  requestMap?: {
    thinking?: {
      levels?: Partial<Record<ReasoningLevel, string | null>> | null
    } | null
    maxTokensField?: 'max_tokens' | 'max_completion_tokens' | null
    developerRole?: boolean | null
    replayReasoningContent?: boolean | null
    reasoningEffort?: boolean | null
  } | null
  aliases?: ReadonlyArray<string> | null
  pricing?: {
    tables?: Readonly<Record<string, unknown>>
    price?: PriceExpression
  } | null
}

const THINKING_LEVELS: ReadonlyArray<Exclude<ReasoningLevel, 'off'>> = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

/**
 * The levels of a model with no level data: every level up to `high`, each
 * sent as its own name. The adapter turns them into a budget when the model
 * takes one.
 */
export const DEFAULT_LEVELS: ReasoningLevels = {
  off: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
}

const withoutOff = ({ off: _off, ...levels }: ReasoningLevels) => levels

/**
 * The reasoning data of a row. The levels:
 * - `efforts`: each value names its level (any case). `default` with no
 *   `high` is the `high` value (Groq).
 * - no efforts and `toggle`: only `high`.
 * - no efforts otherwise (`budget`, or no mode): `DEFAULT_LEVELS`.
 *
 * `off` is there when `mandatory` is `false`, or when `mandatory` is not
 * known and the efforts have `none` (or there are no efforts). Its value is
 * the `off` of `requestMap.thinking.levels`, else `none` for an effort model
 * and `off` for the others. That map is not read for the other levels: it
 * also maps the levels a model does not have to the nearest one.
 */
export function reasoningFrom(model: SchemaModel): ModelReasoning {
  const reasoning = model.reasoning
  if (!reasoning?.mode && model.capabilities?.reasoning !== true) return false
  const named = new Map(
    (reasoning?.efforts ?? []).map((value) => [value.toLowerCase(), value]),
  )
  const levels: ReasoningLevels = {}
  if (named.size > 0) {
    for (const level of THINKING_LEVELS) {
      const value = named.get(level)
      if (value) levels[level] = value
    }
    if (!levels.high && named.has('default')) levels.high = named.get('default')
  } else if (reasoning?.mode === 'toggle') levels.high = 'high'
  else Object.assign(levels, withoutOff(DEFAULT_LEVELS))
  const canTurnOff =
    reasoning?.mandatory === false ||
    (reasoning?.mandatory !== true && (named.size === 0 || named.has('none')))
  const off =
    model.requestMap?.thinking?.levels?.off ??
    named.get('none') ??
    (named.size > 0 ? 'none' : 'off')
  return {
    levels: canTurnOff ? { off, ...levels } : levels,
    budget: reasoning?.mode === 'budget',
  }
}

/** The model hints modelschemas has for the wire quirks. */
export function modelHints(
  model: SchemaModel,
  wire: Wire,
  effortByModel: boolean,
): ModelCompat {
  const hints: ModelCompat = {}
  const map = model.requestMap
  // These are Chat Completions request fields.
  if (wire.api === 'openai-completions') {
    if (map?.replayReasoningContent === true)
      hints.requiresReasoningContentOnAssistantMessages = true
    if (map?.maxTokensField) hints.maxTokensField = map.maxTokensField
    if (typeof map?.developerRole === 'boolean')
      hints.supportsDeveloperRole = map.developerRole
  }
  if (model.capabilities?.temperature === false)
    hints.supportsTemperature = false
  if (wire.api === 'anthropic-messages' && model.reasoning?.mode === 'adaptive')
    hints.forceAdaptiveThinking = true
  if (effortByModel && wire.api === 'openai-completions')
    hints.supportsReasoningEffort =
      map?.reasoningEffort ?? (model.reasoning?.efforts?.length ?? 0) > 0
  return hints
}

const INPUTS: ReadonlyArray<InputModality> = [
  'text',
  'image',
  'audio',
  'video',
  'document',
]

/** modelschemas input kinds, in the catalog's names. `pdf` and `file` are documents. */
export function inputModalities(
  input: ReadonlyArray<string> | null | undefined,
): ReadonlyArray<InputModality> {
  const mapped = (input ?? ['text']).map((kind) =>
    kind === 'pdf' || kind === 'file' ? 'document' : kind,
  )
  const known = INPUTS.filter((kind) => mapped.includes(kind))
  return known.length > 0 ? known : ['text']
}

/**
 * A chat model that makes text (not only images, speech, or embeddings). An
 * empty output list means not known, the same as no list.
 */
export function makesText(model: SchemaModel): boolean {
  const output = model.modalities?.output
  return (
    model.activity === 'chat' && (!output?.length || output.includes('text'))
  )
}

type Vars = Readonly<Record<string, number>>

/**
 * Evaluate a modelschemas price expression. It knows the operators the
 * catalog uses, and throws on any other one, so a new shape fails the
 * generator and does not write a wrong price.
 */
export function evaluatePrice(
  expression: PriceExpression,
  vars: Vars,
  tables: Readonly<Record<string, unknown>>,
): number {
  const run = (node: unknown): unknown => {
    if (node === null || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(run)
    const entries = Object.entries(node)
    if (entries.length !== 1)
      throw new Error(`Price operator with ${entries.length} keys`)
    const [[op, arg]] = entries as [[string, unknown]]
    const args = Array.isArray(arg) ? arg : [arg]
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
          value = (value as Record<string, unknown> | undefined)?.[
            String(run(key))
          ]
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

const RATE_VARS = {
  input: 'input_tokens',
  output: 'output_tokens',
  cacheRead: 'cache_read_tokens',
  cacheWrite: 'cache_write_tokens',
} as const

/** USD per 1M tokens, rounded so float noise does not reach the files. */
const perMillion = (perToken: number) =>
  Number((perToken * 1e6).toPrecision(10))

/**
 * The prices of a row per 1M tokens, read by running its price expression:
 * one token of each kind on top of `inputTokens` input tokens.
 */
function ratesAt(
  model: SchemaModel,
  inputTokens: number,
): Omit<ModelCostRates, 'tiers' | 'currency'> {
  const { price, tables = {} } = model.pricing ?? {}
  const at = (vars: Vars) => evaluatePrice(price, vars, tables)
  const base = at({ input_tokens: inputTokens })
  const extra = (name: string) =>
    perMillion(at({ input_tokens: inputTokens, [name]: 1 }) - base)
  return {
    input:
      inputTokens > 0 ? perMillion(base / inputTokens) : extra(RATE_VARS.input),
    output: extra(RATE_VARS.output),
    cacheRead: extra(RATE_VARS.cacheRead),
    cacheWrite: extra(RATE_VARS.cacheWrite),
  }
}

/**
 * The prices of a row. A rate table key that is a number is a tier: a call
 * with more input than it pays the tier prices. A row with no rate card
 * costs 0 (not known).
 */
export function costFrom(model: SchemaModel): ModelCostRates {
  const price = model.pricing?.price
  if (price === undefined || price === null)
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const currency =
    typeof price === 'object' && 'currency' in price
      ? (price as { currency: [string, unknown] }).currency[0]
      : undefined
  const rate = model.pricing?.tables?.rate
  const tiers = Object.keys(rate && typeof rate === 'object' ? rate : {})
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b)
    .map((above) => ({ inputTokensAbove: above, ...ratesAt(model, above + 1) }))
  return {
    ...ratesAt(model, 0),
    ...(tiers.length > 0 ? { tiers } : {}),
    ...(currency && currency !== 'USD' ? { currency } : {}),
  }
}
