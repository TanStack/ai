/**
 * Writes `src/model-reasoning.ts` in each provider package: each chat model's
 * reasoning levels, as a type map for `chat({ reasoning })` and as a runtime
 * map the adapter clamps with.
 *
 * The data is models.dev (`scripts/models-dev.models.json`) with the same
 * level rule as `@tanstack/ai-models`. A model is looked up at the package's
 * own provider first, then in the gateway list, then as the same model at
 * another provider.
 *
 * Usage:
 *   pnpm tsx scripts/sync-model-reasoning.ts
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { supportedReasoningLevels } from '../packages/ai/src/reasoning'
import {
  findSameModel,
  reasoningMapFrom,
  takesBudget,
} from '../packages/ai-models/scripts/rules'
import { models as openrouterModels } from './openrouter.models'
import { models as vercelModels } from './vercel-gateway.models'
import { fromOpenRouter, fromVercel } from './model-sync/gateway-models'
import { REASONING_TARGETS } from './model-sync/reasoning-targets'
import type { ModelReasoning } from '../packages/ai/src/reasoning'
import type { DevModel } from '../packages/ai-models/scripts/rules'
import type { ReasoningTarget } from './model-sync/reasoning-targets'

const here = dirname(fileURLToPath(import.meta.url))
type DevCatalog = Record<string, { models: Record<string, DevModel> }>

/** The chat model ids of a target, in their list order. */
async function modelIds(
  target: ReasoningTarget,
  dev: DevCatalog,
): Promise<ReadonlyArray<string>> {
  if (!target.models)
    return Object.keys(dev[target.sources[0] ?? '']?.models ?? {})
  const path = resolve(
    here,
    `../packages/${target.pkg}/src/${target.models.module}.ts`,
  )
  const module: Record<string, unknown> = await import(pathToFileURL(path).href)
  const ids: Array<string> = []
  for (const list of target.models.lists) {
    const values = module[list]
    if (!Array.isArray(values))
      throw new Error(`${target.pkg}: ${list} is not an array`)
    for (const value of values)
      if (typeof value === 'string' && !ids.includes(value)) ids.push(value)
  }
  return ids
}

/** Where a target's model is on models.dev, or `undefined`. */
function lookup(
  target: ReasoningTarget,
  id: string,
  dev: DevCatalog,
  gateways: Record<string, Map<string, DevModel>>,
): DevModel | undefined {
  const alias = target.aliases?.[id]
  if (alias) {
    const slash = alias.indexOf('/')
    return dev[alias.slice(0, slash)]?.models[alias.slice(slash + 1)]
  }
  for (const source of target.sources) {
    const model = dev[source]?.models[id]
    if (model) return model
  }
  const gateway = target.gateway ? gateways[target.gateway]?.get(id) : undefined
  return gateway ?? findSameModel(dev, id)?.model
}

/**
 * Ollama's models are local, so models.dev does not list them. Its own model
 * metadata marks thinking models with a `thinking` capability: gpt-oss takes
 * the levels `low`, `medium`, and `high`, and the others turn thinking on or
 * off.
 */
async function ollamaReasoning(): Promise<Map<string, ModelReasoning>> {
  const dir = resolve(here, '../packages/ai-ollama/src/meta')
  const found = new Map<string, ModelReasoning>()
  for (const file of await readdir(dir)) {
    if (!file.startsWith('model-meta-')) continue
    const source = await readFile(resolve(dir, file), 'utf8')
    const blocks = source.split(/\nconst [A-Za-z0-9_]+ = \{/).slice(1)
    for (const block of blocks) {
      const name = /name: '([^']+)'/.exec(block)?.[1]
      if (!name) continue
      const capabilities = /capabilities: \[([^\]]*)\]/.exec(block)?.[1] ?? ''
      if (!capabilities.includes("'thinking'")) {
        found.set(name, false)
        continue
      }
      found.set(
        name,
        block.includes('OllamaChatRequestThinking_OpenAI')
          ? {
              map: {
                off: null,
                minimal: null,
                low: 'low',
                medium: 'medium',
                high: 'high',
              },
              budget: false,
            }
          : {
              map: {
                off: 'false',
                minimal: null,
                low: null,
                medium: null,
                high: 'true',
              },
              budget: false,
            },
      )
    }
  }
  return found
}

/** One model's runtime reasoning data. */
function reasoningOf(model: DevModel): ModelReasoning {
  if (model.reasoning !== true) return false
  const map = reasoningMapFrom(model.reasoning_options)
  return {
    ...(map ? { map } : {}),
    budget: takesBudget(model.reasoning_options),
  }
}

const quote = (value: string) => `'${value.replace(/'/g, "\\'")}'`

function fileFor(
  target: ReasoningTarget,
  entries: ReadonlyArray<[string, ModelReasoning]>,
): string {
  const typeName = `${target.typePrefix}ModelReasoningByName`
  const constName = `${target.constPrefix}_MODEL_REASONING`
  const typeRows = entries.flatMap(([id, reasoning]) =>
    reasoning === false
      ? []
      : [
          `  ${quote(id)}: { levels: ${supportedReasoningLevels(reasoning).map(quote).join(' | ')}; budget: ${reasoning.budget} }`,
        ],
  )
  const runtimeRows = entries.map(
    ([id, reasoning]) => `  ${quote(id)}: ${JSON.stringify(reasoning)},`,
  )
  return `// Generated by scripts/sync-model-reasoning.ts from models.dev. Do not edit.
import type { ModelReasoning } from '@tanstack/ai'

/**
 * Each model's reasoning levels, and whether it takes a token budget, for
 * \`chat({ reasoning })\`. A model that is not here does not reason.
 */
export type ${typeName} = {
${typeRows.join('\n')}
}

/** The same data at runtime. \`false\`: the model does not reason. */
export const ${constName}: Readonly<Record<string, ModelReasoning>> = {
${runtimeRows.join('\n')}
}
`
}

async function main() {
  const dev: DevCatalog = JSON.parse(
    await readFile(resolve(here, 'models-dev.models.json'), 'utf8'),
  )
  const gateways = {
    openrouter: new Map(
      openrouterModels.map((model) => [model.id, fromOpenRouter(model)]),
    ),
    vercel: new Map(vercelModels.map((model) => [model.id, fromVercel(model)])),
  }
  const ollama = await ollamaReasoning()
  for (const target of REASONING_TARGETS) {
    const entries: Array<[string, ModelReasoning]> = []
    let missing = 0
    for (const id of await modelIds(target, dev)) {
      const local = target.pkg === 'ai-ollama' ? ollama.get(id) : undefined
      if (local !== undefined) {
        entries.push([id, local])
        continue
      }
      const model = lookup(target, id, dev, gateways)
      if (!model) {
        missing++
        continue
      }
      entries.push([id, reasoningOf(model)])
    }
    await writeFile(
      resolve(here, `../packages/${target.pkg}/src/model-reasoning.ts`),
      fileFor(target, entries),
    )
    const reasoning = entries.filter(([, value]) => value !== false).length
    console.log(
      `${target.pkg}: ${entries.length} models (${reasoning} reason), ${missing} not found`,
    )
  }
}

await main()
