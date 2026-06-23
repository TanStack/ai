/**
 * Local dev with a Cloudflare quick tunnel — so the in-sandbox agent's container
 * can reach this Worker's `/_bridge` MCP endpoint while you run locally.
 *
 * The agent runs inside a Cloudflare Container. It reaches the host over
 * `PUBLIC_HOSTNAME` for the `tanstack` MCP tool-bridge — but a local `vite dev`
 * worker (on localhost) isn't reachable from that container. `cloudflared` fixes
 * that: it exposes the local worker on a public `*.trycloudflare.com` hostname the
 * container CAN reach, and we point `PUBLIC_HOSTNAME` at it.
 *
 * Flow: start `cloudflared tunnel --url http://localhost:<PORT>`, grab the assigned
 * hostname, write it to `.dev.vars` as `PUBLIC_HOSTNAME`, then start `vite dev`.
 *
 * Prereq: `cloudflared` on your PATH (`brew install cloudflared`).
 *
 * NOTE: a quick tunnel serves ONE hostname, not a wildcard — so this fixes the
 * tool-bridge (a single `/_bridge` path) and lets agent runs work, but sandbox
 * PREVIEW URLs (`<port>-<id>-<token>.<host>`) still need a NAMED tunnel with a
 * wildcard DNS route (see the README).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const PORT = 3001
const DEV_VARS = new URL('../.dev.vars', import.meta.url).pathname

/** Replace (or add) a single `KEY=value` line in `.dev.vars`, keeping the rest. */
function upsertDevVar(key, value) {
  const existing = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, 'utf8') : ''
  const kept = existing
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith(`${key}=`))
  writeFileSync(DEV_VARS, [...kept, `${key}=${value}`].join('\n') + '\n')
}

console.log('[dev-tunnel] starting cloudflared quick tunnel…')
const cf = spawn(
  'cloudflared',
  ['tunnel', '--url', `http://localhost:${PORT}`],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

let viteStarted = false

function onTunnelOutput(buffer) {
  const match = String(buffer).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  if (!match || viteStarted) return
  viteStarted = true

  const host = match[0].replace(/^https:\/\//, '')
  console.log(`[dev-tunnel] tunnel up: ${match[0]}`)
  console.log(`[dev-tunnel] PUBLIC_HOSTNAME=${host} → .dev.vars`)
  upsertDevVar('PUBLIC_HOSTNAME', host)

  const vite = spawn('pnpm', ['exec', 'vite', 'dev', '--port', String(PORT)], {
    stdio: 'inherit',
  })
  vite.on('exit', (code) => {
    cf.kill()
    process.exit(code ?? 0)
  })
}

cf.stdout.on('data', onTunnelOutput)
cf.stderr.on('data', onTunnelOutput)
cf.on('error', (error) => {
  console.error(
    `[dev-tunnel] could not start cloudflared (is it installed?): ${error.message}`,
  )
  process.exit(1)
})
cf.on('exit', (code) => {
  if (!viteStarted) {
    console.error(
      `[dev-tunnel] cloudflared exited (code ${code}) before a tunnel URL appeared.`,
    )
    process.exit(1)
  }
})
process.on('SIGINT', () => {
  cf.kill()
  process.exit(0)
})
