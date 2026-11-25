import { describe, expect, it } from 'vitest'
import {
  InMemorySandboxCheckpointStore,
  SandboxCheckpointWriterConflictError,
} from '../src/checkpoint-store'
import {
  captureSandboxCheckpoint,
  restoreSandboxCheckpoint,
  sweepSandboxBlobs,
} from '../src/checkpoints'
import { makeFakeHandle } from './fakes'
import type { SandboxFs, SandboxHandle } from '../src/contracts'

const ROOT = '/workspace'

type FakeFile = { bytes: Uint8Array; mode: number }

function file(text: string, mode = 0o644): FakeFile {
  return { bytes: new TextEncoder().encode(text), mode }
}

// A sandbox whose files live in a Map. `exec` only knows the `chmod` that
// restore sends. `calls` records every fs and exec call.
function memoryHandle(initial: Record<string, FakeFile> = {}) {
  const files = new Map(
    Object.entries(initial).map(([path, value]) => [`${ROOT}/${path}`, value]),
  )
  const dirs = new Set([ROOT])
  const calls: Array<string> = []
  const isDir = (path: string) =>
    dirs.has(path) ||
    [...files.keys(), ...dirs].some((key) => key.startsWith(`${path}/`))
  const base = makeFakeHandle('memory', 'fake')
  const fs: SandboxFs = {
    ...base.fs,
    async readBytes(path) {
      calls.push(`readBytes ${path}`)
      const found = files.get(path)
      if (!found) throw new Error(`missing ${path}`)
      return found.bytes
    },
    async write(path, data) {
      calls.push(`write ${path}`)
      const bytes =
        typeof data === 'string' ? new TextEncoder().encode(data) : data
      files.set(path, { bytes: bytes.slice(), mode: 0o644 })
    },
    async mkdir(path) {
      calls.push(`mkdir ${path}`)
      dirs.add(path)
    },
    async remove(path) {
      calls.push(`remove ${path}`)
      const isGone = (key: string) => key === path || key.startsWith(`${path}/`)
      for (const key of [...files.keys()]) if (isGone(key)) files.delete(key)
      for (const key of [...dirs]) if (isGone(key)) dirs.delete(key)
    },
    async list(path) {
      calls.push(`list ${path}`)
      const names = new Set<string>()
      const keys = [...files.keys(), ...dirs]
      for (const key of keys)
        if (key.startsWith(`${path}/`))
          names.add(key.slice(path.length + 1).split('/')[0]!)
      return [...names].map((name) => ({
        name,
        path: `${path}/${name}`,
        type: isDir(`${path}/${name}`) ? ('dir' as const) : ('file' as const),
      }))
    },
    async lstat(path) {
      calls.push(`lstat ${path}`)
      const found = files.get(path)
      if (found)
        return {
          type: 'file',
          mode: 0o100000 | found.mode,
          size: found.bytes.byteLength,
        }
      return isDir(path) ? { type: 'dir', mode: 0o40755 } : undefined
    },
  }
  const exec: SandboxHandle['process']['exec'] = async (command, options) => {
    calls.push(`exec ${command}`)
    for (const part of command.split(' && ')) {
      const [name, mode, , ...paths] = part.split(' ')
      if (name !== 'chmod' || mode === undefined)
        return { stdout: '', stderr: `unknown ${part}`, exitCode: 1 }
      for (const path of paths)
        files.get(`${options?.cwd}/${path.replaceAll("'", '')}`)!.mode =
          parseInt(mode, 8)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }
  const handle: SandboxHandle = {
    ...base,
    fs,
    process: { ...base.process, exec },
  }
  const tree = () =>
    Object.fromEntries(
      [...files].map(([path, value]) => [
        path.slice(ROOT.length + 1),
        { text: new TextDecoder().decode(value.bytes), mode: value.mode },
      ]),
    )
  return { handle, files, calls, tree }
}

// Blob storage with upload times, like R2. `time` is the upload clock.
function blobStore() {
  const values = new Map<string, { bytes: Uint8Array; uploadedAt: number }>()
  const clock = { time: 0 }
  return {
    values,
    clock,
    async put(key: string, bytes: Uint8Array) {
      values.set(key, { bytes, uploadedAt: clock.time })
    },
    async get(key: string) {
      const value = values.get(key)
      return value
        ? { arrayBuffer: async () => value.bytes.slice().buffer }
        : null
    },
    async head(key: string) {
      return values.has(key) ? { key } : null
    },
    async list(prefix: string) {
      return [...values]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, uploadedAt: value.uploadedAt }))
    },
    async delete(key: string) {
      values.delete(key)
    },
  }
}

function setup(initial: Record<string, FakeFile>) {
  const sandbox = memoryHandle(initial)
  const checkpoints = new InMemorySandboxCheckpointStore()
  const blobs = blobStore()
  const capture = (extra: { label?: string; signal?: AbortSignal } = {}) =>
    captureSandboxCheckpoint({
      handle: sandbox.handle,
      checkpoints,
      blobs,
      threadId: 'thread-1',
      ...extra,
    })
  return { sandbox, checkpoints, blobs, capture }
}

const HELLO_KEY =
  'sandbox-files/sha256/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

