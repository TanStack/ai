import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'

const exampleDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
loadEnv({ path: path.join(exampleDir, '.env'), quiet: true })

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = spawn(
  pnpm,
  [
    'exec',
    'concurrently',
    '-n',
    'client,go,rust',
    '-c',
    'cyan,green,yellow',
    'pnpm dev',
    'pnpm dev:go',
    'pnpm dev:rust',
  ],
  {
    cwd: exampleDir,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
