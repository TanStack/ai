import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  RuntaApiError,
  RuntaClient,
  runtimeIngressUrl,
  shellQuote,
} from '../src/client'
import { FakeRunta } from './support/fake-runta'

let root: string
let fake: FakeRunta
let client: RuntaClient

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'fake-runta-')))
  fake = new FakeRunta({ root })
  client = new RuntaClient({
    apiKey: fake.apiKey,
    endpoint: fake.endpoint,
    fetch: fake.fetch,
    WebSocket: fake.WebSocket,
  })
})

afterEach(async () => {
  for (const child of fake.processes) child.kill('SIGKILL')
  await rm(root, { recursive: true, force: true })
})

async function text(source: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  let out = ''
  for await (const chunk of source)
    out += decoder.decode(chunk, { stream: true })
  return out + decoder.decode()
}

describe('runtimes', () => {
  it('creates a runtime by name, then attaches to it', async () => {
    const first = await client.getOrCreateRuntime('box', {
      image: 'clean',
      vcpus: 2,
      memoryMib: 2048,
      env: { A: '1' },
      idlePolicy: { mode: 'suspend_and_wakeup', suspendAfterSecs: 600 },
    })
    expect(first.created).toBe(true)
    expect(first.runtime.name).toBe('box')
    expect(fake.runtime('box')?.create_body).toEqual({
      name: 'box',
      image: { id: 'clean' },
      resources: { requests: { vcpus: 2, memory_mib: 2048 } },
      environment_variables: { A: '1' },
      idle_policy: { mode: 'suspend_and_wakeup', suspend_after_secs: 600 },
    })

    const second = await client.getOrCreateRuntime('box')
    expect(second.created).toBe(false)
    expect(second.runtime.id).toBe(first.runtime.id)
    expect(fake.runtimes.size).toBe(1)
  })

  it('reads the winner back when a concurrent create wins the race', async () => {
    const racing = new RuntaClient({
      apiKey: fake.apiKey,
      endpoint: fake.endpoint,
      WebSocket: fake.WebSocket,
      fetch: async (input, init) => {
        // Another caller creates the runtime between this caller's GET and POST.
        if (init?.method === 'POST' && !fake.runtime('box')) {
          await client.createRuntime({ name: 'box' })
        }
        return fake.fetch(input, init)
      },
    })
    const result = await racing.getOrCreateRuntime('box')
    expect(result.created).toBe(false)
    expect(fake.runtimes.size).toBe(1)
  })

  it('returns null from findRuntime for a missing runtime', async () => {
    expect(await client.findRuntime('nope')).toBeNull()
    await expect(client.getRuntime('nope')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
  })

  it('resumes a suspended runtime and starts a shut-down one', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    fake.setStatus('box', 'suspended')
    expect((await client.ensureRunning(runtime.id)).status).toBe('running')
    fake.setStatus('box', 'shutdown')
    expect((await client.ensureRunning('box')).status).toBe('running')
    fake.setStatus('box', 'crashed')
    await expect(client.ensureRunning('box')).rejects.toMatchObject({
      code: 'failed_precondition',
    })
  })

  it('waits for a runtime that is still being created', async () => {
    fake.statusAfterCreate = 'creating'
    const pending = client.createRuntime({ name: 'slow' })
    setTimeout(() => fake.setStatus('slow', 'running'), 30)
    const runtime = await pending
    expect(runtime.status).toBe('running')
  })

  it('waits for a lifecycle change to land', async () => {
    const slow = new FakeRunta({ root, transitionDelayMs: 40 })
    const slowClient = new RuntaClient({
      apiKey: slow.apiKey,
      endpoint: slow.endpoint,
      fetch: slow.fetch,
    })
    const runtime = await slowClient.createRuntime({ name: 'box' })
    expect((await slowClient.lifecycle(runtime.id, 'pause')).status).toBe(
      'paused',
    )
    expect((await slowClient.lifecycle(runtime.id, 'resume')).status).toBe(
      'running',
    )
  })

  it('resumes a runtime whose pause has not landed yet', async () => {
    const slow = new FakeRunta({ root, transitionDelayMs: 40 })
    const slowClient = new RuntaClient({
      apiKey: slow.apiKey,
      endpoint: slow.endpoint,
      fetch: slow.fetch,
    })
    const runtime = await slowClient.createRuntime({ name: 'box' })
    const pausing = await slowClient.lifecycle(runtime.id, 'pause', {
      wait: false,
    })
    expect(pausing).toMatchObject({
      status: 'running',
      desiredStatus: 'paused',
    })
    const ready = await slowClient.ensureRunning(runtime.id)
    expect(ready).toMatchObject({ status: 'running', desiredStatus: 'running' })
    expect(
      slow.calls.filter((call) => call.path.endsWith('/resume')),
    ).toHaveLength(1)
  })

  it('times out when a runtime never runs', async () => {
    fake.statusAfterCreate = 'creating'
    await expect(
      client.createRuntime({ name: 'stuck', readyTimeoutMs: 20 }),
    ).rejects.toMatchObject({
      code: 'deadline_exceeded',
    })
  })

  it('retries a mutation whose revision went stale', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    fake.failNextMutationWithConflict = true
    const patched = await client.patchRuntime(runtime.id, {
      egressPolicy: { mode: 'allowlist', allowedHosts: ['example.com'] },
    })
    expect(patched.revision).toBeGreaterThan(runtime.revision)
    expect(fake.runtime('box')?.egress_policy).toEqual({
      mode: 'allowlist',
      allowed_hosts: ['example.com'],
    })
  })

  it('deletes a runtime, and treats a missing one as deleted', async () => {
    await client.getOrCreateRuntime('box')
    await client.deleteRuntime('box')
    expect(fake.runtimes.size).toBe(0)
    await client.deleteRuntime('box')
  })

  it('reuses the runtime for a repeated idempotency key', async () => {
    const first = await client.createRuntime({
      name: 'box',
      idempotencyKey: 'k1',
    })
    const second = await client.createRuntime({
      name: 'box',
      idempotencyKey: 'k1',
    })
    expect(second.id).toBe(first.id)
  })

  it('rejects a wrong API key', async () => {
    const wrong = new RuntaClient({
      apiKey: 'rt_wrong',
      endpoint: fake.endpoint,
      fetch: fake.fetch,
    })
    await expect(wrong.getRuntime('box')).rejects.toBeInstanceOf(RuntaApiError)
    await expect(wrong.getRuntime('box')).rejects.toMatchObject({ status: 401 })
  })
})

