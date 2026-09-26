import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { EventType } from '@tanstack/ai'
import { HARNESS_PROTOCOL_VERSION } from './protocol'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { HostFrame } from './protocol'

/** What a built harness says about itself. Fields are claims; deploy policy decides. */
export interface HarnessManifestV1 {
  format: 'tanstack-ai-harness'
  version: 1
  name: string
  /** sha256 of the bundle. */
  digest: string
  /** The bundle file, relative to the manifest. */
  entry: string
  runtime: { kind: 'node'; major: number }
  protocol: typeof HARNESS_PROTOCOL_VERSION
  agents: Array<{ name: string; produces?: string }>
  plugins: Array<{ name: string }>
  requires: {
    filesystem: boolean
    processExecution: boolean
    network: 'model-only' | 'declared'
  }
}

export interface BuildHarnessOptions {
  /** The module that exports the harness. */
  entry: string
  /** The export name. Default `'default'`. */
  export?: string
  outDir: string
  /**
   * Also build a single executable of `compile.entry` (for example a file
   * that calls `runCli`) with Bun.
   */
  compile?: { entry: string; outfile: string; target?: string }
  /** The Bun executable. Default `'bun'`. */
  bun?: string
}

const MANIFEST = 'harness.manifest.json'
const BUNDLE = 'harness.js'

function run(
  command: string,
  args: Array<string>,
  cwd: string,
): Promise<string> {
  // On Windows, npm installs Bun as a `.cmd` shim, which only a shell can
  // start. The arguments are paths this module builds, quoted for cmd.
  const viaShell = process.platform === 'win32' && !/\.exe$/i.test(command)
  return new Promise((done, fail) => {
    const child = viaShell
      ? spawn(
          command,
          args.map((arg) => `"${arg}"`),
          { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true },
        )
      : spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => (stdout += data.toString()))
    child.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
    child.on('error', (error) =>
      fail(
        new Error(
          `Could not run ${command}. buildHarness uses Bun: install it from https://bun.sh. (${error.message})`,
        ),
      ),
    )
    child.on('close', (code) =>
      code === 0
        ? done(stdout)
        : fail(
            new Error(
              `${command} ${args[0] ?? ''} failed:\n${stderr || stdout}`,
            ),
          ),
    )
  })
}

/**
 * Bundle a harness into a worker artifact: `harness.js` (starts a worker on
 * stdin and stdout) and `harness.manifest.json`. With `compile`, also build a
 * single executable.
 *
 * The build imports `entry` in a child process to read the harness name,
 * agents, and plugin names. Importing a module runs its code.
 */
