import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { resolveHarnessCwd } from '../src/harness-cwd'
import type { SandboxHandle } from '../src/contracts'

function normalizePathSeparators(value: string): string {
  return value.replaceAll('\\', '/')
}

function fakeHandle(
  provider: string,
  id: string,
  workspaceRoot?: string,
): SandboxHandle {
  return { provider, id, workspaceRoot } as SandboxHandle
}

describe('resolveHarnessCwd', () => {
  it('maps virtual /workspace to the host root on local-process', () => {
    const root = '/tmp/tanstack-ai-sandboxes/abc'
    expect(resolveHarnessCwd(fakeHandle('local-process', root))).toBe(root)
    expect(
      resolveHarnessCwd(fakeHandle('local-process', root), '/workspace'),
    ).toBe(root)
  })

  it('maps nested virtual paths under /workspace on local-process', () => {
    const root = '/tmp/tanstack-ai-sandboxes/abc'
    expect(
      normalizePathSeparators(
        resolveHarnessCwd(
          fakeHandle('local-process', root),
          '/workspace/my-app',
        ),
      ),
    ).toBe(normalizePathSeparators(path.join(root, 'my-app')))
  })

  it('passes virtual paths through when workspaceRoot is /workspace', () => {
    expect(
      resolveHarnessCwd(
        fakeHandle('docker', 'container-1', '/workspace'),
        '/workspace',
      ),
    ).toBe('/workspace')
    expect(
      resolveHarnessCwd(
        fakeHandle('docker', 'container-1', '/workspace'),
        '/workspace/app',
      ),
    ).toBe('/workspace/app')
  })

  it('maps virtual /workspace to the provider workspaceRoot on Daytona', () => {
    const daytonaRoot = '/home/daytona/workspace'
    expect(
      resolveHarnessCwd(
        fakeHandle('daytona', 'sbx-1', daytonaRoot),
        '/workspace',
      ),
    ).toBe(daytonaRoot)
    expect(
      resolveHarnessCwd(
        fakeHandle('daytona', 'sbx-1', daytonaRoot),
        '/workspace/my-app',
      ),
    ).toBe('/home/daytona/workspace/my-app')
  })
})
