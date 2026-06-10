import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { Miniflare } from 'miniflare'

/**
 * Regression test for #730: the default debug logger (`ConsoleLogger`)
 * dropped every `meta` payload on Cloudflare Workers because workerd never
 * forwards `console.dir` output to the terminal. These tests run the BUILT
 * logger inside real workerd (via Miniflare, with `nodejs_compat` enabled —
 * which also emulates `process.versions.node`, the trap that defeats naive
 * Node detection) and assert the payloads actually reach the runtime's log
 * stream.
 *
 * Requires `@tanstack/ai` to be built (`pnpm build`), same as every other
 * spec in this suite.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGGER_DIST = path.resolve(
  __dirname,
  '../../../packages/ai/dist/esm/logger/console-logger.js',
)

/**
 * Build a single-module worker script: the compiled ConsoleLogger source
 * (self-contained, no imports) plus a fetch handler that exercises it.
 */
async function buildWorkerScript(): Promise<string> {
  const loggerSource = await readFile(LOGGER_DIST, 'utf8')
  return `${loggerSource}
export default {
  fetch() {
    const logger = new ConsoleLogger()
    logger.debug('E2E-DEBUG-HEADLINE', {
      payload: { nested: { deeper: { deepest: { marker: 'E2E-META-DEPTH-5' } } } },
    })
    logger.error('E2E-ERROR-HEADLINE', { cause: new Error('E2E-UPSTREAM-401') })
    const circular = { name: 'E2E-CIRCULAR' }
    circular.self = circular
    logger.warn('E2E-WARN-HEADLINE', circular)
    return new Response('ok')
  },
}
`
}

test.describe('ConsoleLogger on real workerd', () => {
  test('meta payloads reach the log stream at full depth', async () => {
    const chunks: Array<Buffer> = []
    const mf = new Miniflare({
      modules: true,
      script: await buildWorkerScript(),
      compatibilityDate: '2025-01-01',
      compatibilityFlags: ['nodejs_compat'],
      handleRuntimeStdio(stdout, stderr) {
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
        stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
      },
    })
    try {
      const response = await mf.dispatchFetch('http://localhost/')
      expect(await response.text()).toBe('ok')

      const output = () => Buffer.concat(chunks).toString('utf8')
      // Logs flush asynchronously from the workerd process.
      await expect.poll(output, { timeout: 10_000 }).toContain(
        'E2E-WARN-HEADLINE',
      )

      // Headlines for every level.
      expect(output()).toContain('E2E-DEBUG-HEADLINE')
      expect(output()).toContain('E2E-ERROR-HEADLINE')

      // The #730 regression: meta must survive, at full depth — workerd's
      // own inspect would truncate a depth-5 object passed as a console
      // argument, so this also proves the JSON rendering path was taken.
      expect(output()).toContain('E2E-META-DEPTH-5')

      // Error instances serialize meaningfully (plain JSON.stringify of an
      // Error yields '{}').
      expect(output()).toContain('E2E-UPSTREAM-401')

      // Circular meta must not crash or vanish.
      expect(output()).toContain('E2E-CIRCULAR')
      expect(output()).toContain('[Circular]')
    } finally {
      await mf.dispose()
    }
  })
})
