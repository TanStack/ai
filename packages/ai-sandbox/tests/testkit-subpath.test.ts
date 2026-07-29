import { describe, expect, it } from 'vitest'
import { makeFakeShellSpawn } from '@tanstack/ai-sandbox/testkit'

/**
 * Proves the `@tanstack/ai-sandbox/testkit` subpath actually resolves and
 * ships `makeFakeShellSpawn` — the thing that silently breaks when the
 * package.json `exports` map and the build entry list disagree (a subpath
 * that publint/test:build waves through but that consumers can't import).
 */
describe('@tanstack/ai-sandbox/testkit subpath', () => {
  it('exports a working makeFakeShellSpawn', async () => {
    const spawn = makeFakeShellSpawn()
    await spawn.stdin.write('pwd; echo hi\n')
    const first = await spawn.stdout[Symbol.asyncIterator]().next()
    expect(first).toEqual({ value: '/workspace\n', done: false })
    await spawn.stdin.end()
    expect(await spawn.wait()).toBe(0)
  })
})
