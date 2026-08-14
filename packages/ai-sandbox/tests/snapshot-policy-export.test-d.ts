import { expectTypeOf } from 'vitest'
import type {
  SandboxCheckpointStoreOptions,
  SandboxSnapshotPolicy,
} from '../src'

const checkpointStoreOptions: SandboxCheckpointStoreOptions = {
  leaseDurationMs: 120_000,
}

expectTypeOf(
  checkpointStoreOptions,
).toMatchTypeOf<SandboxCheckpointStoreOptions>()

const policy: SandboxSnapshotPolicy = {
  include: (path, kind) => path !== 'tmp' && kind === 'file',
  exclude: (path) => path.startsWith('.git'),
  redact: ({ path, bytes, resolvedSecrets }) => {
    expectTypeOf(path).toBeString()
    expectTypeOf(bytes).toEqualTypeOf<Uint8Array>()
    expectTypeOf(resolvedSecrets).toEqualTypeOf<
      Readonly<Record<string, string>>
    >()
    return bytes
  },
}

expectTypeOf(policy).toMatchTypeOf<SandboxSnapshotPolicy>()
