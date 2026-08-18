import { acpCompatibleText } from '@tanstack/ai-acp'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import {
  GROK_CLI_INSTALL_COMMAND,
  grokBuildText,
} from '@tanstack/ai-grok-build'
import { opencodeText } from '@tanstack/ai-opencode'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'
import { parseVerdict } from './sandbox-triage-options'
import type {
  GrokBuildModel,
  GrokBuildProtocol,
  GrokTransport,
  HarnessName,
  ProviderName,
  Verdict,
} from './sandbox-triage-options'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { SandboxDefinition, SandboxProvider } from '@tanstack/ai-sandbox'

export { parseVerdict }
export type { Verdict, HarnessName, ProviderName }

/** GitHub issue URL → repo + issue number. Throws on anything that isn't an issue URL. */
export function parseIssueUrl(url: string): {
  repo: string
  issueNumber: number
} {
  const match = url
    .trim()
    .match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i,
    )
  if (!match) {
    throw new Error(
      'Enter a GitHub issue URL like https://github.com/owner/repo/issues/123',
    )
  }
  return { repo: `${match[1]}/${match[2]}`, issueNumber: Number(match[3]) }
}

const WORKDIR = '/workspace'
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? 'node:22'

export interface HarnessSpec {
  label: string
  /** Build the adapter; receives the chosen provider so it can adapt (e.g. codex
   * can't use OS sandboxing on local-process / Windows). */
  makeAdapter: (provider: ProviderName) => AnyTextAdapter
  /**
   * The COMPLETE shell command that installs AND verifies the CLI, run once on
   * first create (sandboxed providers only); null = nothing to install. Each
   * harness owns its own retry strategy — npm-based ones use
   * {@link npmGlobalCli}, grok runs its own installer script. The runner passes
   * this string to `sh -c` verbatim and never wraps it, because splicing a
   * command that starts with `(` into another command (`… || sudo … <cmd>`) is a
   * SHELL SYNTAX ERROR (`sh: syntax error: unexpected "("` → exit 2) that aborts
   * setup before anything runs.
   */
  installCommand: string | null
  /** Env vars the in-sandbox CLI needs; any that are set are injected as secrets. */
  requiredEnv: Array<string>
  /**
   * Optional custom check (overrides `requiredEnv` for validation) for harnesses
   * with either/or auth — returns the missing env vars, or `[]` if satisfied.
   */
  envCheck?: () => Array<string>
  /**
   * Optional secrets to inject into a SANDBOXED run (overrides the default
   * requiredEnv-based injection for this harness). Use when the in-sandbox CLI
   * reads a differently-named var — e.g. `codex exec` authenticates via
   * `CODEX_API_KEY`, not `OPENAI_API_KEY` (the latter hits its OAuth/WS path → 401).
   */
  sandboxSecrets?: () => Record<string, string>
  /** Port the in-sandbox CLI listens on that the host must reach (e.g. opencode's
   * `opencode serve`). Sandboxed providers publish/expose it; undefined = none. */
  exposePort?: number
}

/**
 * A global npm install of a CLI, hardened for sandbox images, as ONE `sh` command:
 *
 * - `--include=optional`: these CLIs ship their native binary as a
 *   platform-specific OPTIONAL dep (`@openai/codex-linux-x64`, …); an npm
 *   configured to omit optional deps installs a broken CLI.
 * - sudo fallback: some images (Daytona) run as a non-root user with a root-owned
 *   global npm prefix → `-g` fails EACCES. `sudo -n` never prompts, and keeping
 *   `PATH` lets nvm's node/npm still resolve. Docker runs as root, so the direct
 *   install succeeds and sudo never runs.
 * - `verify` + one retry: npm treats optional deps as BEST-EFFORT — a transient
 *   failure fetching the platform binary is not an install error, so npm exits 0
 *   and leaves a CLI that dies at run time with "Missing optional dependency".
 *   Running the CLI here turns that into a loud setup failure, and retrying the
 *   whole attempt absorbs the transient case.
 */
function npmGlobalCli(spec: string, verify: string): string {
  const install = `npm install -g ${spec} --include=optional`
  const attempt = `{ ${install} || sudo -n env "PATH=$PATH" ${install} ; } && ${verify}`
  return `${attempt} || { ${attempt} ; }`
}

