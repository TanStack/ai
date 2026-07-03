/**
 * REAL-HANDLE integration test for the `sandbox.file` / `sandbox.file.diff`
 * stream events (as opposed to the fake-handle unit tests in
 * `packages/ai-sandbox/tests/with-sandbox-hooks.test.ts`).
 *
 * Lives in `ai-sandbox-local-process` (not `ai-sandbox`) so it can drive a
 * REAL `localProcessSandbox` handle using only public exports — `ai-sandbox`
 * already depends on nothing here, and `ai-sandbox-local-process` already
 * depends on `@tanstack/ai-sandbox`, so this avoids introducing a reverse
 * workspace devDependency (`ai-sandbox` -> `ai-sandbox-local-process`) just
 * for a test.
 *
 * The full browser E2E harness (`testing/e2e`) can't exercise sandboxes, so
 * this substitutes for it: it drives a genuine `localProcessSandbox` handle —
 * a real host tmp directory, a real `git` repo, real `fs.write`, and (on
 * non-Linux platforms, including this Windows dev box) a real native
 * `fs.watch` — through `withSandbox({ fileEvents: { diff: true } })`, and
 * asserts the emitted CUSTOM chunks end-to-end.
 *
 * Approach used: REAL handle (not the controllable-fake fallback). The only
 * wrinkle driving a real handle surfaced was a genuine bug in
 * `buildFileHookEvent`'s `diff()` accessor (in `ai-sandbox/src/file-diff.ts`)
 * — it passed the *virtual* sandbox path (e.g. `/workspace/notes.txt`)
 * straight to `git diff -- <path>` instead of relativizing it the way
 * `before()` already does. Since the real local-process repo root is a host
 * tmp dir (not literally `/workspace`), git resolves a leading `/` against
 * the filesystem root and fails with "fatal: Invalid path" — so `diff()`
 * silently fell back to `''` on every platform. Fixed in that file (see
 * `packages/ai-sandbox/tests/file-diff.test.ts` for the accompanying
 * unit-level regression coverage) so this integration test can actually
 * observe a real, non-empty diff.
 *
 * We reuse the exact runtime-sink shape production code builds in
 * `packages/ai/src/activities/chat/index.ts` (`createCustomEventChunk`) via
 * `provideSandboxRuntime`, the same seam `with-sandbox-hooks.test.ts` drives
 * directly (its production caller, the chat engine's `MiddlewareRunner`, is
 * an internal symbol of `@tanstack/ai` not exposed outside that package, so
 * it isn't reachable from a downstream package either — the `sandbox`-hook
 * fan-out it performs is already covered by
 * `packages/ai/tests/sandbox-runtime-emit.test.ts`).
 */
import { randomUUID } from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  provideSandboxRuntime,
  resolveDebugOption,
} from '@tanstack/ai/adapter-internals'
import { EventType } from '@tanstack/ai'
import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '../src/index'
import type {
  ChatMiddlewareContext,
  KnownCustomEvent,
  SandboxFileCustomEvent,
  SandboxFileDiffEvent,
} from '@tanstack/ai'

function makeCtx(): ChatMiddlewareContext {
  return {
    threadId: 't-diff-int',
    runId: 'r-diff-int',
    capabilities: { markProvided: () => undefined },
    getOptional: () => undefined,
  } as unknown as ChatMiddlewareContext
}

/** Poll `predicate` until it's true, or throw once `timeoutMs` elapses. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 8000,
  intervalMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/**
 * Retry `fn` on failure. Windows' recursive native `fs.watch` can hold the
 * directory's OS handle open for a brief moment after `.close()` returns, so
 * an immediate `rm -rf` of that same directory can fail with `EBUSY` even
 * though the watcher has already been stopped — retry instead of sleeping a
 * fixed amount up front.
 */
