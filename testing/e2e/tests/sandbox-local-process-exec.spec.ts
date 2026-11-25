import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { TEXT } from '../src/routes/api.sandbox-local-process-exec'

/**
 * `exec()` of the local-process sandbox decodes UTF-8 across output chunks.
 * The route runs a command that writes one byte at a time, so each
 * multi-byte character is split between `data` chunks.
 */
test.describe('local-process sandbox exec() output', () => {
  let root = ''

  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'e2e-local-process-exec-'))
  })

  test.afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('keeps multi-byte characters split across chunks', async ({
    request,
  }) => {
    const response = await request.post('/api/sandbox-local-process-exec', {
      data: { root },
    })
    const body = await response.text()
    expect(response.ok(), body).toBe(true)

    const result = JSON.parse(body)
    expect(result).toEqual({ stdout: TEXT, stderr: TEXT, exitCode: 0 })
  })

  test('rejects a root outside the temp folder', async ({ request }) => {
    const response = await request.post('/api/sandbox-local-process-exec', {
      data: { root: '/' },
    })
    expect(response.status()).toBe(400)
  })
})
