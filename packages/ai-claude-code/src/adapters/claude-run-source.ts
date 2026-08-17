/** Written into the sandbox and run with `node` so --json-schema is a real argv value. */
export const CLAUDE_RUNNER_SOURCE = `import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const argv = JSON.parse(process.argv[2])
const schemaFile = process.argv[3]
if (schemaFile) {
  const schema = readFileSync(schemaFile, 'utf8')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '__TANSTACK_SCHEMA__') argv[i] = schema
  }
}

const [cmd, ...args] = argv
if (!cmd) {
  console.error('tanstack-claude-run: missing command')
  process.exit(1)
}

const child = spawn(cmd, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
  windowsHide: true,
})
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