export const HARNESSES: Record<HarnessName, HarnessSpec> = {
  'claude-code': {
    label: 'Claude Code',
    // Headless `-p` cannot answer permission prompts. Isolated sandboxes and
    // this trusted local demo both need bypassPermissions, same as Codex
    // `danger-full-access`. Do not set CLAUDE_CODE_SANDBOXED here: that marker
    // is only for a real isolation boundary, which the adapter sets itself.
    makeAdapter: () =>
      claudeCodeText('sonnet', {
        permissionMode: 'bypassPermissions',
      }),
    installCommand: npmGlobalCli(
      '@anthropic-ai/claude-code',
      'claude --version',
    ),
    requiredEnv: ['ANTHROPIC_API_KEY'],
  },
  codex: {
    label: 'Codex',
    // Always run codex with its OWN OS sandbox disabled (`danger-full-access`):
    // it already runs inside an isolated sandbox (Docker/Vercel/Daytona) or on a
    // trusted host (local-process), so codex's inner Landlock/seccomp sandbox is
    // redundant — and it's unsupported on Windows and on some Linux images
    // (Daytona), where it fails with "os error 2". The outer sandbox is the
    // real boundary; the read-only triage prompt constrains behavior.
    makeAdapter: () =>
      codexText('gpt-5.5', { sandboxMode: 'danger-full-access' }),
    installCommand: npmGlobalCli('@openai/codex', 'codex --version'),
    // `codex exec` authenticates headlessly via CODEX_API_KEY (a bare
    // OPENAI_API_KEY makes it try the OAuth WebSocket transport → 401). Accept
    // either env var; inject the value AS CODEX_API_KEY into the sandbox. On
    // local-process it uses the host `codex login` instead, so nothing is needed.
    requiredEnv: ['CODEX_API_KEY'],
    envCheck: () =>
      process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY
        ? []
        : ['CODEX_API_KEY (or OPENAI_API_KEY)'],
    sandboxSecrets: (): Record<string, string> => {
      const key = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY
      return key ? { CODEX_API_KEY: key } : {}
    },
  },
  opencode: {
    label: 'OpenCode',
    makeAdapter: () =>
      opencodeText('openai/gpt-5.1-codex', {
        directory: WORKDIR,
        permissionMode: 'bypassPermissions',
      }),
    installCommand: npmGlobalCli('opencode-ai', 'opencode --version'),
    requiredEnv: ['OPENAI_API_KEY'],
    // `opencode serve` listens on this port inside the sandbox; the host reaches
    // it over HTTP, so sandboxed providers must publish/expose it (Docker
    // `publishPorts`, Vercel `ports`). Local/Daytona need nothing (localhost /
    // auto-exposed). Matches the opencode adapter's DEFAULT_PORT.
    exposePort: 4096,
  },
  grok: {
    label: 'Grok Build',
    makeAdapter: () => grokBuildText('composer-2.5'),
    installCommand: GROK_CLI_INSTALL_COMMAND,
    requiredEnv: ['XAI_API_KEY'],
    envCheck: () =>
      process.env.XAI_API_KEY || process.env.GROK_API_KEY
        ? []
        : ['XAI_API_KEY (or GROK_API_KEY)'],
    sandboxSecrets: (): Record<string, string> => {
      const key = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY
      return key ? { XAI_API_KEY: key } : {}
    },
    exposePort: 2419,
  },
  acp: {
    label: 'ACP compatible (Grok)',
    makeAdapter: () =>
      acpCompatibleText('composer-2.5', {
        name: 'acp',
        command: ({ model }) =>
          `grok agent -m '${model}' --always-approve stdio`,
        permissionMode: 'bypassPermissions',
      }),
    installCommand: GROK_CLI_INSTALL_COMMAND,
    requiredEnv: ['XAI_API_KEY'],
    envCheck: () =>
      process.env.XAI_API_KEY || process.env.GROK_API_KEY
        ? []
        : ['XAI_API_KEY (or GROK_API_KEY)'],
    sandboxSecrets: (): Record<string, string> => {
      const key = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY
      return key ? { XAI_API_KEY: key } : {}
    },
  },
}

export type HarnessAuthMode = 'host' | 'api-key'

export interface GrokHarnessOptions {
  model?: GrokBuildModel
  protocol?: GrokBuildProtocol
  transport?: GrokTransport
  authMode?: HarnessAuthMode
}

function harnessAuthKeys(harness: HarnessName): Array<string> {
  switch (harness) {
    case 'grok':
    case 'acp':
      return ['XAI_API_KEY', 'GROK_API_KEY']
    case 'claude-code':
      return ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
    case 'codex':
      return ['CODEX_API_KEY']
    case 'opencode':
      return ['OPENAI_API_KEY']
  }
}

