/**
 * Registry of coding-agent harnesses Coco can drive.
 *
 * Pure data + types only — safe to import from both the Node CLI and the
 * Shadow-DOM panel bundle. The runtime credential probe lives in
 * `agent-status.ts` (Node-only).
 *
 * Ported from `examples/ts-react-coding-agent/src/lib/agents.ts`.
 */

export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code', bin: 'claude' },
  { id: 'codex', label: 'Codex', bin: 'codex' },
  { id: 'gemini-cli', label: 'Gemini CLI', bin: 'gemini' },
  { id: 'opencode', label: 'OpenCode', bin: 'opencode' },
] as const

export type AgentId = 'claude-code' | 'codex' | 'gemini-cli' | 'opencode'

/** Map AgentId -> CLI binary name expected on PATH. */
export const AGENT_BIN: Record<AgentId, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  'gemini-cli': 'gemini',
  opencode: 'opencode',
}

export const DEFAULT_AGENT: AgentId = 'claude-code'

export const isAgentId = (value: unknown): value is AgentId =>
  value === 'claude-code' ||
  value === 'codex' ||
  value === 'gemini-cli' ||
  value === 'opencode'

export type AgentMode = 'read-only' | 'edit'

export const isAgentMode = (value: unknown): value is AgentMode =>
  value === 'read-only' || value === 'edit'

export interface SetupStep {
  text: string
  code?: string
}

export interface AgentSetup {
  label: string
  summary: string
  steps: Array<SetupStep>
  docsUrl: string
}

export const AGENT_SETUP: Record<AgentId, AgentSetup> = {
  'claude-code': {
    label: 'Claude Code',
    summary:
      'Drives the Claude Code CLI through @tanstack/ai-claude-code. Needs the CLI installed and authenticated on the machine running coco.',
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
        text: '…or set an API key in your shell environment instead:',
        code: 'export ANTHROPIC_API_KEY=sk-ant-…',
      },
      { text: 'Restart coco so it picks up the new credentials.' },
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
        text: '…or set an API key in your shell environment instead:',
        code: 'export OPENAI_API_KEY=sk-…',
      },
      {
        text: 'Heads up: ChatGPT-account logins cannot run codex models in headless mode — an API key or an entitled account is required.',
      },
      { text: 'Restart coco so it picks up the new credentials.' },
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
        text: 'Headless ACP runs can’t show an auth picker, so tell coco which method to use:',
        code: 'GEMINI_ACP_AUTH_METHOD=oauth-personal GEMINI_CLI_TRUST_WORKSPACE=true coco',
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
      'Drives OpenCode through @tanstack/ai-opencode. Needs the opencode CLI installed and a provider authenticated.',
    steps: [
      { text: 'Install the OpenCode CLI:', code: 'npm i -g opencode-ai' },
      {
        text: 'Authenticate a provider once (interactive):',
        code: 'opencode auth login',
      },
      {
        text: '…or set the provider API key in your shell environment instead:',
        code: 'export ANTHROPIC_API_KEY=sk-ant-…',
      },
      { text: 'Restart coco so it picks up the new credentials.' },
    ],
    docsUrl: 'https://opencode.ai/docs',
  },
}
