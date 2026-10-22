import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * The workspace of `workspaceTools()` for many threads and many hosts. Each
 * scenario of `/api/coding-workspace` runs in a temp folder that the test
 * makes, with a scripted model, and answers with JSON. See the route for
 * the scenarios.
 */

/** The workspace of the running test. */
let root = ''
const file = (path: string) => join(root, path)

/** The message of a tool result that is an error, `{ "error": "..." }`. */
const errorOf = (result: string | undefined): unknown =>
  JSON.parse(result ?? '{}').error

/** Run `scenario` in `root`. Gives the JSON of the route. */
async function run(request: APIRequestContext, scenario: string) {
  const response = await request.post('/api/coding-workspace', {
    data: { scenario, root },
  })
  const body = await response.text()
  expect(response.ok(), body).toBe(true)
  const json: Record<string, unknown> = JSON.parse(body)
  expect(json.error, body).toBeUndefined()
  return json
}

test.describe('Coding tools workspace', () => {
  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'e2e-coding-workspace-'))
  })

  test.afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('a command does not see an env var of the server', async ({
    request,
  }) => {
    const result = await run(request, 'env')

    // The server has the var. The command gets only the allowlist.
    expect(result.serverHasSecret).toBe(true)
    expect(result.results).toEqual(['exit code: 0\nsecret=unset'])
  })

  test('a thread cannot read the folder of another thread', async ({
    request,
  }) => {
    await mkdir(file('alpha'))
    await mkdir(file('beta'))
    await writeFile(file('alpha/secret.txt'), 'alpha only\n')

    const result = await run(request, 'other-root')

    expect(result.alpha).toMatchObject({ results: ['1\talpha only'] })
    const beta = result.beta as { results: Array<string> }
    expect(beta.results.map(errorOf)).toEqual([
      `Path "${file('alpha/secret.txt')}" is outside the workspace.`,
      'Path "../alpha/secret.txt" is outside the workspace.',
    ])
  })

  test('a sandbox thread moves to a second host with reattach, not bind', async ({
    request,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    const result = await run(request, 'sandbox-move')

    expect(result.first).toMatchObject({
      results: ['1\talpha\n2\tbeta'],
      bindCalls: 1,
    })
    expect(result.second).toMatchObject({
      results: ['1\talpha\n2\tbeta'],
      bindCalls: 0,
      reattached: [
        {
          kind: 'sandbox',
          provider: 'local-process',
          sandboxId: root,
          root: '/workspace',
        },
      ],
      stranded: [],
    })
  })

  test('a sandbox thread on a host with no reattach is stranded', async ({
    request,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    const result = await run(request, 'stranded')

    const second = result.second as {
      results: Array<string>
      bindCalls: number
      stranded: Array<unknown>
    }
    expect(second.bindCalls).toBe(0)
    expect(second.results.map(errorOf)).toEqual([
      `The workspace of this thread, /workspace in the local-process sandbox ${root}, is gone, so the tools cannot work on it.`,
    ])
    // The event comes each time the tools try the workspace: before the
    // turn, and at the tool call.
    expect(second.stranded.length).toBeGreaterThan(0)
    for (const binding of second.stranded) {
      expect(binding).toEqual({
        kind: 'sandbox',
        provider: 'local-process',
        sandboxId: root,
        root: '/workspace',
      })
    }
  })

  test('a folder thread is pinned to its ownership.hostId, also after a restart', async ({
    request,
  }) => {
    await writeFile(file('notes.txt'), 'alpha\nbeta\n')

    const result = await run(request, 'pin')

    expect(result.bindings).toEqual([{ kind: 'host', hostId: 'pod-a', root }])
    // pod-b offers the input, and its model never runs.
    expect(result.offers).toBe(1)
    expect(result.podBCalls).toBe(0)
    expect(result.podBCallsAfter).toBe(0)
    expect(result.podBSendEnded).toBe(true)
    // pod-a after a restart runs it: a tool call and an answer.
    expect(result.restartedCalls).toBe(2)
    expect(result.answers).toEqual([
      'Read notes.txt on pod-a.',
      'Read notes.txt on pod-a again.',
    ])
  })
})