/** Build the adapter for a harness run, including per-run Grok protocol options. */
export function buildHarnessAdapter(
  harness: HarnessName,
  provider: ProviderName,
  grokOptions?: GrokHarnessOptions,
): AnyTextAdapter {
  const authMode = grokOptions?.authMode
  if (harness === 'grok') {
    return grokBuildText(grokOptions?.model ?? 'composer-2.5', {
      protocol: grokOptions?.protocol ?? 'acp',
      transport: grokOptions?.transport ?? 'auto',
      ...(authMode !== undefined && { authMode }),
    })
  }
  if (harness === 'acp') {
    return acpCompatibleText('composer-2.5', {
      name: 'acp',
      command: ({ model }) => `grok agent -m '${model}' --always-approve stdio`,
      permissionMode: 'bypassPermissions',
      ...(authMode !== undefined && { authMode }),
      ...(authMode === 'api-key' && { authMethodId: 'xai.api_key' }),
    })
  }
  if (harness === 'claude-code') {
    return claudeCodeText('sonnet', {
      permissionMode: 'bypassPermissions',
      ...(authMode !== undefined && { authMode }),
    })
  }
  if (harness === 'codex') {
    return codexText('gpt-5.5', {
      sandboxMode: 'danger-full-access',
      ...(authMode !== undefined && { authMode }),
    })
  }
  return HARNESSES[harness].makeAdapter(provider)
}

export interface ProviderSpec {
  label: string
  /** `ports` are host-reachable ports the harness needs exposed (e.g. opencode's). */
  make: (ports: Array<number>) => SandboxProvider
  requiredEnv: Array<string>
  /**
   * Optional custom env check (overrides `requiredEnv`) for providers with
   * either/or auth — returns the list of missing env vars, or `[]` if satisfied.
   */
  envCheck?: () => Array<string>
  /**
   * Whether the host tool bridge is reachable from inside this provider's
   * sandbox. The bridge is a `localhost` HTTP server, so only same-machine
   * providers (local, docker via `host.docker.internal`) can reach it. Remote
   * cloud sandboxes (daytona, vercel) can't reach the host without a public
   * tunnel, so chat()-provided tools / code mode can't be bridged there.
   */
  toolBridge: boolean
}

export const PROVIDERS: Record<ProviderName, ProviderSpec> = {
  docker: {
    label: 'Docker',
    make: (ports) =>
      dockerSandbox({
        image: SANDBOX_IMAGE,
        ...(ports.length ? { publishPorts: ports } : {}),
      }),
    requiredEnv: [],
    toolBridge: true,
  },
  local: {
    label: 'Local process',
    make: () => localProcessSandbox(),
    requiredEnv: [],
    toolBridge: true,
  },
  vercel: {
    label: 'Vercel',
    make: (ports) => vercelSandbox(ports.length ? { ports } : {}),
    toolBridge: false,
    // Either a self-contained OIDC token (`vercel env pull` → VERCEL_OIDC_TOKEN),
    // OR token + team + project (off-Vercel, no OIDC). With only VERCEL_TOKEN the
    // SDK falls back to OIDC and fails.
    requiredEnv: ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'],
    envCheck: () =>
      process.env.VERCEL_OIDC_TOKEN
        ? []
        : ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'].filter(
            (key) => !process.env[key],
          ),
  },
  daytona: {
    label: 'Daytona',
    // Daytona auto-exposes ports via preview URLs, so it ignores `ports`.
    make: () => daytonaSandbox(),
    requiredEnv: ['DAYTONA_API_KEY'],
    toolBridge: false,
  },
}

export function isHarness(value: unknown): value is HarnessName {
  return typeof value === 'string' && value in HARNESSES
}

export function isProvider(value: unknown): value is ProviderName {
  return typeof value === 'string' && value in PROVIDERS
}

/**
 * Whether to use the host's logged-in Claude Code subscription instead of an API
 * key (no API billing). Only valid for Claude Code on the local-process provider,
 * which runs *your* host `claude`; sandboxes have no host login.
 */
export function usesSubscription(
  harness: HarnessName,
  provider: ProviderName,
  useSubscription: boolean | undefined,
): boolean {
  return !!useSubscription && provider === 'local' && harness === 'claude-code'
}

/** Required env vars (harness + provider) that are not set in process.env. */
export function missingEnv(
  harness: HarnessName,
  provider: ProviderName,
  authMode?: HarnessAuthMode,
): Array<string> {
  const harnessSpec = HARNESSES[harness]
  const hostAuth = authMode === 'host'
  const harnessMissing =
    hostAuth || (authMode === undefined && provider === 'local')
      ? []
      : harnessSpec.envCheck
        ? harnessSpec.envCheck()
        : harnessSpec.requiredEnv.filter((key) => !process.env[key])
  const spec = PROVIDERS[provider]
  const providerMissing = spec.envCheck
    ? spec.envCheck()
    : spec.requiredEnv.filter((key) => !process.env[key])
  return [...harnessMissing, ...providerMissing]
}

