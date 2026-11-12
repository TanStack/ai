/**
 * A fake slice of the Render SDK's `SandboxesClient`. `exec` runs the command
 * in a local `bash` as its own process-group leader, as Render's exec shell is
 * (measured), so the handle's real wrapper and group kill are exercised. An
 * aborted stream only detaches, as on Render: the process keeps running.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:os'
import { dirname } from 'node:path'
import { vi } from 'vitest'
import { ClientError } from '@renderinc/sdk'
import type { SandboxExecEvent, SandboxesClient } from '@renderinc/sdk'

async function* localExec(
  command: string,
  signal?: AbortSignal,
  shell = 'bash',
): AsyncGenerator<SandboxExecEvent> {
  const child = spawn(shell, ['-c', command], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const queue: Array<SandboxExecEvent> = []
  let wake = (): void => {}
  const push = (event: SandboxExecEvent): void => {
    queue.push(event)
    wake()
  }
  child.stdout.on('data', (d) =>
    push({ type: 'output', stream: 'stdout', data: String(d) }),
  )
  child.stderr.on('data', (d) =>
    push({ type: 'output', stream: 'stderr', data: String(d) }),
  )
  child.on('close', (code, sig) =>
    push({
      type: 'exit',
      exit_code: code ?? 128 + (sig ? constants.signals[sig] : 0),
    }),
  )
  for (;;) {
    if (signal?.aborted) throw new Error('AbortError')
    const event = queue.shift()
    if (event === undefined) {
      await new Promise<void>((resolve) => {
        wake = resolve
        signal?.addEventListener('abort', () => resolve(), { once: true })
      })
      continue
    }
    yield event
    if (event.type === 'exit') return
  }
}

export function fakeClient(
  files = new Map<string, Uint8Array>(),
  shell = 'bash',
): {
  /** The fake's `vi.fn` mocks, for driving and asserting. */
  client: Record<string, any>
  sdk: SandboxesClient
  files: Map<string, Uint8Array>
} {
  const client = {
    exec: vi.fn(
      (_id: string, command: string, _owner?: string, signal?: AbortSignal) =>
        Promise.resolve(localExec(command, signal, shell)),
    ),
    // Uploads land on the local disk too, so the local bash can source env files.
    upload: vi.fn(
      async (_id: string, path: string, data: string | Uint8Array) => {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, data, { mode: 0o600 })
      },
    ),
    download: vi.fn(async (_id: string, path: string) => {
      const data =
        files.get(path) ?? (await readFile(path).catch(() => undefined))
      if (data === undefined) throw new ClientError('not found', 404)
      return Promise.resolve({
        data: Buffer.from(data),
        size: data.byteLength,
        contentType: path.endsWith('/')
          ? 'application/x-tar'
          : 'application/octet-stream',
      })
    }),
    terminate: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    create: vi.fn(),
    waitUntilRunning: vi.fn(() => Promise.resolve()),
    snapshots: {
      create: vi.fn(() => Promise.resolve({ id: 'snp-1' })),
    },
  }
  return { client, sdk: client as unknown as SandboxesClient, files }
}
