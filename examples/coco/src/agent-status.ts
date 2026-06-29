/**
 * Node-side credential + install probe for each agent harness.
 *
 * Reports two things per agent:
 *
 * - `installed`  — the CLI binary is on `process.env.PATH` (cross-OS lookup,
 *   honoring `PATHEXT` on Windows). The panel uses this to decide whether to
 *   mount at all and which agents to list in the selector.
 * - `configured` — credentials look plausible (env vars or known config
 *   files). Drives the "needs setup" hint inside the panel.
 *
 * Lives in its own module (separate from `agents.ts`) so the browser-side
 * panel bundle can pull in agent constants without dragging Node built-ins.
 */
import { access, constants } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AGENT_BIN } from './agents.ts'
import type { AgentId } from './agents.ts'

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

const isExecutable = async (p: string): Promise<boolean> => {
  try {
    await access(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const WINDOWS_EXTS = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
  .split(';')
  .map((e) => e.toLowerCase())
  .filter((e) => e.startsWith('.'))

const PATH_EXTS = process.platform === 'win32' ? WINDOWS_EXTS : ['']

/**
 * Cross-OS PATH lookup. Returns true if `bin` resolves to an executable in
 * any directory listed in `process.env.PATH`. On Windows we also try each
 * `PATHEXT` extension; on POSIX we rely on the +x bit via `access(X_OK)`.
 */
export const findOnPath = async (bin: string): Promise<boolean> => {
  const raw = process.env.PATH ?? ''
  if (!raw) return false
  const dirs = raw.split(path.delimiter).filter(Boolean)
  for (const dir of dirs) {
    for (const ext of PATH_EXTS) {
      const candidate = path.join(dir, bin + ext)
      if (process.platform === 'win32') {
        if (await fileExists(candidate)) return true
      } else if (await isExecutable(candidate)) {
        return true
      }
    }
  }
  return false
}

export interface AgentStatus {
  /** CLI binary is on PATH (or, in the case of `codex`, ships with the SDK). */
  installed: boolean
  /** Credentials look plausible (env vars / known config files). */
  configured: boolean
}

export type AgentStatusMap = Record<AgentId, AgentStatus>

const detectConfigured = async (): Promise<Record<AgentId, boolean>> => {
  const home = os.homedir()
  const env = process.env

  const claudeCode =
    Boolean(env.ANTHROPIC_API_KEY) ||
    Boolean(env.CLAUDE_CODE_OAUTH_TOKEN) ||
    (await fileExists(path.join(home, '.claude.json')))

  const codex =
    Boolean(env.OPENAI_API_KEY) ||
    Boolean(env.CODEX_API_KEY) ||
    (await fileExists(path.join(home, '.codex', 'auth.json')))

  const geminiCli =
    Boolean(env.GEMINI_API_KEY) || Boolean(env.GEMINI_ACP_AUTH_METHOD)

  const opencode =
    Boolean(env.ANTHROPIC_API_KEY) ||
    Boolean(env.OPENAI_API_KEY) ||
    Boolean(env.GEMINI_API_KEY) ||
    (await fileExists(
      path.join(home, '.local', 'share', 'opencode', 'auth.json'),
    ))

  return {
    'claude-code': claudeCode,
    codex,
    'gemini-cli': geminiCli,
    opencode,
  }
}

export const detectAgentConfig = async (): Promise<AgentStatusMap> => {
  const [configured, claudeOnPath, codexOnPath, geminiOnPath, opencodeOnPath] =
    await Promise.all([
      detectConfigured(),
      findOnPath(AGENT_BIN['claude-code']),
      findOnPath(AGENT_BIN['codex']),
      findOnPath(AGENT_BIN['gemini-cli']),
      findOnPath(AGENT_BIN['opencode']),
    ])

  return {
    'claude-code': {
      installed: claudeOnPath,
      configured: configured['claude-code'],
    },
    codex: { installed: codexOnPath, configured: configured.codex },
    'gemini-cli': {
      installed: geminiOnPath,
      configured: configured['gemini-cli'],
    },
    opencode: {
      installed: opencodeOnPath,
      configured: configured.opencode,
    },
  }
}
