import { rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { defineWorkspace, localSource } from '@tanstack/ai-sandbox'
import { sbxSandbox } from '../src/index'
import { makeSbxFixtureRepo, sbxGate, sbxTestId } from './sbx-available'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const gate = await sbxGate('sbx provider')

const KILL_PROBE_SLEEP = '987654321'
const KILL_PROBE_GREP = '98765[4]321'

describe('sbx provider (gated on sbx ls --json)', () => {
  if ('unsupported' in gate) {
    it.skip(`unsupported: ${gate.unsupported.reason}`, () => {})
    return
  }
  it('creates a shell sandbox from a local git fixture, execs, fs round-trips, destroys', async () => {
    const repo = await makeSbxFixtureRepo()
    const provider = sbxSandbox({
      workspaceDir: repo,
    })
    let handle: SandboxHandle | undefined
    try {
      handle = await provider.create({
        id: sbxTestId(),
        workspace: defineWorkspace({ source: localSource(repo) }),
      })
      const echo = await handle.process.exec('echo hello-sbx')
      expect(echo.stdout.trim()).toBe('hello-sbx')
      expect(echo.exitCode).toBe(0)

      const root = handle.workspaceRoot ?? '.'
      await handle.fs.write(`${root}/note.txt`, 'inside the vm')
      expect(await handle.fs.exists(`${root}/note.txt`)).toBe(true)
      expect(await handle.fs.read(`${root}/note.txt`)).toBe('inside the vm')

      const git = await handle.process.exec('test -d .git')
      expect(git.exitCode).toBe(0)
    } finally {
      await handle?.destroy()
      await rm(repo, { recursive: true, force: true })
    }
  }, 180_000)

  it('resume keeps files written before resume, and the next exec works', async () => {
    const repo = await makeSbxFixtureRepo()
    const id = sbxTestId()
    const provider = sbxSandbox({ workspaceDir: repo })
    let handle: SandboxHandle | undefined
    try {
      handle = await provider.create({
        id,
        workspace: defineWorkspace({ source: localSource(repo) }),
      })
      const root = handle.workspaceRoot ?? '.'
      await handle.fs.write(`${root}/note.txt`, 'keep after resume')
      // Do not destroy. Resume by id and check the file is still there.
      const resumed = await provider.resume({ id })
      expect(resumed).not.toBeNull()
      if (!resumed) throw new Error('expected resume handle')
      expect(await resumed.fs.read(`${root}/note.txt`)).toBe(
        'keep after resume',
      )
      const echo = await resumed.process.exec('echo resumed')
      expect(echo.stdout.trim()).toBe('resumed')
      await resumed.destroy()
      handle = undefined
    } finally {
      await handle?.destroy()
      await rm(repo, { recursive: true, force: true })
    }
  }, 180_000)

  it('measures whether kill() stops the in-VM process', async () => {
    const repo = await makeSbxFixtureRepo()
    const provider = sbxSandbox({ workspaceDir: repo })
    let handle: SandboxHandle | undefined
    try {
      handle = await provider.create({
        id: sbxTestId(),
        workspace: defineWorkspace({ source: localSource(repo) }),
      })
      const probeRows = async (): Promise<string> =>
        (
          await handle!.process.exec(
            `ps | grep ${KILL_PROBE_GREP} | grep -v grep || true`,
          )
        ).stdout.trim()

      const proc = await handle.process.spawn(
        `echo up; sleep ${KILL_PROBE_SLEEP}`,
      )
      for await (const chunk of proc.stdout) {
        if (chunk.includes('up')) break
      }
      expect(await probeRows()).toContain(KILL_PROBE_SLEEP)
      await proc.kill()
      let survivors = await probeRows()
      for (let i = 0; i < 20 && survivors !== ''; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        survivors = await probeRows()
      }
      // Live measurement: kill() does not clear the in-VM sleep. Do NOT flip
      // SBX_CAPS.killableProcesses — it stays false until a later change
      // proves kill actually stops the process.
      expect(handle.capabilities.killableProcesses).toBe(false)
      expect(survivors).not.toBe('')
    } finally {
      await handle?.destroy()
      await rm(repo, { recursive: true, force: true })
    }
  }, 180_000)
})
