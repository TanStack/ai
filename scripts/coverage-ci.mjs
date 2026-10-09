// HEAD coverage runs in the main agent graph. Base work can start immediately.
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function runCoverage({
  mode = 'compare',
  root = process.cwd(),
  env = process.env,
  exec = execFileSync,
} = {}) {
  const output = join(root, '.nx/pr-artifacts/coverage')
  const baseOutput = join(root, '.nx/pr-artifacts/coverage-base')
  const script = join(root, 'scripts/coverage-check.mjs')
  // Keep remote replay enabled for nested commands without
  // distributing the base revision or starting another agent pool.
  const localEnv = {
    ...env,
    NX_NO_CLOUD: 'false',
    NX_CLOUD_DISTRIBUTED_EXECUTION: 'false',
  }
  const run = (command, args, cwd = root, capture = false) =>
    exec(command, args, {
      cwd,
      env: localEnv,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    })
  const nx = (args, cwd = root, capture = false) =>
    run('pnpm', ['exec', 'nx', ...args], cwd, capture)
  const collect = (cwd, destination, projects) =>
    run(
      process.execPath,
      [script, '--collect', destination, '--expect', projects],
      cwd,
    )

  if (!env.CI) throw new Error('Coverage runs in CI only.')
  if (!/^[a-f0-9]{40}$/i.test(env.NX_BASE ?? ''))
    throw new Error('NX_BASE must contain the base commit SHA.')
  if (!['base', 'compare'].includes(mode))
    throw new Error('Invalid coverage mode')

  if (mode === 'base') {
    rmSync(baseOutput, { recursive: true, force: true })
    mkdirSync(join(baseOutput, 'summary'), { recursive: true })
    run('git', ['fetch', '--no-tags', '--depth=1', 'origin', env.NX_BASE])
    const projects = JSON.parse(
      nx(
        [
          'show',
          'projects',
          '--affected',
          '--with-target=test:coverage',
          '--exclude=examples/**,testing/**',
          '--json',
        ],
        root,
        true,
      ),
    ).sort()
    writeFileSync(join(baseOutput, 'projects.json'), JSON.stringify(projects))
    if (projects.length === 0) return
    const temporary = mkdtempSync(join(tmpdir(), 'ai-coverage-'))
    const baseRoot = join(temporary, 'base')
    let worktreeCreated = false
    try {
      run('git', ['worktree', 'add', '--detach', baseRoot, env.NX_BASE])
      worktreeCreated = true
      run('pnpm', ['install', '--frozen-lockfile'], baseRoot)
      if (env.NX_CI_CACHE_BUST)
        run(
          process.execPath,
          [join(root, 'scripts/ci-cache-bust.mjs')],
          baseRoot,
        )
      const available = new Set(
        JSON.parse(
          nx(
            ['show', 'projects', '--with-target=test:coverage', '--json'],
            baseRoot,
            true,
          ),
        ),
      )
      const baseProjects = projects.filter((name) => available.has(name))
      if (baseProjects.length > 0) {
        nx(
          [
            'run-many',
            '--targets=test:coverage',
            `--projects=${baseProjects.join(',')}`,
            '--outputStyle=static',
            '--',
            '--coverage.reporter=json-summary',
            '--coverage.include=src/**',
          ],
          baseRoot,
        )
        collect(baseRoot, join(baseOutput, 'summary'), baseProjects.join(','))
      }
    } finally {
      try {
        if (worktreeCreated)
          run('git', ['worktree', 'remove', '--force', baseRoot])
      } finally {
        rmSync(temporary, { recursive: true, force: true })
      }
    }
    return
  }

  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  let status = 1
  let measured = false
  let temporary
  try {
    const projects = JSON.parse(
      readFileSync(join(baseOutput, 'projects.json'), 'utf8'),
    )
    measured = projects.length > 0
    if (!measured) {
      status = 0
      return
    }
    temporary = mkdtempSync(join(tmpdir(), 'ai-coverage-head-'))
    // Graph dependencies restored the HEAD summaries; never rerun their tests.
    collect(root, temporary, projects.join(','))
    run(process.execPath, [
      script,
      '--base',
      join(baseOutput, 'summary'),
      '--head',
      temporary,
      '--report',
      join(output, 'report.md'),
    ])
    status = 0
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true })
    writeFileSync(
      join(output, 'result.json'),
      JSON.stringify({ status, measured }),
    )
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runCoverage({ mode: process.argv[2] })
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
