import { describe, expect, it } from 'vitest'
import { fakeText } from '@tanstack/ai/testing'
import { defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { EXIT, runCli } from '../src'
import { loadOptional } from '../src/optional'

describe('optional packages', () => {
  it('loads a module that has the functions', async () => {
    const path = await loadOptional<{ join: () => string }>('node:path', 'join')
    expect(typeof path?.join).toBe('function')
  })

  it('gives undefined for a missing package or a module without the functions', async () => {
    expect(
      await loadOptional<{ run: () => void }>(
        '@tanstack/no-such-package',
        'run',
      ),
    ).toBeUndefined()
    // An installed package with no harness support.
    expect(
      await loadOptional<{ serveAcp: () => void }>('node:path', 'serveAcp'),
    ).toBeUndefined()
  })

  it('fails a flag whose package is missing, with a clear message', async () => {
    let text = ''
    const harness = defineHarness({
      name: 'test/optional',
      adapter: fakeText(),
    })
    const code = await runCli(harness, {
      argv: ['--dashboard', 'http://127.0.0.1:1'],
      stdout: { write: () => {} },
      stderr: { write: (chunk) => (text += chunk) },
      persistence: memoryPersistence(),
    })
    expect(code).toBe(EXIT.failed)
    expect(text).toContain(
      '--dashboard needs @tanstack/ai-dashboard with harness support.',
    )
  })
})