export async function buildHarness(options: BuildHarnessOptions): Promise<{
  manifest: HarnessManifestV1
  bundle: string
  executable?: string
}> {
  const bun = options.bun ?? 'bun'
  const entry = resolve(options.entry)
  const outDir = resolve(options.outDir)
  const exportName = options.export ?? 'default'
  // Bun resolves plain absolute paths, not file:// URLs. Forward slashes
  // keep Windows paths valid inside the generated modules.
  const slash = (path: string) => path.split('\\').join('/')
  const entryPath = slash(entry)
  const builtWorker = fileURLToPath(new URL('./worker.js', import.meta.url))
  // From source (tests), the worker module is still TypeScript.
  const workerModule = slash(
    existsSync(builtWorker) ? builtWorker : builtWorker.replace(/\.js$/, '.ts'),
  )
  await mkdir(outDir, { recursive: true })

  // Temporary files sit next to the entry, so its imports resolve the same way.
  const id = randomUUID().slice(0, 8)
  const bootstrap = join(dirname(entry), `.harness-worker-${id}.mjs`)
  const describe = join(dirname(entry), `.harness-describe-${id}.mjs`)
  await writeFile(
    bootstrap,
    [
      `import * as entry from ${JSON.stringify(entryPath)}`,
      `import { runHarnessWorker } from ${JSON.stringify(workerModule)}`,
      `await runHarnessWorker(entry[${JSON.stringify(exportName)}])`,
    ].join('\n'),
  )
  await writeFile(
    describe,
    [
      `const entry = await import(${JSON.stringify(entryPath)})`,
      `const harness = entry[${JSON.stringify(exportName)}]`,
      `if (!harness || harness.kind !== 'tanstack-ai-harness') throw new Error('Export ${exportName} of ${entry.replace(/\\/g, '/')} is not a harness.')`,
      `const agents = [...(harness.agents ?? []), ...(harness.subagents?.agents ?? [])]`,
      `const plugins = harness.plugins ? harness.plugins().map((plugin) => ({ name: plugin.name })) : []`,
      `console.log(JSON.stringify({ name: harness.name, agents: agents.map((agent) => ({ name: agent.name, ...(agent.produces ? { produces: agent.produces } : {}) })), plugins }))`,
    ].join('\n'),
  )

  try {
    const bundle = join(outDir, BUNDLE)
    await run(
      bun,
      ['build', bootstrap, '--target=node', `--outfile=${bundle}`],
      dirname(entry),
    )
    const described: {
      name: string
      agents: HarnessManifestV1['agents']
      plugins: HarnessManifestV1['plugins']
    } = JSON.parse(
      (await run(bun, [describe], dirname(entry))).trim().split('\n').at(-1) ??
        '{}',
    )
    const names = described.plugins.map((plugin) => plugin.name)
    const usesWorkspace = names.includes('tanstack/workspace-tools')
    const manifest: HarnessManifestV1 = {
      format: 'tanstack-ai-harness',
      version: 1,
      name: described.name,
      digest: createHash('sha256')
        .update(await readFile(bundle))
        .digest('hex'),
      entry: BUNDLE,
      runtime: {
        kind: 'node',
        major: Number(process.versions.node.split('.')[0]),
      },
      protocol: HARNESS_PROTOCOL_VERSION,
      agents: described.agents,
      plugins: described.plugins,
      requires: {
        filesystem:
          usesWorkspace || names.includes('tanstack/project-instructions'),
        processExecution: usesWorkspace,
        network: names.some((name) => name.startsWith('connector/'))
          ? 'declared'
          : 'model-only',
      },
    }
    await writeFile(
      join(outDir, MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )

    let executable: string | undefined
    if (options.compile) {
      executable = resolve(options.compile.outfile)
      await run(
        bun,
        [
          'build',
          resolve(options.compile.entry),
          '--compile',
          `--outfile=${executable}`,
          ...(options.compile.target
            ? [`--target=${options.compile.target}`]
            : []),
        ],
        dirname(resolve(options.compile.entry)),
      )
    }
    return { manifest, bundle, ...(executable ? { executable } : {}) }
  } finally {
    await rm(bootstrap, { force: true })
    await rm(describe, { force: true })
  }
}

/** Read and check the manifest of a built harness. */
export async function readManifest(dir: string): Promise<HarnessManifestV1> {
  const manifest: unknown = JSON.parse(
    await readFile(join(resolve(dir), MANIFEST), 'utf8'),
  )
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('format' in manifest) ||
    manifest.format !== 'tanstack-ai-harness' ||
    !('version' in manifest) ||
    manifest.version !== 1
  ) {
    throw new Error(`${dir} has no tanstack-ai-harness v1 manifest.`)
  }
  // The format and version checks above identify the file.
  return manifest as HarnessManifestV1
}

const FORWARDED = new Set<string>([
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_END,
  EventType.REASONING_START,
  EventType.REASONING_MESSAGE_START,
  EventType.REASONING_MESSAGE_CONTENT,
  EventType.REASONING_MESSAGE_END,
  EventType.REASONING_END,
])

interface Worker {
  send: (frame: object) => void
  frames: (listener: (frame: HostFrame) => void) => () => void
  kill: () => void
}

