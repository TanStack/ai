import { spawn } from 'node:child_process'
import { CliError } from '../core/exit-codes'

const PKG = '@tanstack/ai-cli'

/**
 * `ts-ai update` — upgrade to the latest published version using whichever
 * package manager appears to have installed the binary. Under npx/dlx there is
 * nothing to update (each run already fetches on demand).
 */
export async function runUpdate(): Promise<void> {
  const agent = process.env.npm_config_user_agent ?? ''

  if (isOnDemand()) {
    process.stderr.write(
      `You're running ${PKG} on-demand (npx/dlx) — each invocation already uses the latest. Nothing to update.\n`,
    )
    return
  }

  const { cmd, args } = upgradeCommand(agent)
  process.stderr.write(`Updating ${PKG} via: ${cmd} ${args.join(' ')}\n`)
  const status = await runProcess(cmd, args)
  if (status !== 0) {
    throw new CliError('RUNTIME', `Update failed (${cmd} exited with ${status ?? 'signal'}).`)
  }
}

function runProcess(cmd: string, args: Array<string>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code))
  })
}

function isOnDemand(): boolean {
  const execPath = process.env.npm_execpath ?? ''
  return execPath.includes('_npx') || (process.env.npm_command === 'exec')
}

function upgradeCommand(agent: string): { cmd: string; args: Array<string> } {
  const target = `${PKG}@latest`
  if (agent.startsWith('pnpm')) return { cmd: 'pnpm', args: ['add', '-g', target] }
  if (agent.startsWith('yarn')) return { cmd: 'yarn', args: ['global', 'add', target] }
  if (agent.startsWith('bun')) return { cmd: 'bun', args: ['add', '-g', target] }
  return { cmd: 'npm', args: ['install', '-g', target] }
}
