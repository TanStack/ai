import { readFile, writeFile } from 'node:fs/promises'
import * as prettier from 'prettier'

const API_URL = 'https://openrouter.ai/api/v1/models'
const OUTPUT_PATH = new URL('./openrouter.models.ts', import.meta.url)

const ARRAY_START = 'export const models: Array<OpenRouterModel> = ['

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function serializeKey(k: string): string {
  return VALID_IDENTIFIER.test(k) ? k : JSON.stringify(k)
}

function serializeValue(value: unknown, indent: number): string {
  const pad = '  '.repeat(indent)
  const childPad = '  '.repeat(indent + 1)

  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
    return `'${escaped}'`
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      const items = value.map((v) => serializeValue(v, 0)).join(', ')
      if (items.length < 80) return `[${items}]`
    }
    const items = value.map(
      (v) => `${childPad}${serializeValue(v, indent + 1)},`,
    )
    return `[\n${items.join('\n')}\n${pad}]`
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    const lines = entries.map(
      ([k, v]) =>
        `${childPad}${serializeKey(k)}: ${serializeValue(v, indent + 1)},`,
    )
    return `{\n${lines.join('\n')}\n${pad}}`
  }
  return String(value)
}

async function main() {
  const existing = await readFile(OUTPUT_PATH, 'utf-8')
  const arrayStartIndex = existing.indexOf(ARRAY_START)
  if (arrayStartIndex === -1) {
    throw new Error(`Could not find "${ARRAY_START}" in openrouter.models.ts`)
  }
  const preamble = existing.slice(0, arrayStartIndex)

  console.log(`Fetching models from ${API_URL}...`)
  const response = await fetch(API_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`,
    )
  }

  const json = (await response.json()) as {
    data: Array<Record<string, unknown>>
  }
  const models = json.data
  models.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.id).localeCompare(String(b.id)),
  )
  console.log(`Fetched ${models.length} models`)

  const modelEntries = models.map(
    (model) => `  ${serializeValue(model, 1).trimStart()},`,
  )

  const raw = `${preamble}${ARRAY_START}\n${modelEntries.join('\n')}\n]\n`

  const prettierConfig = await prettier.resolveConfig(OUTPUT_PATH.pathname)
  const output = await prettier.format(raw, {
    ...prettierConfig,
    filepath: OUTPUT_PATH.pathname,
  })

  await writeFile(OUTPUT_PATH, output)
  console.log(`Wrote ${models.length} models to scripts/openrouter.models.ts`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
