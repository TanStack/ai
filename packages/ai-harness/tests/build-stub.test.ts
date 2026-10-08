import { createHash } from 'node:crypto'
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { artifactText, buildHarness, readManifest } from '../src/build'
import type { StreamChunk } from '@tanstack/ai'

// These tests stand in a small script for Bun, so they run where Bun is not
// installed. The script "bundles" by copying a hand-written worker that
// speaks the harness frames. build.test.ts covers a real Bun build.
const tmp = fileURLToPath(new URL('./.tmp-build-stub/', import.meta.url))
const app = join(tmp, 'app')
const broken = join(tmp, 'broken')
const entry = join(app, 'studio.ts')

const stubWorker = `
import { createInterface } from 'node:readline'
const send = (frame) => process.stdout.write(JSON.stringify(frame) + '\\n')
let turns = 0
createInterface({ input: process.stdin }).on('line', (line) => {
  const frame = JSON.parse(line)
  if (frame.type !== 'harness.input') return
  const message = frame.input.message
  if (message === 'reject') {
    send({ type: 'harness.receipt', requestId: frame.requestId, status: 'rejected', reason: 'busy' })
    return
  }
  if (message === 'reject quietly') {
    send({ type: 'harness.receipt', requestId: frame.requestId, status: 'rejected' })
    return
  }
  if (message === 'crash') {
    send({ type: 'harness.error', message: 'worker crashed' })
    return
  }
  turns += 1
  const operationId = 'op-' + turns
  const event = (value) =>
    send({ type: 'harness.event', cursor: String(turns), operationId, event: { timestamp: 1, ...value } })
  // One event arrives before the receipt, one belongs to another operation.
  event({ type: 'TEXT_MESSAGE_START', messageId: 'm' + turns, role: 'assistant' })
  send({ type: 'harness.event', cursor: 'x', operationId: 'other', event: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'x', delta: 'ignored', timestamp: 1 } })
  send({ type: 'harness.receipt', requestId: frame.requestId, status: 'accepted', operationId })
  process.stdout.write('a stray log line\\n')
  if (message === 'fail') {
    event({ type: 'RUN_ERROR', message: 'turn failed' })
    return
  }
  send({ type: 'harness.event', cursor: 'y', operationId: 'other', event: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'x', delta: 'ignored', timestamp: 1 } })
  event({ type: 'TOOL_CALL_START', toolCallId: 't', toolCallName: 'hidden' })
  event({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm' + turns, delta: 'turn ' + turns + ': ' + message })
  event({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'c', delta: ' (child)', subagentRunId: 'child-1' })
  event({ type: 'TEXT_MESSAGE_END', messageId: 'm' + turns })
  event({ type: 'CUSTOM', name: 'harness.operation.finished', value: {} })
})
`

const fakeBun = `
import { copyFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const outfile = args.find((arg) => arg.startsWith('--outfile='))?.slice('--outfile='.length)
if (process.cwd().endsWith('broken')) {
  process.stderr.write('bundle exploded')
  process.exit(1)
}
if (args[0] === 'build' && args.includes('--compile')) {
  writeFileSync(outfile, 'executable for ' + (args.find((arg) => arg.startsWith('--target=')) ?? 'this machine'))
} else if (args[0] === 'build') {
  copyFileSync(new URL('./stub-worker.mjs', import.meta.url), outfile)
} else {
  console.log('noise from the entry module')
  console.log(JSON.stringify({
    name: 'acme/stub',
    agents: [{ name: 'painter', produces: 'image' }],
    plugins: [{ name: 'tanstack/workspace-tools' }, { name: 'connector/notion' }],
  }))
}
`

let bun: string

