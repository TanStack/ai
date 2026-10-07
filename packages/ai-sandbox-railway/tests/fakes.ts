/**
 * Test doubles for the slice of the `railway` SDK the handle touches. No test
 * here talks to Railway.
 */
import { vi } from 'vitest'

export interface FakeExecResult {
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
}

/** A fake in-flight exec whose output and exit are driven by the test. */
export interface FakeExec {
  command: string
  options: Record<string, any>
  kill: ReturnType<typeof vi.fn>
  stdinWrite: ReturnType<typeof vi.fn>
  stdinEnd: ReturnType<typeof vi.fn>
  emitStdout: (text: string) => void
  emitStderr: (text: string) => void
  exit: (code: number | null, extra?: Partial<FakeExecResult>) => void
  fail: (error: unknown) => void
}

export function fakeExec(
  command: string,
  options: Record<string, any>,
  opts: { withStdin?: boolean } = {},
): { fake: FakeExec; handle: any } {
  let stdout = ''
  let stderr = ''
  let resolve!: (r: FakeExecResult) => void
  let reject!: (e: unknown) => void
  const result = new Promise<FakeExecResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  result.catch(() => undefined)
  const kill = vi.fn(async () => true)
  const stdinWrite = vi.fn(async () => {})
  const stdinEnd = vi.fn(async () => {})
  const handle: any = {
    sessionName: Promise.resolve('sess_1'),
    result: () => result,
    then: (a: any, b: any) => result.then(a, b),
    kill,
    detach: vi.fn(),
  }
  if (opts.withStdin) handle.stdin = { write: stdinWrite, end: stdinEnd }
  const fake: FakeExec = {
    command,
    options,
    kill,
    stdinWrite,
    stdinEnd,
    emitStdout: (text) => {
      stdout += text
      options.onStdout?.(text)
    },
    emitStderr: (text) => {
      stderr += text
      options.onStderr?.(text)
    },
    exit: (code, extra) =>
      resolve({
        exitCode: code,
        stdout,
        stderr,
        truncated: false,
        timedOut: false,
        ...extra,
      }),
    fail: (error) => reject(error),
  }
  return { fake, handle }
}

export interface FakeSandboxOptions {
  id?: string
  status?: string
  networkIsolation?: 'ISOLATED' | 'PRIVATE'
  domains?: Array<{ port: number; prefix: string; domain: string }>
  /** Decide what each exec does; default exits 0 immediately. */
  onExec?: (fake: FakeExec) => void
  withStdin?: boolean
}

export function fakeSandbox(opts: FakeSandboxOptions = {}) {
  const execs: Array<FakeExec> = []
  const sandbox: any = {
    id: opts.id ?? 'sbx_123',
    status: opts.status ?? 'RUNNING',
    networkIsolation: opts.networkIsolation ?? 'ISOLATED',
    domains: opts.domains ?? [],
    exec: vi.fn((command: string, options: Record<string, any> = {}) => {
      const { fake, handle } = fakeExec(command, options, {
        withStdin: opts.withStdin !== false,
      })
      execs.push(fake)
      if (opts.onExec) opts.onExec(fake)
      else fake.exit(0)
      return handle
    }),
    files: {
      read: vi.fn(async () => 'text'),
      write: vi.fn(async () => {}),
      list: vi.fn(async () => []),
      stat: vi.fn(),
      exists: vi.fn(async () => true),
      mkdir: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    },
    checkpoint: vi.fn(async (name: string) => ({
      id: 'ckpt_1',
      key: name,
      environmentId: 'env_1',
      createdAt: '2026-10-02T00:00:00Z',
    })),
    fork: vi.fn(),
    heartbeat: vi.fn(async () => sandbox),
    destroy: vi.fn(async () => {}),
    refresh: vi.fn(async function (this: any) {
      return this
    }),
  }
  // Typed loosely so tests can drive the vi.fn members and mutate status.
  return { sandbox, execs }
}
