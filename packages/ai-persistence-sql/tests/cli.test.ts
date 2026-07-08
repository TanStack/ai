import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli'

describe('SQL persistence CLI', () => {
  it('writes the default generic migration path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-sql-'))

    const result = await runCli(
      ['--dialect', 'postgres', '--timestamp', '20260706123456'],
      { cwd },
    )

    expect(result).toEqual({
      kind: 'file',
      path: join(
        cwd,
        'migrations',
        '20260706123456_tanstack_ai_persistence.sql',
      ),
    })
    if (result.kind === 'file') {
      await expect(readFile(result.path, 'utf8')).resolves.toContain(
        'TanStack AI persistence migration for postgres',
      )
    }
  })

  it('writes a custom output path with a custom migration name', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-sql-'))
    const out = join(cwd, 'db', 'migrations', 'custom.sql')

    const result = await runCli(
      [
        '--dialect',
        'sqlite',
        '--timestamp',
        '20260706123456',
        '--name',
        'custom_name',
        '--out',
        out,
      ],
      { cwd },
    )

    expect(result).toEqual({ kind: 'file', path: out })
    await expect(readFile(out, 'utf8')).resolves.toContain(
      'TanStack AI persistence migration for sqlite',
    )
  })

  it('prints SQL to stdout for every supported dialect', async () => {
    for (const dialect of ['sqlite', 'postgres', 'mysql']) {
      const written: Array<string> = []
      const result = await runCli(['--dialect', dialect, '--stdout'], {
        writeStdout: (value) => written.push(value),
      })

      expect(result.kind).toBe('stdout')
      if (result.kind === 'stdout') {
        expect(result.sql).toContain(
          `TanStack AI persistence migration for ${dialect}`,
        )
        expect(result.sql).toContain('CREATE TABLE IF NOT EXISTS runs')
        expect(written).toEqual([result.sql])
      }
    }
  })

  it('shows help text', async () => {
    const result = await runCli(['--help'])

    expect(result.kind).toBe('help')
    if (result.kind === 'help') {
      expect(result.text).toContain('tanstack-ai-persistence-sql')
      expect(result.text).toContain('--dialect sqlite|postgres|mysql')
      expect(result.text).toContain('--stdout')
    }
  })

  it('rejects invalid dialects', async () => {
    await expect(runCli(['--dialect', 'mssql'])).rejects.toThrow(
      'Invalid --dialect',
    )
  })

  it('rejects missing option values', async () => {
    await expect(runCli(['--out'])).rejects.toThrow('Missing value for --out')
    await expect(runCli(['--dialect'])).rejects.toThrow(
      'Missing value for --dialect',
    )
    await expect(runCli(['--timestamp'])).rejects.toThrow(
      'Missing value for --timestamp',
    )
    await expect(runCli(['--name'])).rejects.toThrow('Missing value for --name')
  })

  it('rejects path traversal migration names', async () => {
    await expect(runCli(['--name', '../escape'])).rejects.toThrow(
      'Invalid --name',
    )
  })

  it('refuses to overwrite an existing file without --force', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-sql-'))
    const out = join(cwd, 'migration.sql')
    await writeFile(out, 'existing')

    await expect(runCli(['--dialect', 'mysql', '--out', out])).rejects.toThrow(
      'already exists',
    )
  })

  it('overwrites an existing file with --force', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tanstack-ai-sql-'))
    const out = join(cwd, 'migration.sql')
    await writeFile(out, 'existing')

    const result = await runCli(['--dialect', 'mysql', '--out', out, '--force'])

    expect(result).toEqual({ kind: 'file', path: out })
    await expect(readFile(out, 'utf8')).resolves.toContain(
      'TanStack AI persistence migration for mysql',
    )
  })
})
