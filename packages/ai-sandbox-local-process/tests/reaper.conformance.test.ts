import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll } from 'vitest'
import { runReaperConformance } from '@tanstack/ai-sandbox/testkit'
import { localProcessSandbox } from '../src/index'

/**
 * The journal sweep and the detached-run reaper against a REAL local-process
 * sandbox: real `sh`, real `ls`/`stat`/`rm`, real journal files, real agent
 * processes.
 *
 * NOTE ON AUTHORITY. On Windows this provider execs through git-bash, whose
 * `find`, `stat`, and `touch` are GNU-flavoured — so a green run here does NOT
 * establish the portability the age gate's self-witness design exists for. The
 * `@tanstack/ai-sandbox-docker` matrix (`alpine:3`, BusyBox 1.37) is the
 * authority on that; see `src/testkit/reaper-conformance.ts`.
 */
const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-lp-reaper-conformance-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

runReaperConformance({
  name: 'local-process',
  createHandle: async () => {
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
})
