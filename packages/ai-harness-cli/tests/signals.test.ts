import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeText } from '@tanstack/ai/testing'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { EXIT, runCli } from '../src'
import { asStdin, capture, stdinFrom } from './helpers'
import type { FakeResponse } from '@tanstack/ai/testing'
import type { AnyHarness } from '@tanstack/ai-harness'
import type { RunCliOptions } from '../src'

/** Resolves when `signal` aborts. */
function untilAborted(signal: AbortSignal | undefined) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()
    signal?.addEventListener('abort', () => resolve(), { once: true })
  })
}

/**
 * A model whose first call waits until it is aborted. With `stuck`, it
 * waits for `release` instead, as a model that does not stop at once. Its
 * later calls answer with `answers`. `calls` has the signal of each call.
 */
function waitingModel(
  answers: Array<FakeResponse> = [],
  { stuck = false } = {},
) {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls: Array<AbortSignal | undefined> = []
  const model = fakeText()
  model.setResponses([
    async ({ request }) => {
      const signal = request.request?.signal ?? request.abortController?.signal
      calls.push(signal)
      await (stuck ? released : untilAborted(signal))
      // The text stops at the abort, so the call does not finish.
      return { text: 'cut' }
    },
    ...answers,
  ])
  return { model, calls, release }
}

/** Start runCli with signals that the test emits. */
function startCli(harness: AnyHarness, options: RunCliOptions) {
  const signals = new EventEmitter()
  const stdout = capture()
  const stderr = capture()
  const running = runCli(harness, { stdout, stderr, signals, ...options })
  return { running, signals, stdout, stderr }
}

/** `/connect acme` asks for a key as a secret question. */
const acmeKeys = definePlugin({
  name: 'test/acme-keys',
  setup: (ctx) => ({
    commands: {
      'connect:acme': defineCommand({
        description: 'Save an Acme API key',
        run: () =>
          ctx.session.ask({
            message: 'Paste your Acme API key',
            schema: z.string(),
            secret: true,
          }),
      }),
    },
  }),
})

describe('signals in line mode', () => {
  it('cancels the running turn, reads the next line, and closes on a signal while nothing runs', async () => {
    const { model, calls } = waitingModel([{ text: 'Second answer.' }])
    const input = new PassThrough()
    const cli = startCli(
      defineHarness({ name: 'test/signal-lines', adapter: model }),
      { argv: [], stdin: asStdin(input, { isTTY: false }) },
    )
    input.write('hello\n')
    await vi.waitFor(() => expect(calls).toHaveLength(1))

    cli.signals.emit('SIGINT')
    await vi.waitFor(() => expect(calls[0]?.aborted).toBe(true))
    input.write('again\n')
    await vi.waitFor(() => expect(cli.stdout.text).toContain('Second answer.'))
    cli.signals.emit('SIGINT')

    expect(await cli.running).toBe(EXIT.cancelled)
  })

  it('closes on Ctrl+C while a secret question hides typing', async () => {
    const rawModes: Array<boolean> = []
    const input = new PassThrough()
    const stdin = Object.assign(asStdin(input, { isTTY: true }), {
      setRawMode: (mode: boolean) => rawModes.push(mode),
    })
    const cli = startCli(
      defineHarness({
        name: 'test/signal-secret',
        adapter: fakeText(),
        plugins: () => [acmeKeys],
      }),
      { argv: [], stdin },
    )
    input.write('/connect acme\n')
    await vi.waitFor(() => expect(rawModes).toEqual([true]))

    // Raw mode makes Ctrl+C a typed character.
    input.write('\u0003')

    expect(await cli.running).toBe(EXIT.cancelled)
    expect(rawModes).toEqual([true, false])
  })
})

describe('signals in print mode', () => {
  it('cancels the turn on SIGTERM and exits 143', async () => {
    const { model, calls } = waitingModel()
    const cli = startCli(
      defineHarness({ name: 'test/signal-print', adapter: model }),
      { argv: ['-p', 'hi'] },
    )
    await vi.waitFor(() => expect(calls).toHaveLength(1))

    cli.signals.emit('SIGTERM')

    expect(await cli.running).toBe(143)
    expect(calls[0]?.aborted).toBe(true)
  })

  it('releases only its handle of your host on a second signal while the cancelled turn runs on', async () => {
    const { model, calls, release } = waitingModel([], { stuck: true })
    const harness = defineHarness({ name: 'test/signal-stuck', adapter: model })
    // A session that no handle holds closes at once when it is idle.
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { idleCloseMs: 0 },
    })
    const close = vi.spyOn(host, 'close')
    const cli = startCli(harness, { argv: ['-p', 'hi'], host })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    cli.signals.emit('SIGINT')
    await vi.waitFor(() => expect(calls[0]?.aborted).toBe(true))

    cli.signals.emit('SIGINT')
    release()

    expect(await cli.running).toBe(EXIT.cancelled)
    expect(close).not.toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(host.isOpen(harness, { threadId: 'main' })).toBe(false),
    )
    await host.close()
  })
})

