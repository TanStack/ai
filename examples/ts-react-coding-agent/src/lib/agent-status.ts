import { createServerFn } from '@tanstack/react-start'
import type { AgentId } from './agents'

/** Whether a path exists, swallowing any access error. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const { access } = await import('node:fs/promises')
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Reports, per agent, whether the server has credentials/config to actually
 * run it. Environment variables aren't visible to the browser, so the client
 * gets this through a server function (called from the route loader). Each
 * agent counts as configured when an API key is present in the environment, or
 * when a local CLI login exists — except Gemini CLI, whose headless ACP mode
 * additionally needs an auth method selected up front (so we gate on the env
 * vars the example's adapter actually reads).
 */
export const getAgentConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Record<AgentId, boolean>> => {
    const os = await import('node:os')
    const path = await import('node:path')
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

    // Gemini's headless ACP path needs an auth method (or an API key) chosen
    // explicitly — a cached Google login alone isn't enough, so don't count it.
    const geminiCli =
      Boolean(env.GEMINI_API_KEY) || Boolean(env.GEMINI_ACP_AUTH_METHOD)

    // OpenCode resolves any configured provider — count a provider API key in
    // the environment or an `opencode auth login` credential file.
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
  },
)
