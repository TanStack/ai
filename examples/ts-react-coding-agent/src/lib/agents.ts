/**
 * Registry of coding-agent harnesses this example can drive.
 *
 * Each entry maps to a harness adapter on the server (see
 * `src/routes/api.chat.ts`): Claude Code (`@tanstack/ai-claude-code`),
 * Codex (`@tanstack/ai-codex`), Gemini CLI (`@tanstack/ai-gemini-cli`), and
 * OpenCode (`@tanstack/ai-opencode`).
 */
export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'opencode', label: 'OpenCode' },
] as const

/** Agent ids with a working adapter behind them. */
export type AgentId = 'claude-code' | 'codex' | 'gemini-cli' | 'opencode'

export const DEFAULT_AGENT: AgentId = 'claude-code'

export function isAgentId(value: unknown): value is AgentId {
  return (
    value === 'claude-code' ||
    value === 'codex' ||
    value === 'gemini-cli' ||
    value === 'opencode'
  )
}

/** A single, optionally command-bearing step in an agent's setup guide. */
export interface SetupStep {
  text: string
  /** A shell command to show in a copyable code block. */
  code?: string
}

export interface AgentSetup {
  /** Human label (mirrors the AGENTS entry). */
  label: string
  /** One-line description of what drives this agent. */
  summary: string
  /** Ordered setup steps shown in the "not configured" dialog. */
  steps: Array<SetupStep>
  /** Docs link for the underlying CLI/tool. */
  docsUrl: string
}

/**
 * Setup instructions surfaced in the UI when an agent isn't configured on the
 * server at runtime. Mirrors the README "Running" section — keep them in sync.
 */
export const AGENT_SETUP: Record<AgentId, AgentSetup> = {
  'claude-code': {
    label: 'Claude Code',
    summary:
      'Drives the Claude Code CLI through @tanstack/ai-claude-code. Needs the CLI installed and authenticated on the server.',
    steps: [
      {
        text: 'Install the Claude Code CLI:',
        code: 'npm i -g @anthropic-ai/claude-code',
      },
      {
        text: 'Log in interactively (uses your Claude subscription):',
        code: 'claude login',
      },
      {
        text: '…or set an API key in the server environment instead:',
        code: 'export ANTHROPIC_API_KEY=sk-ant-…',
      },
      { text: 'Restart the dev server so it picks up new credentials.' },
    ],
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
  },
  codex: {
    label: 'Codex',
    summary:
      'Drives OpenAI Codex through @tanstack/ai-codex. The codex binary ships with the SDK; you only need credentials.',
    steps: [
      { text: 'Log in interactively:', code: 'codex login' },
      {
        text: '…or set an API key in the server environment instead:',
        code: 'export OPENAI_API_KEY=sk-…',
      },
      {
        text: 'Heads up: ChatGPT-account logins cannot run codex models in headless mode — an API key or an entitled account is required.',
      },
      { text: 'Restart the dev server so it picks up new credentials.' },
    ],
    docsUrl: 'https://developers.openai.com/codex',
  },
  'gemini-cli': {
    label: 'Gemini CLI',
    summary:
      'Drives the Gemini CLI over ACP through @tanstack/ai-gemini-cli. Needs a recent CLI and an ACP auth method chosen up front.',
    steps: [
      {
        text: 'Install a current Gemini CLI (ACP mode needs a recent build):',
        code: 'npm i -g @google/gemini-cli',
      },
      { text: 'Log in with Google once (interactive):', code: 'gemini' },
      {
        text: 'Headless ACP runs can’t show an auth picker, so tell the adapter which method to use and start the server:',
        code: 'GEMINI_ACP_AUTH_METHOD=oauth-personal GEMINI_CLI_TRUST_WORKSPACE=true pnpm dev',
      },
      {
        text: '…or use an API key instead (set GEMINI_ACP_AUTH_METHOD=gemini-api-key):',
        code: 'export GEMINI_API_KEY=…',
      },
    ],
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  opencode: {
    label: 'OpenCode',
    summary:
      'Drives OpenCode through @tanstack/ai-opencode. Needs the opencode CLI installed and a provider authenticated on the server.',
    steps: [
      {
        text: 'Install the OpenCode CLI:',
        code: 'npm i -g opencode-ai',
      },
      {
        text: 'Authenticate a provider once (interactive):',
        code: 'opencode auth login',
      },
      {
        text: '…or set the provider API key in the server environment instead:',
        code: 'export ANTHROPIC_API_KEY=sk-ant-…',
      },
      { text: 'Restart the dev server so it picks up new credentials.' },
    ],
    docsUrl: 'https://opencode.ai/docs',
  },
}

/**
 * What the agent is allowed to do in the workspace:
 * - `read-only`: it can read and search, but file edits and shell commands
 *   are blocked.
 * - `edit`: file edits are auto-approved; with Claude Code, Gemini CLI, and
 *   OpenCode, shell commands still get denied by each adapter's default
 *   permission policy (a deliberate demo of the permission system), while
 *   Codex sandboxes them inside the workspace instead.
 */
export type AgentMode = 'read-only' | 'edit'

export function isAgentMode(value: unknown): value is AgentMode {
  return value === 'read-only' || value === 'edit'
}
