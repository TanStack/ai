import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli'

describe('Drizzle persistence CLI', () => {
  it('writes the default Drizzle migration path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-drizzle-'))

    const result = await runCli(
      ['--dialect', 'postgres', '--timestamp', '20260706123456'],
      { cwd },
    )

    expect(result).toEqual({
      kind: 'file',
      path: join(cwd, 'drizzle', '20260706123456_tanstack_ai_persistence.sql'),
    })
    if (result.kind === 'file') {
      await expect(readFile(result.path, 'utf8')).resolves.toContain(
        'TanStack AI persistence migration for postgres',
      )
    }
  })

  it('writes a custom output path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-drizzle-'))
    const out = join(cwd, 'db', 'migrations', 'custom.sql')

    const result = await runCli(['--dialect', 'sqlite', '--out', out], { cwd })

    expect(result).toEqual({ kind: 'file', path: out })
    await expect(readFile(out, 'utf8')).resolves.toContain(
      'TanStack AI persistence migration for sqlite',
    )
  })

  it('prints SQL to stdout without writing a file', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-drizzle-'))

    const result = await runCli(['--dialect', 'sqlite', '--stdout'], { cwd })

    expect(result.kind).toBe('stdout')
    if (result.kind === 'stdout') {
      expect(result.sql).toContain(
        'TanStack AI persistence migration for sqlite',
      )
      expect(result.sql).toContain('CREATE TABLE IF NOT EXISTS runs')
    }
  })

  it('rejects invalid dialects', async () => {
    await expect(runCli(['--dialect', 'mysql'])).rejects.toThrow(
      'Invalid --dialect',
    )
  })

  it('rejects path traversal migration names', async () => {
    await expect(runCli(['--name', '../escape'])).rejects.toThrow(
      'Invalid --name',
    )
  })

  it('refuses to overwrite an existing file without --force', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-drizzle-'))
    const out = join(cwd, 'migration.sql')
    await writeFile(out, 'existing')

    await expect(runCli(['--dialect', 'sqlite', '--out', out])).rejects.toThrow(
      'already exists',
    )
  })

  it('overwrites an existing file with --force', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-drizzle-'))
    const out = join(cwd, 'migration.sql')
    await writeFile(out, 'existing')

    const result = await runCli([
      '--dialect',
      'sqlite',
      '--out',
      out,
      '--force',
    ])

    expect(result).toEqual({ kind: 'file', path: out })
    await expect(readFile(out, 'utf8')).resolves.toContain(
      'TanStack AI persistence migration for sqlite',
    )
  })

  it('rejects missing option values', async () => {
    await expect(runCli(['--out'])).rejects.toThrow('Missing value for --out')
  })
})