describe('ports', () => {
  it('publishes a port once and derives its URL', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const url = await client.publishPort(runtime.id, 3000)
    expect(url).toBe(`https://3000-${runtime.id}.runta.test`)
    expect(fake.runtime('box')?.ingress_specs).toEqual([
      { protocol: 'https', runtime_port: 3000 },
    ])

    const patches = () =>
      fake.calls.filter((call) => call.method === 'PATCH').length
    const before = patches()
    expect(await client.publishPort(runtime.id, 3000)).toBe(url)
    expect(patches()).toBe(before)

    await client.publishPort(runtime.id, 8080, { protocol: 'http' })
    expect(fake.runtime('box')?.ingress_specs).toHaveLength(2)
  })

  it('refuses a 17th port', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    for (let port = 3000; port < 3016; port += 1)
      await client.publishPort(runtime.id, port)
    await expect(client.publishPort(runtime.id, 4000)).rejects.toMatchObject({
      code: 'failed_precondition',
    })
  })

  it('derives ingress URLs the way the Runta CLI does', () => {
    expect(runtimeIngressUrl('https://api.runta.com', 'rid', 3000)).toBe(
      'https://3000-rid.runta.dev',
    )
    expect(runtimeIngressUrl('https://api.runta.me', 'rid', 3000)).toBe(
      'https://3000-rid.runta.sh',
    )
    expect(runtimeIngressUrl('https://api.example.com', 'rid', 3000)).toBe(
      'https://3000-rid.example.com',
    )
    expect(runtimeIngressUrl('https://api.runta.me', 'rid', 1, 'foxden')).toBe(
      'https://foxden.runta.sh',
    )
    expect(
      runtimeIngressUrl('http://api.localhost:8080', 'rid', 3000),
    ).toBeUndefined()
    expect(
      runtimeIngressUrl('https://runta.example.com', 'rid', 3000),
    ).toBeUndefined()
  })
})

