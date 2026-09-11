/**
 * The framework's own path on boxd: `defineSandbox` + `defineWorkspace` +
 * `ensure()`. That is create, clone the repo through the exec-backed git, run
 * `setup` through the stdin-driven bootstrap shell (this provider has
 * `writableStdin: true`), snapshot after setup, resume by id, and, once the
 * machine is gone, reconstruct it from the snapshot without re-running setup.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { Boxd } from '@boxd-sh/sdk'
import {
  InMemorySandboxInstanceStore,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
import { boxdSandbox } from '../src/index'

const apiKey = process.env.BOXD_API_KEY
const org = process.env.BOXD_ORG
const keys: Array<string> = []

describe.skipIf(!apiKey)(
  'boxd through defineSandbox/ensure (gated on BOXD_API_KEY)',
  () => {
    afterAll(async () => {
      // Snapshots are org-level artifacts the framework never deletes.
      const boxd = new Boxd({ apiKey })
      const params = org ? { org } : {}
      for (const snap of await boxd.snapshots.list(params)) {
        if (keys.some((k) => snap.name.startsWith(`tanstack-ai-${k}`))) {
          await boxd.snapshots.delete(snap.name, params)
        }
      }
      for (const m of await boxd.machines.list(params)) {
        if (
          keys.some((k) => m.name === `tanstack-ai-${k}`) &&
          m.status !== 'destroyed'
        ) {
          await boxd.machines.delete(m.id)
        }
      }
      await boxd.close()
    })

    it('bootstraps a GitHub repo, snapshots after setup, resumes, and restores after the machine is gone', async () => {
      const store = new InMemorySandboxInstanceStore()
      const sandbox = defineSandbox({
        id: 'boxd-e2e',
        provider: boxdSandbox({ apiKey, ...(org ? { org } : {}) }),
        workspace: defineWorkspace({
          source: githubRepo({ repo: 'octocat/Hello-World', depth: 1 }),
          setup: ['echo setup-ran > .setup-marker'],
        }),
      })
      const ctx = { threadId: `e2e-${Date.now()}`, runId: 'run-1', store }
      keys.push(sandbox.key(ctx))

      const t0 = Date.now()
      const first = await sandbox.ensure(ctx)
      console.log(
        `[timing] ensure: create + clone + setup + after-setup snapshot: ${Date.now() - t0} ms`,
      )
      expect(first.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(await first.fs.read('/workspace/.setup-marker')).toBe(
        'setup-ran\n',
      )
      expect(await first.fs.exists('/workspace/README')).toBe(true)
      expect((await first.git.branch()).trim()).toBe('master')
      const record = await store.get(sandbox.key(ctx))
      expect(record?.providerSandboxId).toBe(first.id)
      expect(record?.latestSnapshotId).toMatch(/-after-setup$/)

      // Same thread, next run: resume by id, no bootstrap.
      const t1 = Date.now()
      const again = await sandbox.ensureExisting({ ...ctx, runId: 'run-2' })
      console.log(`[timing] ensureExisting (resume): ${Date.now() - t1} ms`)
      expect(again?.id).toBe(first.id)

      // The machine disappears out of band; ensure() reconstructs it from the
      // after-setup snapshot instead of cloning and running setup again.
      const boxd = new Boxd({ apiKey })
      await boxd.machines.delete(first.id)
      // The record flips to `destroyed` shortly after; resume() reads that.
      while ((await boxd.machines.get(first.id)).status !== 'destroyed') {
        await new Promise((r) => setTimeout(r, 250))
      }
      await boxd.close()
      const t2 = Date.now()
      const restored = await sandbox.ensure({ ...ctx, runId: 'run-3' })
      console.log(
        `[timing] ensure after the machine was deleted (restoreSnapshot): ${Date.now() - t2} ms`,
      )
      expect(restored.id).not.toBe(first.id)
      expect(await restored.fs.read('/workspace/.setup-marker')).toBe(
        'setup-ran\n',
      )
      expect((await store.get(sandbox.key(ctx)))?.providerSandboxId).toBe(
        restored.id,
      )

      await sandbox.destroy(ctx)
      expect(
        await sandbox.ensureExisting({ ...ctx, runId: 'run-4' }),
      ).toBeNull()
    }, 600_000)
  },
)
