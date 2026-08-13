import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jscodeshift from 'jscodeshift'
import * as prettier from 'prettier'
import { describe, expect, it } from 'vitest'
import transform from './transform'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES = resolve(__dirname, '__testfixtures__')

function read(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf-8')
}

function runTransform(
  fixtureBaseName: string,
  ext: 'ts' | 'tsx',
): { output: string; reports: Array<string> } {
  const source = read(`${fixtureBaseName}.input.${ext}`)
  const reports: Array<string> = []
  const j = jscodeshift.withParser('tsx')
  const result = transform(
    { path: `${fixtureBaseName}.input.${ext}`, source },
    {
      jscodeshift: j,
      j,
      stats: () => {},
      report: (msg: string) => {
        reports.push(msg)
      },
    },
    {},
  )
  if (typeof result !== 'string') {
    throw new Error(
      `transform returned ${typeof result} for ${fixtureBaseName}.input.${ext}; expected a string`,
    )
  }
  return { output: result, reports }
}

// Run both sides through Prettier before comparing. recast (jscodeshift's
// printer) emits semicolons and drops trailing commas, while the fixtures are
// written in the repo's Prettier style. Formatting both with the same options
// makes the comparison about semantics, not print quirks, and keeps the
// `.output.ts` fixtures readable/Prettier-clean. Prettier also normalizes line
// endings (CRLF on Windows → LF).
async function normalize(s: string): Promise<string> {
  const formatted = await prettier.format(s, { parser: 'typescript' })
  return formatted.trim()
}

async function expectFixture(
  name: string,
  ext: 'ts' | 'tsx' = 'ts',
): Promise<{ reports: Array<string> }> {
  const expected = read(`${name}.output.${ext}`)
  const { output, reports } = runTransform(name, ext)
  expect(await normalize(output)).toBe(await normalize(expected))
  return { reports }
}

describe('move-sampling-to-model-options codemod', () => {
  it('moves openai temperature/maxTokens into modelOptions (renamed)', async () => {
    const { reports } = await expectFixture('openai-basic')
    expect(reports).toEqual([])
  })

  it('renames gemini topP/maxTokens to topP/maxOutputTokens', async () => {
    await expectFixture('gemini-rename')
  })

  it('renames groq maxTokens to max_completion_tokens', async () => {
    await expectFixture('groq-maxtokens')
  })

  it('renames openrouter maxTokens to maxCompletionTokens', async () => {
    await expectFixture('openrouter-maxtokens')
  })

  it('nests ollama sampling options inside modelOptions.options', async () => {
    await expectFixture('ollama-nested')
  })

  it('merges into an existing modelOptions object literal', async () => {
    await expectFixture('anthropic-merge')
  })

  it('expands a shorthand sampling prop to `key: identifier`', async () => {
    await expectFixture('shorthand')
  })

  it('transforms createChatOptions() calls', async () => {
    await expectFixture('create-chat-options')
  })

  it('transforms ai() and generate() callee variants', async () => {
    await expectFixture('generate-and-ai')
  })

  it('leaves files without a @tanstack/ai helper import untouched', async () => {
    const { reports } = await expectFixture('no-import')
    expect(reports).toEqual([])
  })

  it('leaves a call alone and reports when a target key already exists in modelOptions', async () => {
    const { reports } = await expectFixture('conflict')
    expect(reports.length).toBeGreaterThan(0)
    expect(
      reports.some(
        (r) =>
          r.includes('a target key already exists') && r.includes('left alone'),
      ),
    ).toBe(true)
  })

  it('leaves a call alone and reports when the adapter is unresolvable', async () => {
    const { reports } = await expectFixture('unresolvable-adapter')
    expect(reports.length).toBeGreaterThan(0)
    expect(
      reports.some(
        (r) =>
          r.includes('could not resolve a known provider adapter') &&
          r.includes('left alone'),
      ),
    ).toBe(true)
  })
})
