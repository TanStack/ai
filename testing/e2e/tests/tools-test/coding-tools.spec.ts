import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * The coding tools of `workspaceTools()` from
 * `@tanstack/ai-harness/plugins/coding`. A `coding-*` scenario of
 * `/api/tools-test` runs one harness turn in a temp folder that the test
 * makes. aimock gives one tool call, and the tool works on real files. Each
 * test checks the `TOOL_CALL_RESULT` that the client gets, and the files
 * after the turn. No `permissions()` is mounted, so no tool waits for
 * approval.
 */

type Chunk = { type: string; delta?: string; content?: string }

/** The chunks of an SSE body. */
const sse = (body: string): Array<Chunk> =>
  body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))

/** The workspace of the running test. */
let root = ''
const file = (path: string) => join(root, path)
const read = (path: string) => readFile(file(path), 'utf8')

/** Run `scenario` in `root`. Gives the tool results and the text the client got. */
async function runScenario(
  request: APIRequestContext,
  scenario: string,
  testId: string,
  aimockPort: number,
) {
  const response = await request.post('/api/tools-test', {
    data: {
      threadId: `${scenario}-${testId}`,
      runId: `${scenario}-run-${testId}`,
      state: {},
      messages: [{ id: 'u1', role: 'user', content: `[${scenario}] run test` }],
      tools: [],
      context: [],
      forwardedProps: { scenario, testId, aimockPort, root },
    },
  })
  const body = await response.text()
  expect(response.ok(), body).toBe(true)
  const chunks = sse(body)
  expect(
    chunks.filter((chunk) => chunk.type === 'RUN_ERROR'),
    body,
  ).toEqual([])
  return {
    results: chunks
      .filter((chunk) => chunk.type === 'TOOL_CALL_RESULT')
      .map((chunk) => chunk.content),
    text: chunks
      .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
      .map((chunk) => chunk.delta)
      .join(''),
  }
}

test.describe('Coding tools (tools-test route)', () => {
  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'e2e-coding-'))
  })

  test.afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('read_file gives the lines with their numbers', async ({
    request,
    testId,
    aimockPort,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    expect(
      await runScenario(request, 'coding-read', testId, aimockPort),
    ).toEqual({
      results: ['1\talpha\n2\tbeta'],
      text: 'notes.txt has two lines.',
    })
    expect(await read('notes.txt')).toBe('alpha\nbeta\n')
  })

  test('edit_file finds the old text when the file has spaces at the end of a line', async ({
    request,
    testId,
    aimockPort,
  }) => {
    // The old text is `alpha\nbeta`. The exact text is not in the file.
    await writeFile(file('notes.txt'), 'alpha  \nbeta\n')

    expect(
      await runScenario(request, 'coding-edit', testId, aimockPort),
    ).toEqual({
      results: ['Edited notes.txt (1 change).'],
      text: 'Edited notes.txt.',
    })
    // The match covers the trailing spaces, so they go too.
    expect(await read('notes.txt')).toBe('gamma\nbeta\n')
  })

  test('patch updates one file and adds another', async ({
    request,
    testId,
    aimockPort,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    expect(
      await runScenario(request, 'coding-patch', testId, aimockPort),
    ).toEqual({
      results: ['Applied the patch:\nupdated notes.txt\nadded added.txt'],
      text: 'Patched notes.txt and added added.txt.',
    })
    expect(await read('notes.txt')).toBe('delta\nbeta\n')
    expect(await read('added.txt')).toBe('added by patch\n')
  })

  test('grep gives each match as file:line: text', async ({
    request,
    testId,
    aimockPort,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')
    await writeFile(file('more.txt'), 'more beta\n')

    expect(
      await runScenario(request, 'coding-grep', testId, aimockPort),
    ).toEqual({
      results: ['more.txt:1: more beta\nnotes.txt:2: beta'],
      text: 'beta is in two files.',
    })
    expect(await read('notes.txt')).toBe('alpha\nbeta\n')
  })

  test('bash runs the command in the workspace with AGENT=1', async ({
    request,
    testId,
    aimockPort,
  }) => {
    // The command is `node -e "..."`: it writes bash.txt and prints `done`.
    expect(
      await runScenario(request, 'coding-bash', testId, aimockPort),
    ).toEqual({
      results: ['exit code: 0\ndone\n'],
      text: 'The command ran.',
    })
    expect(await read('bash.txt')).toBe('AGENT=1')
  })

  test('revert puts back the files of the turns and keeps the edit of the user', async ({
    request,
    testId,
    aimockPort,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')
    await writeFile(file('other.txt'), 'original\n')

    // Two turns edit notes.txt. Between them, the user edits other.txt.
    // Then the route reverts to the first prompt.
    expect(
      await runScenario(request, 'coding-revert', testId, aimockPort),
    ).toEqual({
      results: ['Edited notes.txt (1 change).', 'Edited notes.txt (1 change).'],
      text: 'Edited notes.txt.Edited notes.txt again.',
    })
    expect(await read('notes.txt')).toBe('alpha\nbeta\n')
    expect(await read('other.txt')).toBe('mine\n')
  })
})
