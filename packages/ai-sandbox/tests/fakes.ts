import type {
  ExecResult,
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
  SandboxRestoreInput,
  SnapshotRef,
} from '../src/contracts'

export const FULL_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  snapshots: true,
  networkPolicy: true,
  durableFilesystem: true,
  fork: true,
}

/** A no-op handle whose fs/process/git are stubs; tracks created/destroyed. */
export function makeFakeHandle(
  id: string,
  provider: string,
  caps: SandboxCapabilities = FULL_CAPS,
): SandboxHandle & { destroyed: boolean; files: Map<string, string> } {
  const files = new Map<string, string>()
  let snapshotCounter = 0
  const handle: SandboxHandle & { destroyed: boolean; files: Map<string, string> } = {
    id,
    provider,
    capabilities: caps,
    destroyed: false,
    files,
    fs: {
      read: (p) => Promise.resolve(files.get(p) ?? ''),
      readBytes: (p) => Promise.resolve(new TextEncoder().encode(files.get(p) ?? '')),
      write: (p, d) => {
        files.set(p, typeof d === 'string' ? d : new TextDecoder().decode(d))
        return Promise.resolve()
      },
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: (p) => {
        files.delete(p)
        return Promise.resolve()
      },
      rename: () => Promise.resolve(),
      exists: (p) => Promise.resolve(files.has(p)),
    },
    git: {
      clone: ({ dir }) => {
        files.set(`${dir ?? '/workspace'}/.git`, 'cloned')
        return Promise.resolve()
      },
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: (): Promise<ExecResult> =>
        Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
      spawn: () => Promise.reject(new Error('not used in this fake')),
    },
    ports: { connect: (port) => Promise.resolve({ url: `http://localhost:${port}` }) },
    env: { set: () => Promise.resolve() },
    snapshot: caps.snapshots
      ? (label) =>
          Promise.resolve<SnapshotRef>({ id: `snap-${id}-${++snapshotCounter}`, label })
      : undefined,
    destroy: () => {
      handle.destroyed = true
      return Promise.resolve()
    },
  }
  return handle
}

export interface FakeProviderOptions {
  name?: string
  caps?: SandboxCapabilities
  /** Make resume() return null (simulate a sandbox that's gone). */
  resumeReturnsNull?: boolean
}

export interface FakeProvider extends SandboxProvider {
  readonly calls: {
    create: number
    resume: number
    restoreSnapshot: number
    destroy: number
  }
  readonly created: Array<SandboxHandle>
}

export function makeFakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const name = options.name ?? 'fake'
  const caps = options.caps ?? FULL_CAPS
  const calls = { create: 0, resume: 0, restoreSnapshot: 0, destroy: 0 }
  const created: Array<SandboxHandle> = []
  let counter = 0

  const provider: FakeProvider = {
    name,
    calls,
    created,
    capabilities: () => caps,
    create: (_input: SandboxCreateInput) => {
      calls.create++
      const handle = makeFakeHandle(`${name}-${++counter}`, name, caps)
      created.push(handle)
      return Promise.resolve(handle)
    },
    resume: (_input: SandboxResumeInput) => {
      calls.resume++
      if (options.resumeReturnsNull) return Promise.resolve(null)
      const handle = makeFakeHandle(_input.id, name, caps)
      return Promise.resolve(handle)
    },
    restoreSnapshot: caps.snapshots
      ? (_input: SandboxRestoreInput) => {
          calls.restoreSnapshot++
          const handle = makeFakeHandle(`${name}-restored-${++counter}`, name, caps)
          created.push(handle)
          return Promise.resolve(handle)
        }
      : undefined,
    destroy: (_input: SandboxDestroyInput) => {
      calls.destroy++
      return Promise.resolve()
    },
  }
  return provider
}
