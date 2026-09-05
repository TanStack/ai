/**
 * Exempt from the aimock policy: the harness overrides `buildRunStream` with a
 * local never-resolving stream and never reaches an LLM provider's HTTP layer,
 * so there is nothing to mock.
 */
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { Miniflare } from 'miniflare'
import { build } from 'vite'

const AGENT_DIST = fileURLToPath(
  new URL(
    '../../../packages/ai-sandbox-cloudflare/dist/esm/agent.js',
    import.meta.url,
  ),
)
const RUN_ID = 'watchdog-e2e'
const STALL_MS = 250
const POLL_TIMEOUT_MS = 15_000
const WATCHDOG_ERROR = 'run watchdog: no progress; orchestrator presumed dead'

const harness = `
import { SandboxCoordinator } from './agent.js'
const RUN_ID = '${RUN_ID}'
export class TestCoordinator extends SandboxCoordinator {
  constructor(ctx, env) {
    super(ctx, env, Number(env.STALL_TIMEOUT_MS))
  }
  buildRunStream() {
    return (async function* () { await new Promise(() => {}) })()
  }
  async handleRoute(_request, parts) {
    if (parts[0] === 'start') {
      const result = await this.startRun({
        runId: RUN_ID, threadId: 'thread-e2e', messages: [],
      })
      return this.jsonResponse(result)
    }
    if (parts[0] === 'state') {
      const record = await this.status(RUN_ID)
      const events = []
      if (record && record.status !== 'running') {
        for await (const event of this.log.read(RUN_ID)) events.push(event.chunk)
      }
      return this.jsonResponse({ record, events })
    }
    return new Response('not found', { status: 404 })
  }
}
export default {
  fetch(request, env) {
    const id = env.COORDINATOR.idFromName('singleton')
    return env.COORDINATOR.get(id).fetch(request)
  },
}
`

async function buildWorkerModules() {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      rollupOptions: {
        input: { agent: AGENT_DIST },
        external: ['cloudflare:workers'],
        preserveEntrySignatures: 'strict',
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
        },
      },
    },
  })
  if (Array.isArray(result) || !('output' in result)) {
    throw new Error('expected one Vite bundle')
  }
  return [
    { type: 'ESModule' as const, path: 'worker.js', contents: harness },
    ...result.output.flatMap((output) =>
      output.type === 'chunk'
        ? [
            {
              type: 'ESModule' as const,
              path: output.fileName,
              contents: output.code,
            },
          ]
        : [],
    ),
  ]
}

test('a real alarm fails a stalled Cloudflare coordinator run', async () => {
  test.setTimeout(60_000)
  const mf = new Miniflare({
    modules: await buildWorkerModules(),
    compatibilityDate: '2025-01-01',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { STALL_TIMEOUT_MS: String(STALL_MS) },
    durableObjects: { COORDINATOR: 'TestCoordinator' },
  })
  const dispatch = (route: string) =>
    mf.dispatchFetch(`http://localhost/${route}`)
  const state = async () => (await dispatch('state')).json()

  try {
    expect(await (await dispatch('start')).json()).toEqual({ runId: RUN_ID })
    await expect
      .poll(async () => (await state()).record?.status, {
        timeout: POLL_TIMEOUT_MS,
      })
      .toBe('failed')

    const final = await state()
    expect(final.record.error).toEqual({ message: WATCHDOG_ERROR })
    expect(final.events).toEqual([
      { type: 'RUN_ERROR', message: WATCHDOG_ERROR },
    ])
  } finally {
    await mf.dispose()
  }
})
