/**
 * Node-side credential probe — mirrors `getAgentConfigFn` in
 * `examples/ts-react-coding-agent/src/lib/agent-status.ts`.
 *
 * Lives in its own module (separate from `agents.ts`) so the browser-side
 * panel bundle can pull in agent constants without dragging Node built-ins.
 */
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AgentId } from './agents.ts'

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export const detectAgentConfig = async (): Promise<Record<AgentId, boolean>> => {
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