describe('captureSandboxCheckpoint', () => {
  it('appends a checkpoint with the files at the head of the thread', async () => {
    const { checkpoints, capture } = setup({ 'a.txt': file('hello') })

    const checkpoint = await capture()

    expect(checkpoint).toMatchObject({
      threadId: 'thread-1',
      parentCheckpointId: null,
      reason: 'automatic',
      conversation: [],
      artifacts: [],
      files: [
        {
          path: 'a.txt',
          kind: 'file',
          blobKey: HELLO_KEY,
          size: 5,
          mode: 0o644,
        },
      ],
    })
    expect(checkpoint.id).toMatch(/^checkpoint-/)
    expect(await checkpoints.getHead('thread-1')).toBe(checkpoint.id)
  })

  it('links the second checkpoint to the first', async () => {
    const { capture } = setup({ 'a.txt': file('hello') })

    const first = await capture()
    const second = await capture()

    expect(second.parentCheckpointId).toBe(first.id)
  })

  it('marks a checkpoint with a label as named', async () => {
    const { capture } = setup({ 'a.txt': file('hello') })

    const checkpoint = await capture({ label: 'before-deploy' })

    expect(checkpoint).toMatchObject({
      reason: 'named',
      label: 'before-deploy',
    })
  })

  it('appends nothing and frees the writer when the signal aborts', async () => {
    const { sandbox, checkpoints, capture } = setup({ 'a.txt': file('hello') })
    const controller = new AbortController()
    const readBytes = sandbox.handle.fs.readBytes
    sandbox.handle.fs.readBytes = async (path) => {
      controller.abort()
      return readBytes(path)
    }

    await expect(capture({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })

    expect(await checkpoints.getHead('thread-1')).toBeNull()
    const lease = await checkpoints.acquireWriter('thread-1')
    await lease.release()
  })

  it('fails when another writer holds the thread', async () => {
    const { checkpoints, capture } = setup({ 'a.txt': file('hello') })
    await checkpoints.acquireWriter('thread-1')

    await expect(capture()).rejects.toBeInstanceOf(
      SandboxCheckpointWriterConflictError,
    )
    expect(await checkpoints.getHead('thread-1')).toBeNull()
  })
})

describe('restoreSandboxCheckpoint', () => {
  it('restores the head into a new sandbox with file modes', async () => {
    const { checkpoints, blobs, capture } = setup({
      'a.txt': file('hello'),
      'bin/run.sh': file('echo hi', 0o755),
    })
    const checkpoint = await capture()
    const target = memoryHandle()

    const restored = await restoreSandboxCheckpoint({
      handle: target.handle,
      checkpoints,
      blobs,
      threadId: 'thread-1',
    })

    expect(restored?.id).toBe(checkpoint.id)
    expect(target.tree()).toEqual({
      'a.txt': { text: 'hello', mode: 0o644 },
      'bin/run.sh': { text: 'echo hi', mode: 0o755 },
    })
  })

  it('restores an older checkpoint by id', async () => {
    const { sandbox, checkpoints, blobs, capture } = setup({
      'a.txt': file('one'),
    })
    const first = await capture()
    await sandbox.handle.fs.write(`${ROOT}/a.txt`, 'two')
    await capture()
    const target = memoryHandle()

    await restoreSandboxCheckpoint({
      handle: target.handle,
      checkpoints,
      blobs,
      threadId: 'thread-1',
      checkpointId: first.id,
    })

    expect(target.tree()).toEqual({ 'a.txt': { text: 'one', mode: 0o644 } })
  })

  it('returns null and touches nothing on a thread without checkpoints', async () => {
    const target = memoryHandle({ 'keep.txt': file('mine') })

    const restored = await restoreSandboxCheckpoint({
      handle: target.handle,
      checkpoints: new InMemorySandboxCheckpointStore(),
      blobs: blobStore(),
      threadId: 'thread-1',
    })

    expect(restored).toBeNull()
    expect(target.calls).toEqual([])
  })

  it('throws MISSING_CHECKPOINT for an unknown id or an id of another thread', async () => {
    const { checkpoints, blobs, capture } = setup({ 'a.txt': file('hello') })
    const checkpoint = await capture()
    const restore = (threadId: string, checkpointId: string) =>
      restoreSandboxCheckpoint({
        handle: memoryHandle().handle,
        checkpoints,
        blobs,
        threadId,
        checkpointId,
      })

    const missing = {
      name: 'SandboxSnapshotError',
      code: 'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT',
    }

    await expect(
      restore('thread-1', 'no-such-checkpoint'),
    ).rejects.toMatchObject(missing)
    await expect(restore('thread-2', checkpoint.id)).rejects.toMatchObject(
      missing,
    )
  })
})

describe('sweepSandboxBlobs', () => {
  it('deletes only old blobs that no checkpoint uses', async () => {
    const { blobs, checkpoints, capture } = setup({ 'a.txt': file('hello') })
    await capture()
    const bytes = new Uint8Array([1])
    await blobs.put('sandbox-files/sha256/old', bytes)
    await blobs.put('sandbox-artifacts/sha256/old', bytes)
    await blobs.put('other/old', bytes)
    blobs.clock.time = 9_500
    await blobs.put('sandbox-files/sha256/young', bytes)

    const deleted = await sweepSandboxBlobs({
      checkpoints,
      blobs,
      olderThanMs: 1_000,
      now: () => 10_000,
    })

    expect(deleted).toEqual([
      'sandbox-artifacts/sha256/old',
      'sandbox-files/sha256/old',
    ])
    expect([...blobs.values.keys()].sort()).toEqual([
      'other/old',
      HELLO_KEY,
      'sandbox-files/sha256/young',
    ])
  })

  it('rejects a grace time that is negative or not a number', async () => {
    const sweep = (olderThanMs: number) =>
      sweepSandboxBlobs({
        checkpoints: new InMemorySandboxCheckpointStore(),
        blobs: blobStore(),
        olderThanMs,
      })

    await expect(sweep(-1)).rejects.toBeInstanceOf(RangeError)
    await expect(sweep(Number.NaN)).rejects.toBeInstanceOf(RangeError)
  })
})
