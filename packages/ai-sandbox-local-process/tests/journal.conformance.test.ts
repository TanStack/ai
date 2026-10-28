import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll } from 'vitest'
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { localProcessSandbox } from '../src/index'

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-lp-journal-conformance-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

runJournalConformance({
  name: 'local-process',
  createHandle: async () => {
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
})
