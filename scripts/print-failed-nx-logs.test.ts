import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(
  new URL('./print-failed-nx-logs.mjs', import.meta.url),
)

const temps: Array<string> = []

afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'nx-logs-'))
  temps.push(dir)
  return dir
}

function run(cache: string, data: string) {
  return spawnSync(
    process.execPath,
    [
      '--disable-warning=ExperimentalWarning',
      SCRIPT,
      '--cache',
      cache,
      '--data',
      data,
    ],
    { encoding: 'utf8' },
  )
}

function fixture() {
  const root = tmp()
  const cache = join(root, 'cache')
  const data = join(root, 'data')
  mkdirSync(join(cache, 'terminalOutputs'), { recursive: true })
  mkdirSync(data, { recursive: true })
  writeFileSync(
    join(cache, 'terminalOutputs', 'failed-hash'),
    'FAIL marker from the failing test\n',
  )
  writeFileSync(
    join(cache, 'terminalOutputs', 'ok-hash'),
    'PASS this task succeeded\n',
  )
  const db = new DatabaseSync(join(data, 'cache.db'))
  db.exec(`
    CREATE TABLE cache_outputs (
      hash TEXT PRIMARY KEY NOT NULL,
      code INTEGER NOT NULL,
      size INTEGER NOT NULL
    );
    CREATE TABLE task_details (
      hash TEXT PRIMARY KEY NOT NULL,
      project TEXT NOT NULL,
      target TEXT NOT NULL,
      configuration TEXT
    );
  `)
  db.prepare(
    'INSERT INTO cache_outputs (hash, code, size) VALUES (?, ?, ?)',
  ).run('ok-hash', 0, 1)
  db.prepare(
    'INSERT INTO task_details (hash, project, target, configuration) VALUES (?, ?, ?, ?)',
  ).run('failed-hash', '@tanstack/ai-harness', 'test:coverage', null)
  db.close()
  return { cache, data }
}

describe('print-failed-nx-logs', () => {
  it('prints the failed task log and skips a cached success', () => {
    const { cache, data } = fixture()
    const result = run(cache, data)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'failed Nx task @tanstack/ai-harness:test:coverage',
    )
    expect(result.stdout).toContain('FAIL marker from the failing test')
    expect(result.stdout).not.toContain('PASS this task succeeded')
  })

  it('prints a task stored with a non-zero code', () => {
    const { cache, data } = fixture()
    const db = new DatabaseSync(join(data, 'cache.db'))
    db.prepare(
      'INSERT INTO cache_outputs (hash, code, size) VALUES (?, ?, ?)',
    ).run('failed-hash', 1, 1)
    db.close()
    const result = run(cache, data)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('FAIL marker from the failing test')
  })

  it('exits 0 when the terminal output directory is missing', () => {
    const root = tmp()
    const result = run(join(root, 'cache'), join(root, 'data'))
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('No Nx terminal output directory')
  })
})
