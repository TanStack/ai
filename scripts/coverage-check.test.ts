import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('./coverage-check.mjs', import.meta.url))

const temps: Array<string> = []

afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'cov-check-'))
  temps.push(dir)
  return dir
}

function run(
  args: Array<string>,
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env }
  if (!opts.env || !('GITHUB_STEP_SUMMARY' in opts.env)) {
    delete env.GITHUB_STEP_SUMMARY
  }
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd,
    env,
  })
}

function metrics(pct: number) {
  return { statements: pct, branches: pct, functions: pct, lines: pct }
}

function writeSnapshot(dir: string, name: string, pct: number) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(metrics(pct)))
}

function vitestSummary(pct: number, total = 10) {
  const cell = { total, covered: 1, pct }
  return JSON.stringify({
    total: {
      statements: cell,
      branches: cell,
      functions: cell,
      lines: cell,
    },
  })
}

function writePkg(
  root: string,
  dirName: string,
  summary: string,
  pkgName = `@tanstack/${dirName}`,
) {
  mkdirSync(join(root, 'packages', dirName, 'coverage'), { recursive: true })
  writeFileSync(
    join(root, 'packages', dirName, 'package.json'),
    JSON.stringify({ name: pkgName }),
  )
  writeFileSync(
    join(root, 'packages', dirName, 'coverage', 'coverage-summary.json'),
    summary,
  )
}

describe('usage', () => {
  it('exits 2 when --base or --head is missing', () => {
    const r = run([])
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Usage:/)
  })
})

describe('compare', () => {
  it('fails only when a metric falls from 60% or more to under 60%', () => {
    const base = tmp()
    const head = tmp()
    writeSnapshot(base, 'pkg', 90)
    writeSnapshot(head, 'pkg', 60)
    expect(run(['--base', base, '--head', head]).status).toBe(0)

    writeSnapshot(base, 'pkg', 60)
    writeSnapshot(head, 'pkg', 59.99)
    const r = run(['--base', base, '--head', head])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/pkg statements: 60\.00% -> 59\.99%/)
    expect(r.stdout).toMatch(/FAIL/)
  })

  it('passes a package that is already under 60%, even when it drops', () => {
    const base = tmp()
    const head = tmp()
    writeSnapshot(base, 'low', 59)
    writeSnapshot(head, 'low', 20)
    const r = run(['--base', base, '--head', head])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/low +20\.00% \(-39\.00\)/)
  })

  it('fails when only branches fall under 60%', () => {
    const base = tmp()
    const head = tmp()
    mkdirSync(base, { recursive: true })
    mkdirSync(head, { recursive: true })
    writeFileSync(
      join(base, 'pkg.json'),
      JSON.stringify({
        statements: 90,
        branches: 61,
        functions: 90,
        lines: 90,
      }),
    )
    writeFileSync(
      join(head, 'pkg.json'),
      JSON.stringify({
        statements: 70,
        branches: 59,
        functions: 90,
        lines: 90,
      }),
    )
    const r = run(['--base', base, '--head', head])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/pkg branches: 61\.00% -> 59\.00%/)
    expect(r.stderr).not.toMatch(/statements/)
  })

  it('treats a head-only package as new and exits 0', () => {
    const base = tmp()
    const head = tmp()
    mkdirSync(base, { recursive: true })
    writeSnapshot(head, 'ai-new', 12)
    const r = run(['--base', base, '--head', head])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/\bnew\b/)
    expect(r.stdout).toMatch(/nothing to compare against/)
    expect(r.stdout).not.toMatch(/Coverage held/)
  })

  it('fails when a package was measured on base but not on head', () => {
    const base = tmp()
    const head = tmp()
    writeSnapshot(base, 'ai-old', 90)
    writeSnapshot(head, 'other', 90)
    const r = run(['--base', base, '--head', head])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/ai-old: measured on base, missing on this PR/)
  })

  it('fails when head measured nothing', () => {
    const base = tmp()
    const head = tmp()
    mkdirSync(base, { recursive: true })
    mkdirSync(head, { recursive: true })
    const r = run(['--base', base, '--head', head])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/nothing to compare/)
  })

  it('writes the step summary on a failing run', () => {
    const base = tmp()
    const head = tmp()
    const summary = join(tmp(), 'summary.md')
    writeSnapshot(base, 'pkg', 90)
    writeSnapshot(head, 'pkg', 50)
    const r = run(['--base', base, '--head', head], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    })
    expect(r.status).toBe(1)
    const md = readFileSync(summary, 'utf8')
    expect(md).toMatch(/Coverage fell under 60%/)
    expect(md).toMatch(/pkg/)
  })

  it('writes the same table to --report, with the comment marker first', () => {
    const base = tmp()
    const head = tmp()
    const report = join(tmp(), 'report.md')
    writeSnapshot(base, 'pkg', 90)
    writeSnapshot(head, 'pkg', 85)
    const r = run(['--base', base, '--head', head, '--report', report])
    expect(r.status).toBe(0)
    const md = readFileSync(report, 'utf8')
    expect(md.split('\n')[0]).toBe('<!-- coverage-report -->')
    expect(md).toMatch(/\| pkg \| 85\.00% \(-5\.00\) \|/)
  })
})

describe('collect', () => {
  it('writes pct-only snapshots and skips packages with no summary', () => {
    const root = tmp()
    const out = join(root, 'out')
    writePkg(root, 'ai', vitestSummary(90))
    mkdirSync(join(root, 'packages', 'empty'), { recursive: true })
    writeFileSync(
      join(root, 'packages', 'empty', 'package.json'),
      JSON.stringify({ name: '@tanstack/empty' }),
    )
    const r = run(['--collect', out], { cwd: root })
    expect(r.status).toBe(0)
    const written = JSON.parse(readFileSync(join(out, 'ai.json'), 'utf8'))
    expect(written).toEqual(metrics(90))
    expect(r.stdout).toMatch(/Collected 1 /)
  })

  it('fails --expect when a named package has no summary', () => {
    const root = tmp()
    const out = join(root, 'out')
    writePkg(root, 'ai', vitestSummary(90))
    const r = run(['--collect', out, '--expect', 'ai,missing-pkg'], {
      cwd: root,
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/missing-pkg/)
  })

  it('fails --expect when statements.total is 0', () => {
    const root = tmp()
    const out = join(root, 'out')
    writePkg(root, 'empty', vitestSummary(100, 0))
    const r = run(['--collect', out, '--expect', 'empty'], { cwd: root })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/0 statements/)
  })

  it('resolves @tanstack scoped names to the package directory', () => {
    const root = tmp()
    const out = join(root, 'out')
    writePkg(
      root,
      'ai-devtools',
      vitestSummary(81),
      '@tanstack/ai-devtools-core',
    )
    const r = run(
      ['--collect', out, '--expect', '@tanstack/ai-devtools-core'],
      { cwd: root },
    )
    expect(r.status).toBe(0)
    expect(existsSync(join(out, 'ai-devtools.json'))).toBe(true)
  })
})