async function retryOnFailure(
  fn: () => Promise<void>,
  attempts = 20,
  delayMs = 100,
): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fn()
      return
    } catch (err) {
      if (i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

describe('sandbox.file + sandbox.file.diff — real localProcessSandbox integration', () => {
  const workDirs: Array<string> = []

  afterEach(async () => {
    while (workDirs.length > 0) {
      const dir = workDirs.pop()
      if (dir) {
        await retryOnFailure(() => fsp.rm(dir, { recursive: true, force: true }))
      }
    }
  })

  it(
    'emits sandbox.file and sandbox.file.diff CUSTOM chunks off a real git-backed handle',
    async () => {
      const workDir = path.join(
        os.tmpdir(),
        `tanstack-ai-sbx-diff-${randomUUID()}`,
      )
      await fsp.mkdir(workDir, { recursive: true })
      workDirs.push(workDir)

      // Fixed-`dir` config: every create/resume from this provider uses this
      // exact host directory, so the git repo we seed below is what
      // `withSandbox`'s setup actually captures `baseSha` against.
      const provider = localProcessSandbox({ dir: workDir, removeOnDestroy: true })
      const seedHandle = await provider.create({})

      const run = async (cmd: string): Promise<void> => {
        const res = await seedHandle.process.exec(cmd, { cwd: '/workspace' })
        if (res.exitCode !== 0) {
          throw new Error(`"${cmd}" failed (exit ${res.exitCode}): ${res.stderr}`)
        }
      }

      // Real git repo + baseline commit, so `git rev-parse HEAD` (captured by
      // withSandbox's setup) and `git diff <baseSha>` (the diff() accessor)
      // have real history to work against.
      await seedHandle.fs.write('/workspace/notes.txt', 'line one\n')
      await run('git init')
      await run('git config user.email "tanstack-ai-test@example.com"')
      await run('git config user.name "tanstack-ai-test"')
      await run('git add -A')
      await run('git commit -m baseline')

      const chunks: Array<KnownCustomEvent> = []
      const sandbox = defineSandbox({
        id: 's-diff-int',
        provider,
        fileEvents: { diff: true },
      })

      const ctx = makeCtx()
      // Mirrors the production sink built in
      // `packages/ai/src/activities/chat/index.ts` (`createCustomEventChunk`
      // for `sandbox.file` / `sandbox.file.diff`), minus the `model` field
      // (no adapter/model in this harness-only integration test).
      provideSandboxRuntime(ctx, {
        logger: resolveDebugOption(false),
        emit: (event) => {
          chunks.push({
            type: EventType.CUSTOM,
            name: 'sandbox.file',
            timestamp: event.timestamp,
            value: {
              type: event.type,
              path: event.path,
              timestamp: event.timestamp,
            },
          })
        },
        emitFileDiff: (value) => {
          chunks.push({
            type: EventType.CUSTOM,
            name: 'sandbox.file.diff',
            timestamp: Date.now(),
            value,
          })
        },
      })

      const mw = withSandbox(sandbox)
      await mw.setup!(ctx)

      try {
        // Mutate the tracked file so the real (native, on this non-Linux box)
        // fs.watch fires a 'change' event.
        await seedHandle.fs.write(
          '/workspace/notes.txt',
          'line one\nline two\n',
        )

        await waitFor(() => chunks.some((c) => c.name === 'sandbox.file.diff'))

        // Literal-`name` discriminated-union narrowing on the public
        // `KnownCustomEvent` type — no `as` cast anywhere below.
        const fileEvents: Array<SandboxFileCustomEvent> = []
        const diffEvents: Array<SandboxFileDiffEvent> = []
        for (const chunk of chunks) {
          if (chunk.name === 'sandbox.file') fileEvents.push(chunk)
          else if (chunk.name === 'sandbox.file.diff') diffEvents.push(chunk)
        }

        expect(fileEvents.length).toBeGreaterThan(0)
        const fileEvent = fileEvents[0]
        expect(fileEvent).toBeDefined()
        expect(['create', 'change']).toContain(fileEvent?.value.type)
        expect(fileEvent?.value.path).toBe('/workspace/notes.txt')
        expect(fileEvent?.value.timestamp).toBeGreaterThan(0)

        expect(diffEvents.length).toBeGreaterThan(0)
        const diffEvent = diffEvents[0]
        expect(diffEvent).toBeDefined()
        expect(diffEvent?.value.path).toBe('/workspace/notes.txt')
        expect(diffEvent?.value.diff).toContain('line two')
      } finally {
        // Stops the watcher (no lingering fs.watch/exec-poll timers).
        await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
        // `destroy()` (removeOnDestroy: true) removes `workDir` itself — see
        // `retryOnFailure` above for why this can't be a bare await on Windows.
        await retryOnFailure(() => seedHandle.destroy())
      }
    },
    15000,
  )
})
