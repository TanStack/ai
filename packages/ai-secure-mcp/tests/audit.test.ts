import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAuditLog, redactArgs } from '../src/audit'

describe('redactArgs', () => {
  it('keeps id-like fields and redacts the rest, including free-text query', () => {
    expect(
      redactArgs({ movieId: 'tt123', query: 'dune', apiKey: 'secret', n: 5 }),
    ).toEqual({
      movieId: 'tt123',
      // `query` is free text and can carry a secret, so it is redacted.
      query: '[redacted]',
      apiKey: '[redacted]',
      n: '[redacted]',
    })
  })

  it('does not leak a non-object value', () => {
    expect(redactArgs('a-secret-string')).toBe('[string]')
    expect(redactArgs([1, 2, 3])).toBe('[array]')
  })
})

describe('createAuditLog', () => {
  it('appends one JSONL line per event with redacted args', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audit-'))
    const path = join(dir, 'audit.jsonl')
    const log = createAuditLog({ path, now: () => 1000 })
    await log.record({
      client: 'alice',
      event: 'tool_call',
      tool: 'buyMovie',
      outcome: 'ok',
      args: { movieId: 'tt1', apiKey: 'nope' },
    })
    const lines = (await readFile(path, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(1)
    const row = JSON.parse(lines[0]!)
    expect(row).toMatchObject({
      time: 1000,
      client: 'alice',
      tool: 'buyMovie',
      outcome: 'ok',
      args: { movieId: 'tt1', apiKey: '[redacted]' },
    })
    expect(JSON.stringify(row)).not.toContain('nope')
  })

  it('prunes lines older than retentionDays on start', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audit-'))
    const path = join(dir, 'audit.jsonl')
    const dayMs = 86_400_000
    const old = JSON.stringify({ time: 0, event: 'old' })
    const fresh = JSON.stringify({ time: 5 * dayMs, event: 'fresh' })
    await writeFile(path, old + '\n' + fresh + '\n')

    const log = createAuditLog({
      path,
      retentionDays: 2,
      now: () => 5 * dayMs,
    })
    await log.record({ event: 'new', outcome: 'ok' })
    const text = await readFile(path, 'utf8')
    expect(text).not.toContain('"old"')
    expect(text).toContain('"fresh"')
    expect(text).toContain('"new"')
  })

  it('rejects an invalid retentionDays before touching the log', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audit-'))
    const path = join(dir, 'audit.jsonl')
    // Seed an existing history that a bad cutoff would wipe.
    await writeFile(path, JSON.stringify({ time: 0, event: 'old' }) + '\n')
    for (const bad of [Number.NaN, -1, Infinity, -Infinity]) {
      expect(() => createAuditLog({ path, retentionDays: bad })).toThrow(
        RangeError,
      )
    }
    // The existing log is untouched because construction threw first.
    expect(await readFile(path, 'utf8')).toContain('"old"')
  })

  it('accepts zero and omitted retentionDays', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audit-'))
    const path = join(dir, 'audit.jsonl')
    expect(() => createAuditLog({ path, retentionDays: 0 })).not.toThrow()
    expect(() => createAuditLog({ path })).not.toThrow()
  })

  it('does not start init until the first record, so a failure cannot float', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audit-'))
    // A path whose parent is an existing file. mkdir is best-effort, but the
    // append then rejects, and that rejection must reach the record() caller
    // rather than surface as an unhandled rejection during construction.
    const file = join(dir, 'a-file')
    await writeFile(file, 'x')
    const log = createAuditLog({ path: join(file, 'audit.jsonl') })
    // Construction did nothing; the first record triggers and surfaces the fault.
    await expect(log.record({ event: 'x', outcome: 'ok' })).rejects.toThrow()
  })
})