describe('files', () => {
  it('round-trips a small file through the file endpoints', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const path = join(root, 'dir', 'hello.txt')
    await client.writeFile(runtime.id, path, 'héllo')
    expect(
      new TextDecoder().decode(await client.readFile(runtime.id, path)),
    ).toBe('héllo')
    await expect(
      client.readFile(runtime.id, join(root, 'missing')),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('streams a file above the endpoint limits through exec, both ways', async () => {
    fake = new FakeRunta({ root, maxFilePutBytes: 1024 })
    const small = new RuntaClient({
      apiKey: fake.apiKey,
      endpoint: fake.endpoint,
      fetch: fake.fetch,
      WebSocket: fake.WebSocket,
      maxFilePutBytes: 1024,
    })
    const { runtime } = await small.getOrCreateRuntime('box')
    const bytes = new Uint8Array(300_000)
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = index % 251
    const path = join(root, 'big file.bin')
    await small.writeFile(runtime.id, path, bytes)
    expect(fake.calls.some((call) => call.method === 'PUT')).toBe(false)
    expect(new Uint8Array(await readFile(path))).toEqual(bytes)
    expect(await small.readFile(runtime.id, path)).toEqual(bytes)
    expect(fake.execStarts.at(-1)).toMatchObject({
      command: 'cat',
      args: ['--', path],
    })
  })

  it('keeps the endpoint error when a large read is not a readable file', async () => {
    fake = new FakeRunta({ root, maxFilePutBytes: 4 })
    const small = new RuntaClient({
      apiKey: fake.apiKey,
      endpoint: fake.endpoint,
      fetch: fake.fetch,
      WebSocket: fake.WebSocket,
    })
    const { runtime } = await small.getOrCreateRuntime('box')
    await expect(
      small.readFile(runtime.id, join(root, 'missing')),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('exec', () => {
  it('returns stdout, stderr and the exit code', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const result = await client.exec(runtime.id, {
      argv: ['sh', '-c', 'echo out; echo err >&2; exit 3'],
    })
    expect(result).toMatchObject({
      exitCode: 3,
      stdout: 'out\n',
      stderr: 'err\n',
      timedOut: false,
    })
  })

  it('passes env, cwd and stdin', async () => {
    const { runtime } = await client.getOrCreateRuntime('box', {
      env: { BASE: 'runtime' },
    })
    const result = await client.exec(runtime.id, {
      argv: ['sh', '-c', 'echo "$BASE $EXTRA"; pwd; cat'],
      env: { EXTRA: 'call' },
      cwd: root,
      stdin: 'from stdin',
    })
    expect(result.stdout).toBe(`runtime call\n${root}\nfrom stdin`)
    expect(result.exitCode).toBe(0)
  })

  it('runs argv without a shell', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const result = await client.exec(runtime.id, {
      argv: ['echo', '$HOME; rm -rf x', "it's"],
    })
    expect(result.stdout).toBe("$HOME; rm -rf x it's\n")
    expect(fake.execStarts.at(-1)).toMatchObject({
      command: 'echo',
      args: ['$HOME; rm -rf x', "it's"],
    })
  })

  it('reports exit code 124 on a timeout', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const started = Date.now()
    const result = await client.exec(runtime.id, {
      argv: ['sleep', '30'],
      timeoutMs: 100,
    })
    expect(result).toMatchObject({ exitCode: 124, timedOut: true })
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('caps buffered output and flags the truncation', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const result = await client.exec(runtime.id, {
      argv: ['sh', '-c', 'head -c 5000 /dev/zero | tr "\\0" a'],
      maxOutputBytes: 1000,
    })
    expect(result.stdout).toHaveLength(1000)
    expect(result.stdoutTruncated).toBe(true)
    expect(result.stderrTruncated).toBe(false)
  })

  it('rejects when the runtime is not running', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    fake.setStatus('box', 'suspended')
    await expect(
      client.exec(runtime.id, { argv: ['true'] }),
    ).rejects.toMatchObject({
      code: 'unavailable',
    })
  })

  it('rejects when the command cannot start', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    await expect(
      client.exec(runtime.id, { argv: ['definitely-not-a-command-xyz'] }),
    ).rejects.toBeInstanceOf(RuntaApiError)
  })
})

describe('spawn', () => {
  it('streams output while stdin stays open', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const stream = client.spawn(runtime.id, { argv: ['cat'] })
    const iterator = stream.stdout[Symbol.asyncIterator]()
    await stream.stdin.write('one\n')
    expect(new TextDecoder().decode((await iterator.next()).value)).toBe(
      'one\n',
    )
    await stream.stdin.write('two\n')
    expect(new TextDecoder().decode((await iterator.next()).value)).toBe(
      'two\n',
    )
    await stream.stdin.end()
    expect(await stream.wait()).toBe(0)
    expect((await iterator.next()).done).toBe(true)
  })

  it('delivers INT to the process', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const stream = client.spawn(runtime.id, {
      argv: [
        'sh',
        '-c',
        'trap "echo caught; exit 7" INT; echo ready; while :; do sleep 0.05; done',
      ],
    })
    const iterator = stream.stdout[Symbol.asyncIterator]()
    expect(new TextDecoder().decode((await iterator.next()).value)).toBe(
      'ready\n',
    )
    stream.signal('INT')
    expect(await stream.wait()).toBe(7)
  })

  it('kills a process that ignores stdin', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const stream = client.spawn(runtime.id, {
      argv: ['sleep', '30'],
      killGraceMs: 200,
    })
    const output = text(stream.stdout)
    await stream.kill()
    expect(await stream.wait()).toBe(143)
    expect(await output).toBe('')
    expect(fake.processes.size).toBe(0)
  })

  it('closes the socket when a process ignores TERM', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const stream = client.spawn(runtime.id, {
      argv: [
        'sh',
        '-c',
        'trap "" TERM; echo ready; while :; do sleep 0.05; done',
      ],
      killGraceMs: 100,
    })
    const iterator = stream.stdout[Symbol.asyncIterator]()
    await iterator.next()
    await stream.kill()
    expect(await stream.wait()).toBe(143)
  })

  it('reports -1 for a process a signal terminated', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const stream = client.spawn(runtime.id, { argv: ['sleep', '30'] })
    setTimeout(() => stream.signal('TERM'), 50)
    expect(await stream.wait()).toBe(-1)
  })

  it('rejects wait() with the abort reason', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const controller = new AbortController()
    const stream = client.spawn(runtime.id, {
      argv: ['sleep', '30'],
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(new Error('stop now')), 30)
    await expect(stream.wait()).rejects.toThrow('stop now')
  })
})

