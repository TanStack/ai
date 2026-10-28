import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll } from 'vitest'
import { runTakeoverConformance } from '@tanstack/ai-sandbox/testkit'
import { localProcessSandbox } from '../src/index'

/**
 * Takeover against a REAL local-process sandbox: real `sh`, real journal file,
 * real agent process. The unit suites in `@tanstack/ai-sandbox` drive fakes, and
 * fakes have been wrong about this shell three times (see the module doc in
 * `src/testkit/takeover-conformance.ts`).
 */
const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-lp-takeover-conformance-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

runTakeoverConformance({
  name: 'local-process',
  createHandle: async () => {
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
})
