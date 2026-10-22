import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * The coding tools of `workspaceTools()` from
 * `@tanstack/ai-harness/plugins/coding`. A `coding-*` scenario of
 * `/api/coding-tools` runs one harness turn in a temp folder that the test
 * makes. aimock gives one tool call, and the tool works on real files. Each
 * test checks the `TOOL_CALL_RESULT` that the client gets, and the files
 * after the turn. The `coding-diffs` tests check the `FileChanged` events
 * of the turn and of an `/undo` instead. No `permissions()` is mounted, so no tool waits for approval.
 * Only `coding-format-ask` mounts `permissions()`: there the write asks
 * before it runs, and the route rejects the approval.
 */

type Chunk = {
  type: string
  delta?: string
  content?: string
  name?: string
  value?: unknown
  outcome?: {
    type: string
    interrupts?: Array<{ reason?: string; message?: string }>
  }
}

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

/** Run `scenario` in `root`. Gives the chunks the client got. */
async function post(
  request: APIRequestContext,
  scenario: string,
  testId: string,
) {
  const response = await request.post('/api/coding-tools', {
    data: { scenario, testId, root },
  })
  const body = await response.text()
  expect(response.ok(), body).toBe(true)
  const chunks = sse(body)
  expect(
    chunks.filter((chunk) => chunk.type === 'RUN_ERROR'),
    body,
  ).toEqual([])
  return chunks
}