function startWorker(node: string, bundle: string, threadId: string): Worker {
  const child = spawn(node, [bundle], { stdio: ['pipe', 'pipe', 'inherit'] })
  const listeners = new Set<(frame: HostFrame) => void>()
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const frame = JSON.parse(line) as HostFrame
      for (const listener of listeners) listener(frame)
    } catch {
      // A line that is not a frame (for example a stray log) is skipped.
    }
  })
  const send = (frame: object) =>
    child.stdin.write(`${JSON.stringify(frame)}\n`)
  send({ type: 'harness.subscribe', threadId })
  return {
    send,
    frames: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    kill: () => {
      child.stdin.end()
      child.kill()
    },
  }
}

function lastUserText(messages: unknown): string {
  const list: ReadonlyArray<unknown> = Array.isArray(messages) ? messages : []
  const message = list.findLast(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'role' in entry &&
      entry.role === 'user',
  )
  if (
    typeof message !== 'object' ||
    message === null ||
    !('content' in message)
  )
    return ''
  return typeof message.content === 'string' ? message.content : ''
}

/**
 * Use a built harness as the model of a `chat()` call. Each outer thread gets
 * its own worker process (`node harness.js`). Call `dispose()` to stop them.
 */
export async function artifactText(
  dir: string,
  options: { node?: string } = {},
): Promise<AnyTextAdapter & { dispose: () => void }> {
  const manifest = await readManifest(dir)
  const bundle = join(resolve(dir), manifest.entry)
  const digest = createHash('sha256')
    .update(await readFile(bundle))
    .digest('hex')
  if (digest !== manifest.digest) {
    throw new Error(`The bundle in ${dir} does not match its manifest digest.`)
  }
  const workers = new Map<string, Worker>()
  let requests = 0

  return {
    kind: 'text',
    name: 'harness-artifact',
    model: manifest.name,
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    dispose: () => {
      for (const worker of workers.values()) worker.kill()
      workers.clear()
    },
    structuredOutput: () =>
      Promise.reject(
        new Error('artifactText does not support structured output.'),
      ),
    chatStream: (chatOptions) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        const threadId = chatOptions.threadId ?? 'default'
        let worker = workers.get(threadId)
        if (!worker) {
          worker = startWorker(
            options.node ?? process.execPath,
            bundle,
            threadId,
          )
          workers.set(threadId, worker)
        }
        const runId = chatOptions.runId ?? `artifact-${Date.now().toString(36)}`
        const requestId = `r${(requests += 1)}`
        const queue: Array<HostFrame> = []
        let wake: (() => void) | undefined
        const stop = worker.frames((frame) => {
          queue.push(frame)
          wake?.()
        })
        worker.send({
          type: 'harness.input',
          requestId,
          input: { op: 'prompt', message: lastUserText(chatOptions.messages) },
        })
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        let operationId: string | undefined
        const early: Array<Extract<HostFrame, { type: 'harness.event' }>> = []
        try {
          while (true) {
            if (queue.length === 0) {
              await new Promise<void>((resolveWait) => (wake = resolveWait))
              wake = undefined
            }
            const frame = queue.shift()
            if (!frame) continue
            if (frame.type === 'harness.error') throw new Error(frame.message)
            if (
              frame.type === 'harness.receipt' &&
              frame.requestId === requestId
            ) {
              if (frame.status === 'rejected')
                throw new Error(
                  frame.reason ?? 'The worker refused the prompt.',
                )
              operationId = frame.operationId
              queue.unshift(
                ...early.filter((entry) => entry.operationId === operationId),
              )
              continue
            }
            if (frame.type !== 'harness.event') continue
            if (!operationId) {
              early.push(frame)
              continue
            }
            if (frame.operationId !== operationId) continue
            const event = frame.event
            if (
              FORWARDED.has(event.type) &&
              !('subagentRunId' in event && event.subagentRunId)
            )
              yield event
            if (event.type === EventType.RUN_ERROR)
              throw new Error(event.message)
            if (
              event.type === EventType.CUSTOM &&
              event.name === 'harness.operation.finished'
            )
              break
          }
        } finally {
          stop()
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}
