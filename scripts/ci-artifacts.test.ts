import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { runCoverage } from './coverage-ci.mjs'
import { packPreview } from './preview-ci.mjs'

const temporary: Array<string> = []
const baseSha = 'a'.repeat(40)

afterEach(() => {
  for (const root of temporary.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'ai-ci-test-'))
  temporary.push(root)
  mkdirSync(join(root, 'packages'))
  return root
}

it('does not measure coverage locally or when no package is affected', () => {
  const root = workspace()
  const calls: Array<Array<string>> = []
  const exec = (_command: string, args: Array<string>) => {
    calls.push(args)
    return '[]'
  }
  expect(() => runCoverage({ root, env: {}, exec })).toThrow('CI only')
  expect(calls).toEqual([])
  runCoverage({ root, env: { CI: 'true', NX_BASE: baseSha }, exec })
  expect(calls.some((args) => args.includes('run-many'))).toBe(false)
  expect(
    JSON.parse(
      readFileSync(join(root, '.nx/pr-artifacts/coverage/result.json'), 'utf8'),
    ),
  ).toEqual({ status: 0, measured: false })
})

it.each([false, true])(
  'isolates revisions, intersects packages, and cleans up on compare failure: %s',
  (fail) => {
    const root = workspace()
    mkdirSync(join(root, 'packages/ai/coverage'), { recursive: true })
    writeFileSync(join(root, 'packages/ai/coverage/stale.json'), 'stale')
    const calls: Array<{ command: string; args: Array<string>; cwd: string }> =
      []
    const exec = (
      command: string,
      args: Array<string>,
      options: { cwd: string; env: NodeJS.ProcessEnv },
    ) => {
      calls.push({ command, args, cwd: options.cwd })
      expect(options.env.NX_CLOUD_DISTRIBUTED_EXECUTION).toBe('false')
      if (args.includes('show'))
        return JSON.stringify(
          args.includes('--affected')
            ? ['@tanstack/ai', '@tanstack/new']
            : ['@tanstack/ai'],
        )
      if (args[0] === 'worktree' && args[1] === 'add')
        mkdirSync(join(args[3]!, 'packages'), { recursive: true })
      if (args.includes('--base') && fail)
        throw new Error('Coverage regression')
      return ''
    }
    const run = () =>
      runCoverage({ root, env: { CI: 'true', NX_BASE: baseSha }, exec })
    if (fail) expect(run).toThrow('Coverage regression')
    else run()
    const measurements = calls.filter(({ args }) => args.includes('run-many'))
    expect(measurements).toHaveLength(2)
    expect(measurements[0]!.cwd).toBe(root)
    expect(measurements[1]!.cwd).not.toBe(root)
    expect(measurements[0]!.args).toContain(
      '--projects=@tanstack/ai,@tanstack/new',
    )
    expect(measurements[1]!.args).toContain('--projects=@tanstack/ai')
    for (const { args } of measurements) {
      expect(args).toContain('--no-agents')
      expect(args.slice(args.indexOf('--') + 1)).toEqual([
        '--coverage.reporter=json-summary',
        '--coverage.include=src/**',
      ])
    }
    // Both collectors use this PR's comparator, even on the base checkout.
    for (const call of calls.filter(({ args }) => args.includes('--collect')))
      expect(call.args[0]).toBe(join(root, 'scripts/coverage-check.mjs'))
    expect(calls.at(-1)!.args.slice(0, 3)).toEqual([
      'worktree',
      'remove',
      '--force',
    ])
    expect(
      JSON.parse(
        readFileSync(
          join(root, '.nx/pr-artifacts/coverage/result.json'),
          'utf8',
        ),
      ),
    ).toEqual({ status: fail ? 1 : 0, measured: true })
  },
)

it('archives public builds for another runner and rejects missing builds', () => {
  const root = workspace()
  mkdirSync(join(root, 'packages/ai/dist'), { recursive: true })
  writeFileSync(
    join(root, 'packages/ai/package.json'),
    JSON.stringify({ name: '@tanstack/ai' }),
  )
  writeFileSync(join(root, 'packages/ai/dist/index.js'), 'export {}')
  mkdirSync(join(root, 'packages/source-only'))
  writeFileSync(
    join(root, 'packages/source-only/package.json'),
    JSON.stringify({ files: ['src'] }),
  )
  packPreview(root)
  const archive = join(root, '.nx/pr-artifacts/preview-builds.tar.gz')
  const restored = workspace()
  execFileSync('tar', ['-xzf', archive, '-C', restored])
  expect(
    readFileSync(join(restored, 'packages/ai/dist/index.js'), 'utf8'),
  ).toBe('export {}')
  mkdirSync(join(root, 'packages/unbuilt'))
  writeFileSync(join(root, 'packages/unbuilt/package.json'), '{}')
  expect(() => packPreview(root)).toThrow(
    'No build outputs for packages/unbuilt',
  )
})
