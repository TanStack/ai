import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import jscodeshift from 'jscodeshift'
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

describe('ag-ui-compliance codemod', () => {
  it('renames useChat({ body }) to useChat({ forwardedProps })', () => {
    expectFixture('use-chat-body', 'tsx')
  })

  it('expands a shorthand `body` property to `forwardedProps: body` (preserves the original identifier reference)', () => {
    expectFixture('shorthand-body', 'tsx')
  })

  it('renames body on ChatClient constructor and updateOptions calls', () => {
    expectFixture('chat-client-body')
  })

  it('renames Svelte chat.updateBody() to chat.updateForwardedProps()', () => {
    expectFixture('svelte-update-body')
  })

  it('renames chat({ conversationId }) to chat({ threadId })', () => {
    expectFixture('chat-conversation-id')
  })

  it('leaves files without TanStack AI imports untouched', () => {
    expectFixture('no-imports')
  })

  it('leaves objects that already declare both keys untouched, and reports the conflict for human resolution', () => {
    const { reports } = expectFixture('conflict-leave-alone')
    // The codemod must surface conflicts via api.report so users can
    // find and merge them; silently leaving them alone hides intentional
    // (or accidental) dual-key state from the migration audit.
    expect(reports.length).toBeGreaterThan(0)
    expect(
      reports.some(
        (r) => r.includes('useChat({ body })') && r.includes('left alone'),
      ),
    ).toBe(true)
  })

  it('emits no report messages for clean transforms', () => {
    const { reports } = expectFixture('use-chat-body', 'tsx')
    expect(reports).toEqual([])
  })
})