beforeAll(async () => {
  await mkdir(app, { recursive: true })
  await mkdir(broken, { recursive: true })
  await writeFile(entry, 'export default {}\n')
  await writeFile(join(broken, 'studio.ts'), 'export default {}\n')
  await writeFile(join(tmp, 'stub-worker.mjs'), stubWorker)
  await writeFile(join(tmp, 'fake-bun.mjs'), fakeBun)
  if (process.platform === 'win32') {
    bun = join(tmp, 'fake-bun.cmd')
    await writeFile(bun, `@"${process.execPath}" "%~dp0fake-bun.mjs" %*\r\n`)
  } else {
    bun = join(tmp, 'fake-bun')
    await writeFile(
      bun,
      `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-bun.mjs" "$@"\n`,
    )
    await chmod(bun, 0o755)
  }
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

async function textOf(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let out = ''
  for await (const chunk of stream) {
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) out += chunk.delta
  }
  return out
}

describe('buildHarness with a stand-in bundler', () => {
  it('writes a manifest from what the entry describes, then cleans up', async () => {
    const outDir = join(tmp, 'out')
    const { manifest, bundle, executable } = await buildHarness({
      entry,
      outDir,
      bun,
    })

    const bytes = await readFile(bundle)
    expect(manifest).toMatchObject({
      format: 'tanstack-ai-harness',
      version: 1,
      name: 'acme/stub',
      entry: 'harness.js',
      digest: createHash('sha256').update(bytes).digest('hex'),
      runtime: { kind: 'node' },
      agents: [{ name: 'painter', produces: 'image' }],
      plugins: [
        { name: 'tanstack/workspace-tools' },
        { name: 'connector/notion' },
      ],
      requires: {
        filesystem: true,
        processExecution: true,
        network: 'declared',
      },
    })
    expect(executable).toBeUndefined()
    expect(await readManifest(outDir)).toEqual(manifest)
    // The temporary bootstrap and describe modules are gone.
    expect(
      (await readdir(app)).filter((name) => name.startsWith('.harness-')),
    ).toEqual([])
  })

  it('also compiles an executable when asked', async () => {
    const outfile = join(tmp, 'studio-bin')
    const { executable } = await buildHarness({
      entry,
      export: 'studio',
      outDir: join(tmp, 'out-compiled'),
      bun,
      compile: { entry, outfile, target: 'bun-linux-x64' },
    })
    expect(executable).toBe(outfile)
    expect(await readFile(outfile, 'utf8')).toBe(
      'executable for --target=bun-linux-x64',
    )

    await buildHarness({
      entry,
      outDir: join(tmp, 'out-compiled-default'),
      bun,
      compile: { entry, outfile },
    })
    expect(await readFile(outfile, 'utf8')).toBe('executable for this machine')
  })

  it('reports a failed bundle with its output and still cleans up', async () => {
    await expect(
      buildHarness({
        entry: join(broken, 'studio.ts'),
        outDir: join(tmp, 'out-broken'),
        bun,
      }),
    ).rejects.toThrow('bundle exploded')
    expect(
      (await readdir(broken)).filter((name) => name.startsWith('.harness-')),
    ).toEqual([])
  })

  it('says to install Bun when the command cannot start', async () => {
    // On Windows the command runs through a shell, which reports the missing
    // command as a failed run instead of a spawn error.
    await expect(
      buildHarness({
        entry,
        outDir: join(tmp, 'out-missing'),
        bun: join(tmp, 'no-such-bun.exe'),
      }),
    ).rejects.toThrow(/Could not run|failed/)
  })
})

describe('readManifest', () => {
  it('refuses a directory whose manifest is not a harness manifest', async () => {
    const dir = join(tmp, 'not-a-harness')
    await mkdir(dir, { recursive: true })
    for (const manifest of [
      null,
      'text',
      { format: 'other' },
      { format: 'tanstack-ai-harness', version: 2 },
    ]) {
      await writeFile(
        join(dir, 'harness.manifest.json'),
        JSON.stringify(manifest),
      )
      await expect(readManifest(dir)).rejects.toThrow(
        'has no tanstack-ai-harness v1 manifest',
      )
    }
  })
})

describe('artifactText with a built stub', () => {
  it('streams the worker text for each turn and keeps one worker per thread', async () => {
    const outDir = join(tmp, 'out-chat')
    await buildHarness({ entry, outDir, bun })
    const model = await artifactText(outDir)
    try {
      expect(model.model).toBe('acme/stub')
      const ask = (content: string, threadId: string) =>
        textOf(
          chat({
            adapter: model,
            messages: [
              { role: 'assistant', content: 'earlier' },
              { role: 'user', content },
            ],
            threadId,
          }) as AsyncIterable<StreamChunk>,
        )
      expect(await ask('hello', 'a')).toBe('turn 1: hello')
      expect(await ask('again', 'a')).toBe('turn 2: again')
      // Another thread starts its own worker, so it counts from one.
      expect(await ask('fresh', 'b')).toBe('turn 1: fresh')
      await expect(model.structuredOutput({} as never)).rejects.toThrow(
        'does not support structured output',
      )
    } finally {
      model.dispose()
    }
  })

  it('turns worker refusals and errors into errors', async () => {
    const outDir = join(tmp, 'out-errors')
    await buildHarness({ entry, outDir, bun })
    const model = await artifactText(outDir, { node: process.execPath })
    const stream = (content: unknown) =>
      model.chatStream({
        model: 'acme/stub',
        messages: [{ role: 'user', content }],
        threadId: 'errors',
      } as never)
    const drain = async (content: unknown) => {
      for await (const _chunk of stream(content)) {
        // Only the error matters.
      }
    }
    try {
      await expect(drain('reject')).rejects.toThrow('busy')
      await expect(drain('reject quietly')).rejects.toThrow(
        'The worker refused the prompt.',
      )
      await expect(drain('crash')).rejects.toThrow('worker crashed')
      await expect(drain('fail')).rejects.toThrow('turn failed')
      // A message without text content is sent as an empty prompt.
      let text = ''
      for await (const chunk of stream([{ type: 'text', content: 'x' }])) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) text += chunk.delta
      }
      expect(text).toBe('turn 2: ')
    } finally {
      model.dispose()
    }
  })

  it('refuses a bundle that does not match its manifest', async () => {
    const outDir = join(tmp, 'out-tampered')
    await buildHarness({ entry, outDir, bun })
    await writeFile(join(outDir, 'harness.js'), '// changed\n')
    await expect(artifactText(outDir)).rejects.toThrow(
      'does not match its manifest digest',
    )
  })
})
