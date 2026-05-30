import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jscodeshift from 'jscodeshift'
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

// Normalize line endings — fixtures may be saved as CRLF on Windows
// while jscodeshift emits LF, which would make a string compare
// fail despite identical content.
function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').trim()
}

function expectFixture(
  name: string,
  ext: 'ts' | 'tsx' = 'ts',
): { reports: Array<string> } {
  const expected = read(`${name}.output.${ext}`)
  const { output, reports } = runTransform(name, ext)
  expect(normalize(output)).toBe(normalize(expected))
  return { reports }
}

describe('move-sampling-to-model-options codemod', () => {
  it('moves openai temperature/maxTokens into modelOptions (renamed)', () => {
    const { reports } = expectFixture('openai-basic')
    expect(reports).toEqual([])
  })

  it('renames gemini topP/maxTokens to topP/maxOutputTokens', () => {
    expectFixture('gemini-rename')
  })

  it('renames groq maxTokens to max_completion_tokens', () => {
    expectFixture('groq-maxtokens')
  })

  it('renames openrouter maxTokens to maxCompletionTokens', () => {
    expectFixture('openrouter-maxtokens')
  })

  it('nests ollama sampling options inside modelOptions.options', () => {
    expectFixture('ollama-nested')
  })

  it('merges into an existing modelOptions object literal', () => {
    expectFixture('anthropic-merge')
  })

  it('expands a shorthand sampling prop to `key: identifier`', () => {
    expectFixture('shorthand')
  })

  it('transforms createChatOptions() calls', () => {
    expectFixture('create-chat-options')
  })

  it('transforms ai() and generate() callee variants', () => {
    expectFixture('generate-and-ai')
  })

  it('leaves files without a @tanstack/ai helper import untouched', () => {
    const { reports } = expectFixture('no-import')
    expect(reports).toEqual([])
  })

  it('leaves a call alone and reports when a target key already exists in modelOptions', () => {
    const { reports } = expectFixture('conflict')
    expect(reports.length).toBeGreaterThan(0)
    expect(
      reports.some(
        (r) =>
          r.includes('a target key already exists') &&
          r.includes('left alone'),
      ),
    ).toBe(true)
  })

  it('leaves a call alone and reports when the adapter is unresolvable', () => {
    const { reports } = expectFixture('unresolvable-adapter')
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
