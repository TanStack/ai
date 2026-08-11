import { rm } from 'node:fs/promises'
import { runReaperConformance } from '@tanstack/ai-sandbox/testkit'
import { defineWorkspace, localSource } from '@tanstack/ai-sandbox'
import { sbxSandbox } from '../src/index'
import { makeSbxFixtureRepo, sbxGate, sbxTestId } from './sbx-available'

// A missing sbx CLI or login is not the provider being incapable of the sweeps.
// It renders as a NAMED `unsupported` skip carrying the reason.
const gate = await sbxGate('reaper conformance (sbx)')

runReaperConformance({
  name: 'sbx',
  createHandle: async () => {
    const repo = await makeSbxFixtureRepo()
    const provider = sbxSandbox({ workspaceDir: repo })
    const handle = await provider.create({
      id: sbxTestId(),
      workspace: defineWorkspace({ source: localSource(repo) }),
    })
    return {
      handle,
      dispose: async () => {
        await handle.destroy()
        await rm(repo, { recursive: true, force: true })
      },
    }
  },
  ...gate,
})