describe('checkpoints', () => {
  it('creates, lists, restores into a new runtime, and deletes', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const checkpoint = await client.createCheckpoint(runtime.id, {
      name: 'snap',
    })
    expect(checkpoint).toMatchObject({
      name: 'snap',
      kind: 'full',
      state: 'ready',
    })
    expect((await client.listCheckpoints()).map((entry) => entry.id)).toEqual([
      checkpoint.id,
    ])

    const restored = await client.createRuntime({
      name: 'box-2',
      checkpointId: checkpoint.id,
      image: 'ignored',
    })
    expect(restored.id).not.toBe(runtime.id)
    expect(fake.runtime('box-2')?.restored_from).toBe(checkpoint.id)
    expect(fake.runtime('box-2')?.create_body).toEqual({
      name: 'box-2',
      checkpoint_id: checkpoint.id,
    })

    await client.deleteCheckpoint(checkpoint.id)
    await client.deleteCheckpoint(checkpoint.id)
    expect(await client.listCheckpoints()).toEqual([])
  })
})

describe('shellQuote', () => {
  it('quotes values so the shell reads them back unchanged', async () => {
    const { runtime } = await client.getOrCreateRuntime('box')
    const value = `a 'b' "c" $d \`e\`\n;`
    const result = await client.exec(runtime.id, {
      argv: ['sh', '-c', `printf %s ${shellQuote(value)}`],
    })
    expect(result.stdout).toBe(value)
  })
})