export interface GitHubIssue {
  number: number
  title: string
  body: string
  url: string
}

/** Fetch one issue. Uses GITHUB_TOKEN when set (private repos / rate limits). */
export async function fetchIssue(
  repo: string,
  issueNumber: number,
): Promise<GitHubIssue> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'tanstack-ai-sandbox-triage',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const res = await fetch(
    `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
    { headers },
  )
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} ${res.statusText}: ${await res.text()}`,
    )
  }
  const issue = (await res.json()) as {
    number: number
    title: string
    body: string | null
    html_url: string
    pull_request?: unknown
  }
  if (issue.pull_request !== undefined) {
    throw new Error(`${repo}#${issueNumber} is a pull request, not an issue.`)
  }
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    url: issue.html_url,
  }
}

export function buildTriagePrompt(issue: GitHubIssue, repo: string): string {
  return [
    `You are triaging a GitHub issue in the ${repo} repository, which is checked`,
    `out in your current working directory.`,
    '',
    `Issue #${issue.number}: ${issue.title}`,
    `URL: ${issue.url}`,
    '',
    'Issue body:',
    issue.body || '(no description provided)',
    '',
    'Investigate the repository to understand and triage this issue. Do NOT',
    'change any source code — this is analysis only. Determine whether the bug',
    'is still RELEVANT to the current code and find its root cause.',
    '',
    'Reply with Markdown. The VERY FIRST line MUST be exactly one of:',
    '  VERDICT: relevant | not-relevant | uncertain',
    'Then these sections:',
    '## Summary',
    '## Root cause / analysis',
    '## Affected files',
    '## Confidence',
  ].join('\n')
}

/** One sandbox per (harness, provider, thread): switching a picker → fresh sandbox. */
export function buildSandbox(opts: {
  harness: HarnessName
  provider: ProviderName
  repo: string
  threadId: string
  /** Keep the sandbox alive after the run instead of destroying it (default: destroy). */
  keepAlive?: boolean
  /** Local Claude Code only: use the host's subscription login instead of an API key. */
  useSubscription?: boolean
  /** Host login vs API key. Not inferred from the sandbox provider. */
  authMode?: HarnessAuthMode
}): SandboxDefinition {
  const harness = HARNESSES[opts.harness]
  const authMode =
    opts.authMode ??
    (usesSubscription(opts.harness, opts.provider, opts.useSubscription)
      ? 'host'
      : undefined)
  const hostAuth = authMode === 'host'

  const ports = harness.exposePort !== undefined ? [harness.exposePort] : []
  const provider =
    hostAuth && opts.provider === 'local'
      ? localProcessSandbox({ scrubEnv: harnessAuthKeys(opts.harness) })
      : PROVIDERS[opts.provider].make(ports)

  const secretEnv: Record<string, string> = {}
  if (!hostAuth) {
    if (harness.sandboxSecrets) {
      Object.assign(secretEnv, harness.sandboxSecrets())
    } else {
      for (const key of harness.requiredEnv) {
        const value = process.env[key]
        if (value) secretEnv[key] = value
      }
    }
  }
  if (opts.provider !== 'local') {
    // Provider auth (e.g. DAYTONA_API_KEY) — used host-side, harmless in-sandbox.
    for (const key of PROVIDERS[opts.provider].requiredEnv) {
      const value = process.env[key]
      if (value) secretEnv[key] = value
    }
  }
  return defineSandbox({
    id: `triage-${opts.harness}-${opts.provider}-${opts.threadId}`,
    provider,
    workspace: defineWorkspace({
      source: githubRepo({ repo: opts.repo }),
      setup: ({ serial }) => {
        // Install the harness CLI into the fresh sandbox for every provider
        // EXCEPT local-process, which uses the host's CLI already on PATH.
        // Remote/container images (docker/vercel/daytona) don't ship it.
        // Run the harness command AS-IS. Never splice it into a larger shell
        // command here: grok's installer starts with `(`, and `… || sudo … (curl
        // …)` is a syntax error that aborts setup with exit 2. Retries and
        // privilege fallbacks belong INSIDE each `installCommand`.
        if (opts.provider !== 'local' && harness.installCommand) {
          serial(harness.installCommand)
        }
      },
      instructions:
        'Investigate read-only; do not modify source files unless explicitly asked.',
      secrets: createSecrets(secretEnv),
    }),
    // Tear down after the run so a container/VM is never left running. On
    // success/error `withSandbox` honors `destroyOnComplete`; on an explicit
    // abort it ALWAYS destroys (killing the agent's token drain), so keepAlive
    // only preserves the sandbox after a successful run.
    lifecycle: { reuse: 'thread', destroyOnComplete: !opts.keepAlive },
  })
}
