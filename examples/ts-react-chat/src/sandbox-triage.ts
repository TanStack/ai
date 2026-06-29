import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import { geminiCliText } from '@tanstack/ai-gemini-cli'
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
  /** CLI install run once on first create (docker only); null = nothing to install. */
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
}

export const HARNESSES: Record<HarnessName, HarnessSpec> = {
  'claude-code': {
    label: 'Claude Code',
    makeAdapter: () => claudeCodeText('sonnet'),
    // `--include=optional` is required: the CLI's native binary ships as a
    // platform-specific OPTIONAL dependency (`@anthropic-ai/claude-code-<plat>`).
    // A plain `-g` install can skip it, leaving a `claude` that errors
    // "native binary not installed" and exits with no output.
    installCommand:
      'npm install -g @anthropic-ai/claude-code --include=optional',
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
      codexText('gpt-5.3-codex', { sandboxMode: 'danger-full-access' }),
    // `--include=optional`: codex's native binary ships as a platform-specific
    // optional dep; images whose npm omits optional deps (some Daytona/Vercel
    // bases) otherwise install a broken `codex` (or fail the install).
    installCommand: 'npm install -g @openai/codex --include=optional',
    // `codex exec` authenticates headlessly via CODEX_API_KEY (a bare
    // OPENAI_API_KEY makes it try the OAuth WebSocket transport → 401). Accept
    // either env var; inject the value AS CODEX_API_KEY into the sandbox. On
    // local-process it uses the host `codex login` instead, so nothing is needed.
    requiredEnv: ['CODEX_API_KEY'],
    envCheck: () =>
      process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY
        ? []
        : ['CODEX_API_KEY (or OPENAI_API_KEY)'],
    sandboxSecrets: () => {
      const key = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY
      return key ? { CODEX_API_KEY: key } : {}
    },
  },
  'gemini-cli': {
    label: 'Gemini CLI',
    makeAdapter: () => geminiCliText('gemini-3-pro-preview'),
    installCommand: 'npm install -g @google/gemini-cli',
    requiredEnv: ['GEMINI_API_KEY'],
  },
  opencode: {
    label: 'OpenCode',
    makeAdapter: () =>
      opencodeText('anthropic/claude-sonnet-4-5', {
        directory: WORKDIR,
        permissionMode: 'bypassPermissions',
      }),
    installCommand: 'npm install -g opencode-ai',
    requiredEnv: ['ANTHROPIC_API_KEY'],
  },
}

export interface ProviderSpec {
  label: string
  make: () => SandboxProvider
  requiredEnv: Array<string>
  /**
   * Optional custom env check (overrides `requiredEnv`) for providers with
   * either/or auth — returns the list of missing env vars, or `[]` if satisfied.
   */
  envCheck?: () => Array<string>
}

export const PROVIDERS: Record<ProviderName, ProviderSpec> = {
  docker: {
    label: 'Docker',
    make: () => dockerSandbox({ image: SANDBOX_IMAGE }),
    requiredEnv: [],
  },
  local: {
    label: 'Local process',
    make: () => localProcessSandbox(),
    requiredEnv: [],
  },
  vercel: {
    label: 'Vercel',
    make: () => vercelSandbox(),
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
    make: () => daytonaSandbox(),
    requiredEnv: ['DAYTONA_API_KEY'],
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
): Array<string> {
  // local-process runs the agent on the host with the host's OWN auth — an env
  // API key, or a `claude login`/`codex login` — so the example requires no key
  // for it. Sandboxed providers must have a key injected, so it's required.
  const harnessSpec = HARNESSES[harness]
  const harnessMissing =
    provider === 'local'
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
}): SandboxDefinition {
  const harness = HARNESSES[opts.harness]
  const subscription = usesSubscription(
    opts.harness,
    opts.provider,
    opts.useSubscription,
  )

  // Subscription mode scrubs ANTHROPIC_API_KEY from the host claude's env (via the
  // provider's `scrubEnv` flag) so it falls back to the logged-in subscription.
  const provider = subscription
    ? localProcessSandbox({ scrubEnv: ['ANTHROPIC_API_KEY'] })
    : PROVIDERS[opts.provider].make()

  // Inject auth secrets only for sandboxed providers — local-process inherits the
  // host's own env (API key, or a `claude login`/`codex login`), so nothing to inject.
  const secretEnv: Record<string, string> = {}
  if (opts.provider !== 'local') {
    // Harness auth: a custom mapping (e.g. codex → CODEX_API_KEY) if provided,
    // otherwise inject whichever of its requiredEnv vars are set.
    if (harness.sandboxSecrets) {
      Object.assign(secretEnv, harness.sandboxSecrets())
    } else {
      for (const key of harness.requiredEnv) {
        const value = process.env[key]
        if (value) secretEnv[key] = value
      }
    }
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
        if (opts.provider !== 'local' && harness.installCommand) {
          // Some images (e.g. Daytona) run as a non-root user with a root-owned
          // global npm dir → `npm install -g` fails EACCES. Fall back to
          // passwordless sudo, preserving PATH so nvm's npm/node still resolve.
          // Docker runs as root, so the direct install succeeds and sudo never
          // runs. `sudo -n` never prompts (fails fast if sudo isn't available).
          const cmd = harness.installCommand
          serial(`${cmd} || sudo -n env "PATH=$PATH" ${cmd}`)
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
