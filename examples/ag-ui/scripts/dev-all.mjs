import { spawn } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import {
  detectServers,
  exampleDir,
  logDetectionSummary,
  writeServersJson,
} from './servers.mjs'

loadEnv({ path: `${exampleDir}/.env`, quiet: true })

const detected = detectServers()
writeServersJson()
logDetectionSummary(detected)

const available = detected.filter((server) => server.available)
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const names = ['client', ...available.map((server) => server.id)]
const colors = [
  'cyan',
  'green',
  'yellow',
  'magenta',
  'blue',
  'red',
  'white',
].slice(0, names.length)
const commands = [
  'pnpm dev',
  ...available.map((server) => `pnpm ${server.devScript}`),
]

const args = [
  'exec',
  'concurrently',
  '-n',
  names.join(','),
  '-c',
  colors.join(','),
]
for (const command of commands) {
  args.push(command)
}

console.log(
  `[ag-ui] starting ${commands.length} process(es): ${names.join(', ')}`,
)

const child = spawn(pnpm, args, {
  cwd: exampleDir,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
