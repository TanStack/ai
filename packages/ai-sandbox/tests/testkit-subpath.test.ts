import { describe, expect, it } from 'vitest'
import {
  makeFakeShellSpawn,
  runJournalConformance,
  runTakeoverConformance,
} from '@tanstack/ai-sandbox/testkit'

/**
 * Proves the `@tanstack/ai-sandbox/testkit` subpath actually resolves and
 * ships `makeFakeShellSpawn` — the thing that silently breaks when the
 * package.json `exports` map and the build entry list disagree (a subpath
 * that publint/test:build waves through but that consumers can't import).
 */
describe('@tanstack/ai-sandbox/testkit subpath', () => {
  it('ships both provider conformance suites', () => {
    // The provider packages (and third-party providers outside this repo) reach
    // these ONLY through the built subpath, so an export that exists in `src`
    // but never lands in `dist` is invisible until a consumer breaks.
    expect(typeof runJournalConformance).toBe('function')
    expect(typeof runTakeoverConformance).toBe('function')
  })

  it('exports a working makeFakeShellSpawn', async () => {
    const spawn = makeFakeShellSpawn()
    await spawn.stdin.write('pwd; echo hi\n')
    const first = await spawn.stdout[Symbol.asyncIterator]().next()
    expect(first).toEqual({ value: '/workspace\n', done: false })
    await spawn.stdin.end()
    expect(await spawn.wait()).toBe(0)
  })
})
