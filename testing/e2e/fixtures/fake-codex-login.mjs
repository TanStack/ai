// A fake `codex` CLI for the `/connect:codex` E2E scenario. It needs no
// network and no ChatGPT account.
// - `login --device-auth`: prints a device URL and code, then writes
//   `$CODEX_HOME/auth.json`.
// - `logout`: removes `$CODEX_HOME/auth.json`.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const codexHome = process.env.CODEX_HOME
if (!codexHome) {
  console.error('CODEX_HOME is not set.')
  process.exit(1)
}
const authFile = join(codexHome, 'auth.json')
const command = process.argv.slice(2).join(' ')

if (command === 'login --device-auth') {
  console.log('Open https://auth.example.com/device and enter ABCD-1234')
  await mkdir(codexHome, { recursive: true })
  await writeFile(authFile, '{}')
} else if (command === 'logout') {
  await rm(authFile, { force: true })
} else {
  console.error(`Unknown command: ${command}`)
  process.exit(1)
}
