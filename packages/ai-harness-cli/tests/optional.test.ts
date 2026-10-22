import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { fakeText } from '@tanstack/ai/testing'
import { defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { EXIT, runCli } from '../src'
import { loadOptional } from '../src/optional'

// An installed version of @tanstack/ai-acp without harness support: it has
// no serveAcp function.
vi.mock('@tanstack/ai-acp/agent', () => ({ serveAcp: undefined }))

const folder = mkdtempSync(join(tmpdir(), 'cli-optional-'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

/** The URL of a temp module with `source`. */
function tempModule(name: string, source: string) {
  const path = join(folder, name)
  writeFileSync(path, source)
  return pathToFileURL(path).href
}

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
    expect(
      await loadOptional<{ run: () => void }>(
        '@tanstack/no-such-package/harness',
        'run',
      ),
    ).toBeUndefined()
    // An installed package with no harness support.
    expect(
      await loadOptional<{ serveAcp: () => void }>('node:path', 'serveAcp'),
    ).toBeUndefined()
  })

  it('throws, with the specifier, for a module that fails on import', async () => {
    const broken = tempModule('broken.mjs', 'throw new Error("boom")\n')
    await expect(
      loadOptional<{ run: () => void }>(broken, 'run'),
    ).rejects.toThrow(`Could not load ${broken}: boom`)
  })

  it('throws for a missing package that the module imports', async () => {
    const importer = tempModule(
      'importer.mjs',
      'import "@tanstack/no-such-dependency"\n',
    )
    await expect(
      loadOptional<{ run: () => void }>(importer, 'run'),
    ).rejects.toThrow(`Could not load ${importer}`)
  })

  it('fails a flag whose package has no harness support, with a clear message', async () => {
    let stderr = ''
    const code = await runCli(
      defineHarness({ name: 'test/optional', adapter: fakeText() }),
      {
        argv: ['--acp'],
        stdout: { write: () => {} },
        stderr: { write: (chunk) => (stderr += chunk) },
        persistence: memoryPersistence(),
      },
    )
    expect(code).toBe(EXIT.failed)
    expect(stderr).toContain(
      '--acp needs @tanstack/ai-acp with harness support.',
    )
  })
})
