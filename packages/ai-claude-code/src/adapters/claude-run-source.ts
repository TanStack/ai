/** Placeholder swapped for the schema JSON after the runner reads the files. */
export const /** Placeholder swapped for the schema JSON after the runner reads the files. */
CLAUDE_JSON_SCHEMA_PLACEHOLDER = '__TANSTACK_SCHEMA__'

/**
 * Written into the sandbox and run with `node`.
 *
 * The shell only sees two filenames. The runner reads the argv array and the
 * schema JSON from those files, then spawn()s claude so `--json-schema` is a
 * real argv value (the CLI rejects a file path).
 *
 * On Windows, `claude` is often a `.cmd` shim. `spawn(cmd, args)` without a
 * shell cannot find that shim, so we go through `sh` with `"$0"` / `"$@"`
 * (git-bash is already on PATH in the local-process sandbox).
 */
export const CLAUDE_RUNNER_SOURCE = `import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const argvFile = process.argv[2]
if (!argvFile) {
  console.error('tanstack-claude-run: missing argv file')
  process.exit(1)
}

const argv = JSON.parse(readFileSync(argvFile, 'utf8'))
if (!Array.isArray(argv)) {
  console.error('tanstack-claude-run: argv file must be a JSON array')
  process.exit(1)
}

const schemaFile = process.argv[3]
if (schemaFile) {
  const schema = readFileSync(schemaFile, 'utf8')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === ${JSON.stringify(CLAUDE_JSON_SCHEMA_PLACEHOLDER)}) argv[i] = schema
  }
}

const [cmd, ...args] = argv
if (typeof cmd !== 'string' || cmd === '') {
  console.error('tanstack-claude-run: missing command')
  process.exit(1)
}

const opts = {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
  windowsHide: true,
}

const child =
  process.platform === 'win32'
    ? spawn('sh', ['-c', 'exec "$0" "$@"', cmd, ...args], opts)
    : spawn(cmd, args, opts)

process.stdin.pipe(child.stdin)
child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)
child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
`