/** Run `scenario` in `root`. Gives the tool results and the text the client got. */
async function runScenario(
  request: APIRequestContext,
  scenario: string,
  testId: string,
) {
  const chunks = await post(request, scenario, testId)
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

test.describe('Coding tools', () => {
  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'e2e-coding-'))
  })

  test.afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('read_file gives the lines with their numbers', async ({
    request,
    testId,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    expect(await runScenario(request, 'coding-read', testId)).toEqual({
      results: ['1\talpha\n2\tbeta'],
      text: 'notes.txt has two lines.',
    })
    expect(await read('notes.txt')).toBe('alpha\nbeta\n')
  })

  test('edit_file finds the old text when the file has spaces at the end of a line', async ({
    request,
    testId,
  }) => {
    // The old text is `alpha\nbeta`. The exact text is not in the file.
    await writeFile(file('notes.txt'), 'alpha  \nbeta\n')

    expect(await runScenario(request, 'coding-edit', testId)).toEqual({
      results: ['Edited notes.txt (1 change).'],
      text: 'Edited notes.txt.',
    })
    // The match covers the trailing spaces, so they go too.
    expect(await read('notes.txt')).toBe('gamma\nbeta\n')
  })

  test('patch updates one file and adds another', async ({
    request,
    testId,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    expect(await runScenario(request, 'coding-patch', testId)).toEqual({
      results: ['Applied the patch:\nupdated notes.txt\nadded added.txt'],
      text: 'Patched notes.txt and added added.txt.',
    })
    expect(await read('notes.txt')).toBe('delta\nbeta\n')
    expect(await read('added.txt')).toBe('added by patch\n')
  })

  test('grep gives each match as file:line: text', async ({
    request,
    testId,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')
    await writeFile(file('more.txt'), 'more beta\n')

    expect(await runScenario(request, 'coding-grep', testId)).toEqual({
      results: ['more.txt:1: more beta\nnotes.txt:2: beta'],
      text: 'beta is in two files.',
    })
    expect(await read('notes.txt')).toBe('alpha\nbeta\n')
  })

  test('bash runs the command in the workspace with AGENT=1', async ({
    request,
    testId,
  }) => {
    // The command is `node -e "..."`: it writes bash.txt and prints `done`.
    expect(await runScenario(request, 'coding-bash', testId)).toEqual({
      results: ['exit code: 0\ndone\n'],
      text: 'The command ran.',
    })
    expect(await read('bash.txt')).toBe('AGENT=1')
  })

  test('edit_file works in a sandbox with sandboxWorkspaceBackend', async ({
    request,
    testId,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    // The sandbox maps its /workspace to the test folder.
    expect(await runScenario(request, 'coding-sandbox', testId)).toEqual({
      results: ['Edited notes.txt (1 change).'],
      text: 'Edited notes.txt in the sandbox.',
    })
    expect(await read('notes.txt')).toBe('sandboxed\nbeta\n')
  })

  test('revert puts back the files of the turns and keeps the edit of the user', async ({
    request,
    testId,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')
    await writeFile(file('other.txt'), 'original\n')

    // Two turns edit notes.txt. Between them, the user edits other.txt.
    // Then the route reverts to the first prompt.
    expect(await runScenario(request, 'coding-revert', testId)).toEqual({
      results: ['Edited notes.txt (1 change).', 'Edited notes.txt (1 change).'],
      text: 'Edited notes.txt.Edited notes.txt again.',
    })
    expect(await read('notes.txt')).toBe('alpha\nbeta\n')
    expect(await read('other.txt')).toBe('mine\n')
  })

  test('write_file sends FileChanged with its patch, and snapshots() sends it for the file that bash wrote', async ({
    request,
    testId,
  }) => {
    await writeFile(file('a.txt'), 'one\n')

    // write_file changes a.txt and sends its event. Then bash writes b.txt.
    // bash sends no event, so snapshots() sends one at the end of the step.
    const chunks = await post(request, 'coding-diffs', testId)
    const changes = chunks.find(
      (chunk) => chunk.name === 'e2e.file-changes',
    )?.value
    expect(changes).toEqual([
      {
        path: file('a.txt'),
        change: 'updated',
        patch: expect.stringContaining('-one\n+two\n'),
        additions: 1,
        deletions: 1,
        toolCallId: expect.any(String),
      },
      {
        path: file('b.txt'),
        change: 'created',
        // Only `+hi`: on Windows, `echo` also writes a space and `\r`.
        patch: expect.stringContaining('+hi'),
        additions: 1,
        deletions: 0,
        toolCallId: expect.any(String),
      },
    ])
  })

  test('/undo sends FileChanged for each file that it puts back', async ({
    request,
    testId,
  }) => {
    await writeFile(file('a.txt'), 'one\n')

    // The turn writes a.txt and b.txt. Then the route runs /undo.
    const chunks = await post(request, 'coding-diffs', testId)
    const changes = chunks.find(
      (chunk) => chunk.name === 'e2e.undo-changes',
    )?.value
    // The events of a restore name no tool call.
    expect(changes).toEqual([
      {
        path: file('a.txt'),
        change: 'updated',
        patch: expect.stringContaining('-two\n+one\n'),
        additions: 1,
        deletions: 1,
      },
      {
        path: file('b.txt'),
        change: 'deleted',
        patch: expect.stringContaining('-hi'),
        additions: 0,
        deletions: 1,
      },
    ])
    expect(await read('a.txt')).toBe('one\n')
    await expect(read('b.txt')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('in acceptEdits mode, the write asks before it runs, with its formatter, and a reject keeps the file unwritten', async ({
    request,
    testId,
  }) => {
    // The config file makes prettier the formatter of a.ts.
    await writeFile(file('.prettierrc'), '{}')

    const chunks = await post(request, 'coding-format-ask', testId)

    // acceptEdits allows a write. Only its formatter asks, so this one
    // approval is for the write and prettier together, before the write runs.
    const approvals = chunks.flatMap((chunk) =>
      chunk.type === 'RUN_FINISHED' && chunk.outcome?.type === 'interrupt'
        ? (chunk.outcome.interrupts ?? []).map(({ reason, message }) => ({
            reason,
            message,
          }))
        : [],
    )
    expect(approvals).toEqual([
      {
        reason: 'approval',
        message:
          'Allow write_file {"path":"a.ts","content":"let a=1\\n"}? Answer once, always, or reject.',
      },
    ])
    // The formatter does not ask again in the middle of the run.
    expect(chunks.filter((chunk) => chunk.name === 'harness.question')).toEqual(
      [],
    )
    // The reject refuses the call, so nothing is written.
    expect(
      chunks
        .filter((chunk) => chunk.type === 'TOOL_CALL_RESULT')
        .map((chunk) => chunk.content),
    ).toEqual(['{"error":"The user denied this tool call."}'])
    await expect(read('a.ts')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
