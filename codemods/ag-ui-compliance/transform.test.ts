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

function runTransform(fixtureBaseName: string, ext: 'ts' | 'tsx'): string {
  const source = read(`${fixtureBaseName}.input.${ext}`)
  const j = jscodeshift.withParser('tsx')
  const result = transform(
    { path: `${fixtureBaseName}.input.${ext}`, source },
    {
      jscodeshift: j,
      j,
      stats: () => {},
      report: () => {},
    },
    {},
  )
  return typeof result === 'string' ? result : source
}

// Normalize line endings — fixtures may be saved as CRLF on Windows
// while jscodeshift emits LF, which would make a string compare
// fail despite identical content.
function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').trim()
}

function expectFixture(name: string, ext: 'ts' | 'tsx' = 'ts'): void {
  const expected = read(`${name}.output.${ext}`)
  const actual = runTransform(name, ext)
  expect(normalize(actual)).toBe(normalize(expected))
}

describe('ag-ui-compliance codemod', () => {
  it('renames useChat({ body }) to useChat({ forwardedProps })', () => {
    expectFixture('use-chat-body', 'tsx')
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

  it('leaves objects that already declare both keys untouched', () => {
    expectFixture('conflict-leave-alone')
  })
})
