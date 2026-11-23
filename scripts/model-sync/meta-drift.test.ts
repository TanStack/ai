/**
 * Checks the hand-kept OpenAI and Anthropic model data against the OpenRouter
 * catalog (`scripts/openrouter.models.json`). The daily sync refreshes that
 * file, so its PR fails here when the data of a model goes out of date, or
 * when the sync adds a model without the data it cannot write itself.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toNativeProviderId } from './ids'

const ROOT = resolve(__dirname, '../..')

interface CatalogModel {
  id: string
  supported_parameters?: Array<string>
}

const catalog: Array<CatalogModel> = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/openrouter.models.json'), 'utf8'),
)

/**
 * Models where OpenRouter is wrong. Each entry needs a reason.
 * Keys are `<provider>:<model>:<rule>`.
 */
const EXCEPTIONS: Record<string, string> = {}

interface MetaModel {
  constName: string
  model: string
  /** The constant body, from `{` to `} as const`, plus its `satisfies` type. */
  source: string
}

/** Each `const X = { name|id: '...' ... } as const satisfies ModelMeta<...>`. */
function readModels(file: string): Array<MetaModel> {
  const content = readFileSync(resolve(ROOT, file), 'utf8')
  const re =
    /^const (\w+) = \{\n {2}(?:name|id): '([^']+)'[\s\S]*?^\} as const satisfies ModelMeta<[^>]*>/gm
  return [...content.matchAll(re)].map((match) => ({
    constName: match[1]!,
    model: match[2]!,
    source: match[0],
  }))
}

/** The entry of a model in a `[CONST.id|name]: ...` type map. */
function typeMapEntry(file: string, typeName: string, constName: string) {
  const content = readFileSync(resolve(ROOT, file), 'utf8')
  const start = content.indexOf(`export type ${typeName} = {`)
  const block = content.slice(start, content.indexOf('\n}\n', start))
  const match = new RegExp(
    `\\[${constName}\\.(?:id|name)\\]: ([\\s\\S]*?)(?=\\n {2}\\[|\\n {2}//|$)`,
  ).exec(block)
  return match?.[1]
}

function catalogParams(provider: 'openai' | 'anthropic', model: string) {
  const entry = catalog.find(
    (row) =>
      row.id.startsWith(`${provider}/`) &&
      !row.id.includes(':') &&
      toNativeProviderId(row.id.slice(provider.length + 1), provider) === model,
  )
  return entry?.supported_parameters
}

const PROVIDERS = [
  {
    provider: 'openai',
    file: 'packages/ai-openai/src/model-meta.ts',
    optionsType: 'OpenAIChatModelProviderOptionsByName',
  },
  {
    provider: 'anthropic',
    file: 'packages/ai-anthropic/src/model-meta.ts',
    optionsType: 'AnthropicChatModelProviderOptionsByName',
  },
] as const

describe.each(PROVIDERS)('$provider model-meta.ts', (config) => {
  const models = readModels(config.file).flatMap((meta) => {
    const params = catalogParams(config.provider, meta.model)
    return params ? [{ ...meta, params }] : []
  })

  it('finds the models of the catalog', () => {
    expect(models.length).toBeGreaterThan(10)
  })

  it('has reasoning data for each model that OpenRouter says reasons', () => {
    const missing = models
      .filter((meta) => meta.params.includes('reasoning_effort'))
      .filter((meta) => !/\n {2}reasoning: /.test(meta.source))
      .map((meta) => meta.model)
      .filter((model) => !EXCEPTIONS[`${config.provider}:${model}:reasoning`])
    expect(missing).toEqual([])
  })

  it.runIf(config.provider === 'anthropic')(
    'has sampling options only for models that OpenRouter says take them',
    () => {
      const wrong = models.flatMap((meta) => {
        if (EXCEPTIONS[`anthropic:${meta.model}:sampling`]) return []
        const expected = ['temperature', 'top_p', 'top_k'].some((param) =>
          meta.params.includes(param),
        )
        const entry = typeMapEntry(
          config.file,
          config.optionsType,
          meta.constName,
        )
        return [
          ['constant', meta.source],
          ['type map', entry ?? ''],
        ]
          .filter(
            ([, source]) =>
              source!.includes('AnthropicSamplingOptions') !== expected,
          )
          .map(
            ([where]) =>
              `${meta.model} (${where}): ${expected ? 'needs' : 'must not have'} AnthropicSamplingOptions`,
          )
      })
      expect(wrong).toEqual([])
    },
  )
})
