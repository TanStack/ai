import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { resolveHarnessCwd } from '../src/harness-cwd'
import type { SandboxHandle } from '../src/contracts'

function fakeHandle(provider: string, id: string): SandboxHandle {
  return { provider, id } as SandboxHandle
}

describe('resolveHarnessCwd', () => {
  it('maps virtual /workspace to the host root on local-process', () => {
    const root = '/tmp/tanstack-ai-sandboxes/abc'
    expect(resolveHarnessCwd(fakeHandle('local-process', root))).toBe(root)
    expect(resolveHarnessCwd(fakeHandle('local-process', root), '/workspace')).toBe(
      root,
    )
  })

  it('maps nested virtual paths under /workspace on local-process', () => {
    const root = '/tmp/tanstack-ai-sandboxes/abc'
    expect(
      resolveHarnessCwd(fakeHandle('local-process', root), '/workspace/my-app'),
    ).toBe(path.join(root, 'my-app'))
  })

  it('passes virtual paths through for container providers', () => {
    expect(
      resolveHarnessCwd(fakeHandle('docker', 'container-1'), '/workspace'),
    ).toBe('/workspace')
    expect(
      resolveHarnessCwd(fakeHandle('docker', 'container-1'), '/workspace/app'),
    ).toBe('/workspace/app')
  })
})