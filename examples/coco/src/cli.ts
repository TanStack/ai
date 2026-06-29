#!/usr/bin/env node
/**
 * Coco — drop-in CLI that wraps a project's dev server with an AI
 * coding-agent chat panel.
 *
 * Usage:
 *   coco                             # `pnpm dev` in cwd, proxy on :7777
 *   coco --port 8080                 # custom proxy port
 *   coco --command "npm run dev"     # custom dev command
 *   coco --target http://localhost:5173  # skip spawning, just inject + proxy
 *   coco --agent claude-code         # default agent (panel can switch later)
 *   coco --mode read-only            # default mode
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { startDevServer } from './dev-runner.ts'
import { startProxyServer } from './proxy.ts'
import { runInit } from './init.ts'
import { DEFAULT_AGENT, isAgentId, isAgentMode } from './agents.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_PORT = 7777
const DEFAULT_COMMAND = 'pnpm dev'

const usage = () => {
  process.stdout.write(`coco — AI coding-agent overlay for your dev server

Usage:
  coco init [--dry-run]   Wire coco/vite into a TanStack Start / Vite project
  coco [options]          Run the reverse-proxy dev overlay

Options (proxy mode):
  --port <n>         Port Coco listens on (default ${DEFAULT_PORT})
  --command <cmd>    Dev-server command (default "${DEFAULT_COMMAND}")
  --target <url>     Existing dev-server URL (skips spawning --command)
  --agent <id>       Default agent: claude-code | codex | gemini-cli | opencode
  --mode <m>         Default permission mode: edit | read-only
  --help             Show this help

For TanStack Start (recommended): \`coco init\` adds the coco/vite plugin to
your vite config and you just run \`pnpm dev\`. The reverse-proxy CLI remains
available for framework-agnostic projects.

The chat panel can change the agent/mode at runtime — these flags only set
the defaults. The selected agent (and edit-mode in particular) writes to
your project's working directory; run inside a git repo.
`)
}

const parseFlags = () => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string' },
      command: { type: 'string' },
      target: { type: 'string' },
      agent: { type: 'string' },
      mode: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (values.help) {
    usage()
    process.exit(0)
  }

  const portStr = values.port ?? String(DEFAULT_PORT)
  const port = Number.parseInt(portStr, 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(
      `--port must be a valid TCP port, got ${JSON.stringify(portStr)}`,
    )
  }

  const command = values.command ?? DEFAULT_COMMAND
  const fixedTarget = values.target
  const defaultAgent = values.agent
  if (defaultAgent !== undefined && !isAgentId(defaultAgent)) {
    throw new Error(
      `--agent must be claude-code | codex | gemini-cli | opencode, got ${JSON.stringify(defaultAgent)}`,
    )
  }
  const defaultMode = values.mode
  if (defaultMode !== undefined && !isAgentMode(defaultMode)) {
    throw new Error(
      `--mode must be "edit" or "read-only", got ${JSON.stringify(defaultMode)}`,
    )
  }

  return { port, command, fixedTarget, defaultAgent, defaultMode }
}

/**
 * Resolve the panel-bundle path. In the workspace dev flow (`pnpm --filter
 * coco dev`) it's `<pkg>/dist/client/client.js`; we also fall back to the
 * source path before the build to surface a helpful error.
 */
const resolveBundlePath = (): { path: string; built: boolean } => {
  // src/cli.ts is at examples/coco/src/cli.ts, so the bundle path is
  // examples/coco/dist/client/client.js — two levels up from HERE.
  const pkgRoot = path.resolve(HERE, '..')
  const built = path.join(pkgRoot, 'dist', 'client', 'client.js')
  return { path: built, built: existsSync(built) }
}

/**
 * Subcommand dispatch. We pull off a leading non-flag arg (e.g. `init`)
 * before handing the remainder to `parseArgs`, since `parseArgs` is strict
 * about unknown positionals.
 */
const handleSubcommand = async (): Promise<boolean> => {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0].startsWith('-')) return false
  const sub = argv[0]
  const rest = argv.slice(1)

  if (sub === 'init') {
    const { values } = parseArgs({
      args: rest,
      options: {
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    })
    if (values.help) {
      process.stdout.write(
        'Usage: coco init [--dry-run]\n\n' +
          "Adds the `coco/vite` plugin to your project's vite config and prints\n" +
          'next steps. Idempotent — safe to re-run.\n',
      )
      process.exit(0)
    }
    const code = await runInit({
      cwd: process.cwd(),
      dryRun: Boolean(values['dry-run']),
    })
    process.exit(code)
  }

  process.stderr.write(`coco: unknown subcommand "${sub}"\n\n`)
  usage()
  process.exit(2)
}

const main = async () => {
  if (await handleSubcommand()) return

  let flags
  try {
    flags = parseFlags()
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n`)
    usage()
    process.exit(2)
  }

  const projectCwd = process.cwd()
  const bundle = resolveBundlePath()
  if (!bundle.built) {
    process.stderr.write(
      `[coco] warning: panel bundle missing at ${bundle.path}.\n` +
        `        Build it once with: pnpm --filter coco build\n`,
    )
  }

  process.stdout.write(`[coco] cwd = ${projectCwd}\n`)
  if (flags.fixedTarget) {
    process.stdout.write(
      `[coco] using existing dev server at ${flags.fixedTarget}\n`,
    )
  } else {
    process.stdout.write(`[coco] starting dev server: ${flags.command}\n`)
  }

  const dev = await startDevServer({
    command: flags.command,
    cwd: projectCwd,
    fixedTarget: flags.fixedTarget,
  })
  process.stdout.write(`[coco] dev server target: ${dev.target}\n`)

  const proxy = await startProxyServer({
    target: dev.target,
    port: flags.port,
    projectCwd,
    clientBundlePath: bundle.path,
  })

  // The default-agent / default-mode flags only feed the CLI banner; the
  // panel reads its own defaults. Surface them so users see them in logs.
  const agent = flags.defaultAgent ?? DEFAULT_AGENT
  const mode = flags.defaultMode ?? 'edit'

  process.stdout.write(
    `\n[coco] 🥥 ready: ${proxy.url}  (agent default: ${agent}, mode: ${mode})\n\n`,
  )

  const shutdown = async (code = 0) => {
    process.stdout.write('\n[coco] shutting down…\n')
    try {
      await proxy.stop()
    } catch {
      // ignore
    }
    if (dev.child && !dev.child.killed) dev.child.kill('SIGTERM')
    process.exit(code)
  }

  process.on('SIGINT', () => void shutdown(0))
  process.on('SIGTERM', () => void shutdown(0))
  if (dev.child) {
    dev.child.on('exit', (code) => {
      process.stdout.write(
        `[coco] dev server exited (${code}); stopping coco.\n`,
      )
      void shutdown(code ?? 0)
    })
  }
}

main().catch((err) => {
  process.stderr.write(
    `[coco] fatal: ${err instanceof Error ? err.stack : String(err)}\n`,
  )
  process.exit(1)
})
