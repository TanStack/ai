#!/usr/bin/env node
/**
 * Reset `examples/coco/sample-apps/simple-app/` back to its checked-in
 * state — undoes any edits a coding-agent (or you) made while playing with
 * Coco, but keeps `node_modules` so the next run doesn't reinstall.
 *
 * Steps:
 *   1. `git restore HEAD -- <simple-app>`  — revert tracked-file edits.
 *   2. `git clean -fd -- <simple-app>`     — drop untracked files (still
 *      respects `.gitignore`, so `node_modules`, `dist`, `.tanstack`,
 *      `.nitro`, etc. are left alone).
 *
 * Run as: `pnpm --filter coco sample:reset` (or `node scripts/reset-sample.mjs`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, '..')
const sampleAbs = path.join(pkgRoot, 'sample-apps', 'simple-app')

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: pkgRoot,
  encoding: 'utf8',
}).trim()
const sampleRel = path.relative(repoRoot, sampleAbs)

if (!existsSync(sampleAbs)) {
  console.error(`[reset-sample] missing: ${sampleAbs}`)
  process.exit(1)
}

const run = (args) => {
  process.stdout.write(`[reset-sample] git ${args.join(' ')}\n`)
  execFileSync('git', args, { cwd: repoRoot, stdio: 'inherit' })
}

try {
  run(['restore', '--source=HEAD', '--staged', '--worktree', '--', sampleRel])
} catch {
  console.error(
    '[reset-sample] git restore failed — has the sample-app been committed yet?',
  )
  process.exit(1)
}

run(['clean', '-fd', '--', sampleRel])

process.stdout.write(
  `[reset-sample] done. (node_modules and other ignored files preserved.)\n`,
)
