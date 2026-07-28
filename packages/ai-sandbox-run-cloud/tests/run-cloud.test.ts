import { describe, expect, it } from 'vitest'
import { runCloudSandbox } from '../src'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const apiKey = process.env.RUN_CLOUD_API_KEY

describe.skipIf(!apiKey)(
  'Run Cloud provider (gated on RUN_CLOUD_API_KEY)',
  () => {
    it('creates a microVM, runs exec, round-trips files, snapshots, and destroys', async () => {
      const provider = runCloudSandbox({ apiKey, timeoutSeconds: 900 })
      let sandbox: SandboxHandle | undefined
      try {
        sandbox = await provider.create({})

        const echo = await sandbox.process.exec('echo hello-run-cloud')
        expect(echo.stdout.trim()).toBe('hello-run-cloud')
        expect(echo.exitCode).toBe(0)

        await sandbox.fs.write('/workspace/note.txt', 'inside the microVM')
        expect(await sandbox.fs.read('/workspace/note.txt')).toBe(
          'inside the microVM',
        )
        expect((await sandbox.snapshot?.('tanstack-ai-test'))?.id).toBeTruthy()
      } finally {
        await sandbox?.destroy()
      }
    }, 180_000)
  },
)
