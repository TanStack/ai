import { spawn } from 'node:child_process'

export interface SbxRunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface SbxSpawnOptions {
  onClose: (result: SbxRunResult) => void
  onError: (error: Error) => void
  onStdout?: (chunk: Buffer) => void
  onStderr?: (chunk: Buffer) => void
  signal?: AbortSignal
}

export type SbxSpawn = (
  binary: string,
  args: Array<string>,
  opts: SbxSpawnOptions,
) => { kill: () => void }

export interface SbxLsEntry {
  name: string
  status?: string
  workspace?: string
}

const INSTALL_HELP =
  'sbx is not on PATH. Install Docker Sandboxes (brew install docker-sandboxes, winget install Docker.Sandboxes, or apt), then retry.'

const LOGIN_HELP =
  'sbx is not logged in. Run `sbx login`, or in CI pipe a PAT to `sbx login --password-stdin`.'

export function defaultSpawn(
  binary: string,
  args: Array<string>,
  opts: SbxSpawnOptions,
): { kill: () => void } {
  const child = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const stdout: Array<Buffer> = []
  const stderr: Array<Buffer> = []
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout.push(chunk)
    opts.onStdout?.(chunk)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk)
    opts.onStderr?.(chunk)
  })
  const onAbort = (): void => {
    child.kill()
  }
  const detach = (): void => {
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
  child.on('error', (error) => {
    detach()
    opts.onError(error)
  })
  child.on('close', (code) => {
    detach()
    opts.onClose({
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
      exitCode: code ?? 1,
    })
  })
  if (opts.signal) {
    if (opts.signal.aborted) child.kill()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    kill: () => {
      detach()
      child.kill()
    },
  }
}

export function mapSbxError(error: unknown, binary: string): Error {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  ) {
    return new Error(INSTALL_HELP)
  }
  if (error instanceof Error) return error
  return new Error(`${binary} failed: ${String(error)}`)
}

function throwIfFailed(
  result: SbxRunResult,
  binary: string,
  args: Array<string>,
): SbxRunResult {
  if (result.exitCode === 0) return result
  const stderr = result.stderr.trim()
  const combined = `${stderr}\n${result.stdout}`.toLowerCase()
  if (isLoginError(combined)) {
    throw new Error(`${LOGIN_HELP}\n${stderr}`)
  }
  throw new Error(
    stderr === ''
      ? `${binary} ${args.join(' ')} exited ${result.exitCode}`
      : stderr,
  )
}

function isLoginError(combined: string): boolean {
  return (
    combined.includes('not logged in') ||
    combined.includes('not authenticated') ||
    combined.includes('unauthoriz') ||
    combined.includes('login required')
  )
}

export async function runSbx(
  args: Array<string>,
  options: {
    binary?: string
    spawn?: SbxSpawn
    signal?: AbortSignal
    /** When true, return the raw result even on a non-zero exit. */
    allowNonZero?: boolean
  } = {},
): Promise<SbxRunResult> {
  const binary = options.binary ?? 'sbx'
  const spawnFn = options.spawn ?? defaultSpawn
  const result = await new Promise<SbxRunResult>((resolve, reject) => {
    spawnFn(binary, args, {
      ...(options.signal ? { signal: options.signal } : {}),
      onClose: resolve,
      onError: (error) => reject(mapSbxError(error, binary)),
    })
  })
  if (options.allowNonZero) {
    // A command inside the VM can exit 1. Login and auth errors still fail loud.
    const stderr = result.stderr.trim()
    const combined = `${stderr}\n${result.stdout}`.toLowerCase()
    if (isLoginError(combined)) {
      throw new Error(`${LOGIN_HELP}\n${stderr}`)
    }
    return result
  }
  return throwIfFailed(result, binary, args)
}

export function runSbxStreaming(
  args: Array<string>,
  options: {
    binary?: string
    spawn?: SbxSpawn
    signal?: AbortSignal
    onStdout?: (chunk: Buffer) => void
    onStderr?: (chunk: Buffer) => void
  } = {},
): {
  wait: () => Promise<SbxRunResult>
  kill: () => void
} {
  const binary = options.binary ?? 'sbx'
  const spawnFn = options.spawn ?? defaultSpawn
  let childKill: (() => void) | undefined
  const wait = new Promise<SbxRunResult>((resolve, reject) => {
    const handle = spawnFn(binary, args, {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onStdout ? { onStdout: options.onStdout } : {}),
      ...(options.onStderr ? { onStderr: options.onStderr } : {}),
      onClose: resolve,
      onError: (error) => reject(mapSbxError(error, binary)),
    })
    childKill = handle.kill
  })
  return {
    wait: () => wait,
    kill: () => {
      childKill?.()
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function readEntry(value: unknown): SbxLsEntry | null {
  const rec = asRecord(value)
  if (!rec) return null
  const name =
    typeof rec.name === 'string'
      ? rec.name
      : typeof rec.Name === 'string'
        ? rec.Name
        : null
  if (name === null) return null
  const status =
    typeof rec.status === 'string'
      ? rec.status
      : typeof rec.State === 'string'
        ? rec.State
        : typeof rec.state === 'string'
          ? rec.state
          : undefined
  const workspace =
    typeof rec.workspace === 'string'
      ? rec.workspace
      : typeof rec.Workspace === 'string'
        ? rec.Workspace
        : undefined
  return {
    name,
    ...(status !== undefined ? { status } : {}),
    ...(workspace !== undefined ? { workspace } : {}),
  }
}

export function parseSbxLs(stdout: string): Array<SbxLsEntry> {
  const parsed: unknown = JSON.parse(stdout)
  const list = Array.isArray(parsed)
    ? parsed
    : (asRecord(parsed)?.sandboxes ??
      asRecord(parsed)?.Sandboxes ??
      asRecord(parsed)?.items)
  if (!Array.isArray(list)) {
    throw new Error(`sbx ls --json: unexpected shape: ${stdout.slice(0, 200)}`)
  }
  const entries: Array<SbxLsEntry> = []
  for (const item of list) {
    const entry = readEntry(item)
    if (entry) entries.push(entry)
  }
  return entries
}