describe('signals in a custom ui', () => {
  it('stops a ui that is still open, and releases its handle of your host', async () => {
    const harness = defineHarness({
      name: 'test/signal-ui',
      adapter: fakeText(),
    })
    // A session that no handle holds closes at once when it is idle.
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { idleCloseMs: 0 },
    })
    let shown = false
    const cli = startCli(harness, {
      argv: [],
      stdin: stdinFrom([], { isTTY: true }),
      host,
      // A ui that the user never quits.
      ui: () => {
        shown = true
        return new Promise<void>(() => {})
      },
    })
    await vi.waitFor(() => expect(shown).toBe(true))

    cli.signals.emit('SIGTERM')

    expect(await cli.running).toBe(143)
    expect(host.isOpen(harness, { threadId: 'main' })).toBe(false)
    await host.close()
  })
})

describe('signals in --serve', () => {
  it('stops on SIGTERM with 143, and the next host runs the cut turn again', async () => {
    const persistence = {
      stores: { log: memoryLogStore(), runs: memoryPersistence().stores.runs },
    }
    const { model, calls } = waitingModel()
    const cli = startCli(
      defineHarness({ name: 'test/signal-serve', adapter: model }),
      { argv: ['--serve', '--port', '0', '--token', 'secret'], persistence },
    )
    const url = await vi.waitFor(() => {
      const [, served] = /at (\S+)\n/.exec(cli.stderr.text) ?? []
      expect(served).toBeDefined()
      return served
    })
    const receipt = await fetch(`${url}/control`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 't',
        input: { op: 'prompt', message: 'go' },
      }),
    })
    const { inputId } = await receipt.json()
    await vi.waitFor(() => expect(calls).toHaveLength(1))

    cli.signals.emit('SIGTERM')

    expect(await cli.running).toBe(143)
    await expect(fetch(`${url}/capabilities`)).rejects.toThrow()
    const recovered = fakeText()
    recovered.setResponses([{ text: 'recovered' }])
    const next = createHarnessHost({ persistence })
    const session = await next.open(
      defineHarness({ name: 'test/signal-serve', adapter: recovered }),
      { threadId: 't' },
    )
    expect(await session.settled(inputId)).toMatchObject({
      outcome: 'completed',
    })
    await next.close()
  })
})

describe('signals in the stdio modes', () => {
  // The MCP and ACP servers read process.stdin. The test keeps them off it,
  // and keeps the events they listen for.
  let listened: Array<string | symbol> = []
  beforeEach(() => {
    listened = []
    vi.spyOn(process.stdin, 'on').mockImplementation(
      (event: string | symbol) => {
        listened.push(event)
        return process.stdin
      },
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Start `argv` with `options`, and wait until it reads stdio. */
  async function startServing(
    argv: Array<string>,
    options: RunCliOptions = {},
  ) {
    const harness = defineHarness({
      name: 'test/signal-stdio',
      adapter: fakeText(),
    })
    const cli = startCli(harness, { argv, ...options })
    await vi.waitFor(() => expect(listened).toContain('end'))
    return cli
  }

  it('ends --mcp when the stdin of runCli ends', async () => {
    const stdin = stdinFrom([], { isTTY: false })
    const cli = await startServing(['--mcp'], { stdin })

    // In a real run, the MCP server reads this stdin, so it ends.
    stdin.resume()

    expect(await cli.running).toBe(EXIT.ok)
  })

  it('stops --mcp on SIGINT with 130', async () => {
    const cli = await startServing(['--mcp'], {
      stdin: stdinFrom([], { isTTY: false }),
    })

    cli.signals.emit('SIGINT')

    expect(await cli.running).toBe(EXIT.cancelled)
  })

  it('stops --acp on SIGINT with 130, and leaves your host open', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const close = vi.spyOn(host, 'close')
    const cli = await startServing(['--acp'], { host })

    cli.signals.emit('SIGINT')

    expect(await cli.running).toBe(EXIT.cancelled)
    expect(close).not.toHaveBeenCalled()
    await host.close()
  })
})
