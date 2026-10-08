// Runs the existing two-revision coverage gate inside one Nx Agent task.
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function runCoverage({
  root = process.cwd(),
  env = process.env,
  exec = execFileSync,
} = {}) {
  const output = join(root, '.nx/pr-artifacts/coverage')
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  let status = 1
  let measured = false
  let temporary
  let baseRoot
  let worktreeCreated = false
  // Inner Nx commands run on this agent, using the shared remote cache. They
  // must not start another distributed run or submit work back to this pool.
  const localEnv = { ...env, NX_CLOUD_DISTRIBUTED_EXECUTION: 'false' }
  const run = (command, args, cwd = root, capture = false) =>
    exec(command, args, {
      cwd,
      env: localEnv,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    })
  const nx = (args, cwd = root, capture = false) =>
    run('pnpm', ['exec', 'nx', ...args], cwd, capture)
  const script = join(root, 'scripts/coverage-check.mjs')
  const collect = (cwd, destination, projects) =>
    run(
      process.execPath,
      [script, '--collect', destination, '--expect', projects],
      cwd,
    )
  const measure = (cwd, projects) => {
    // Remove any unit-test/cache summaries before measuring this revision.
    for (const entry of readdirSync(join(cwd, 'packages'), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory())
        rmSync(join(cwd, 'packages', entry.name, 'coverage'), {
          recursive: true,
          force: true,
        })
    }
    nx(
      [
        'run-many',
        '--targets=test:coverage',
        `--projects=${projects}`,
        '--no-agents',
        '--outputStyle=static',
        '--',
        '--coverage.reporter=json-summary',
        '--coverage.include=src/**',
      ],
      cwd,
    )
  }
  try {
    if (!env.CI) throw new Error('Coverage runs in CI only.')
    if (!/^[a-f0-9]{40}$/i.test(env.NX_BASE ?? ''))
      throw new Error('NX_BASE must contain the base commit SHA.')
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
    if (projects.length === 0) {
      status = 0
      return
    }
    measured = true
    temporary = mkdtempSync(join(tmpdir(), 'ai-coverage-'))
    baseRoot = join(temporary, 'base')
    const headSummary = join(temporary, 'head-summary')
    const baseSummary = join(temporary, 'base-summary')
    measure(root, projects.join(','))
    collect(root, headSummary, projects.join(','))
    run('git', ['worktree', 'add', '--detach', baseRoot, env.NX_BASE])
    worktreeCreated = true
    run('pnpm', ['install', '--frozen-lockfile'], baseRoot)
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
    mkdirSync(baseSummary, { recursive: true })
    if (baseProjects.length > 0) {
      measure(baseRoot, baseProjects.join(','))
      collect(baseRoot, baseSummary, baseProjects.join(','))
    }
    run(process.execPath, [
      script,
      '--base',
      baseSummary,
      '--head',
      headSummary,
      '--report',
      join(output, 'report.md'),
    ])
    status = 0
  } finally {
    try {
      if (worktreeCreated)
        run('git', ['worktree', 'remove', '--force', baseRoot])
      if (temporary) rmSync(temporary, { recursive: true, force: true })
    } catch (error) {
      status = 1
      throw error
    } finally {
      // Keep a result artifact even if a suite, comparison, or cleanup failed.
      writeFileSync(
        join(output, 'result.json'),
        JSON.stringify({ status, measured }),
      )
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runCoverage()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
