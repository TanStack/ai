#!/usr/bin/env node
/**
 * Codemod runner.
 *
 * Resolves user-supplied glob/file arguments against the original
 * `INIT_CWD` (the directory the user ran `pnpm` from) instead of the
 * package directory pnpm switches into when `--filter ... exec` is used.
 *
 * Usage (from the repo root):
 *   pnpm codemod:ag-ui-compliance "src/**\/*.{ts,tsx}"
 *
 * The first argument is the codemod folder name under `codemods/`.
 * The remainder are jscodeshift's own arguments (paths and flags).
 */
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const here = dirname(fileURLToPath(import.meta.url))
const [codemodName, ...rest] = process.argv.slice(2)

if (!codemodName) {
  console.error('Usage: codemod-runner <codemod-name> [jscodeshift args...]')
  process.exit(2)
}

const transformPath = resolve(here, codemodName, 'transform.ts')
// `INIT_CWD` is set by pnpm to the directory the user ran `pnpm` from
// (preserved across `--filter ... exec`). Fall back to the parent shell's
// CWD if the runner is invoked outside pnpm.
const userCwd = process.env['INIT_CWD'] || process.cwd()

// Resolve any positional path-like argument against `userCwd`. Flag
// arguments (start with `-`) are passed through untouched.
const args = ['--parser=tsx', '-t', transformPath]
for (const arg of rest) {
  if (arg.startsWith('-') || isAbsolute(arg)) {
    args.push(arg)
  } else {
    args.push(resolve(userCwd, arg))
  }
}

const result = spawnSync('jscodeshift', args, {
  cwd: here,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
