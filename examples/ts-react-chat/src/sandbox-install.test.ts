import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { HARNESSES, buildSandbox } from './sandbox-triage'
import type { HarnessName } from './sandbox-triage'

/**
 * Guards the sandbox CLI-install commands.
 *
 * The bug this locks down: the setup step used to splice each `installCommand`
 * into a bigger command (`<cmd> || sudo -n env "PATH=$PATH" <cmd>`). Grok's
 * installer starts with `(`, and a subshell is not a valid argument to
 * `sudo`/`env`, so `sh` failed at PARSE time — `sh: syntax error: unexpected
 * "("`, exit 2 — and the install never ran at all.
 */

const HARNESS_NAMES = Object.keys(HARNESSES) as Array<HarnessName>

/** A real POSIX shell to parse with; `sh` on Linux/macOS, git-bash's on Windows. */
const SHELL = ['sh', 'bash'].find((candidate) => {
  const probe = spawnSync(candidate, ['-c', 'exit 0'], { stdio: 'ignore' })
  return probe.status === 0
})

/** Setup commands the sandbox definition actually runs, in order. */
function setupCommands(harness: HarnessName): Array<string> {
  const { workspace } = buildSandbox({
    harness,
    // Any sandboxed provider: `local` skips the install (host CLI is on PATH).
    provider: 'docker',
    repo: 'TanStack/ai',
    threadId: 'test',
  })
  const setup = workspace?.setup
  if (typeof setup !== 'function') {
    throw new Error('expected a setup builder function')
  }
  const commands: Array<string> = []
  setup({
    serial: (command) => commands.push(command),
    parallel: (group) => commands.push(...group),
  })
  return commands
}

describe('sandbox CLI install commands', () => {
  it.each(HARNESS_NAMES)('%s installs and verifies its CLI', (harness) => {
    const command = HARNESSES[harness].installCommand
    expect(command).toBeTruthy()
    // Every install must RUN the CLI: npm treats the platform-specific native
    // binary (an optional dep) as best-effort, so a "successful" install can
    // still leave a CLI that dies at run time.
    expect(command).toMatch(/--version/)
  })

  it.each(HARNESS_NAMES)('%s runs its command unwrapped', (harness) => {
    expect(setupCommands(harness)).toEqual([HARNESSES[harness].installCommand])
  })

  it.runIf(SHELL !== undefined).each(HARNESS_NAMES)(
    '%s parses as a shell command',
    (harness) => {
      const command = HARNESSES[harness].installCommand
      if (SHELL === undefined || command === null) return
      // `-n`: parse only, run nothing. Throws with the shell's syntax error.
      expect(() =>
        execFileSync(SHELL, ['-n', '-c', command], { stdio: 'pipe' }),
      ).not.toThrow()
    },
  )
})
