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
import type { HarnessName, ProviderName, Verdict } from './sandbox-triage-options'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  SandboxDefinition,
  SandboxProvider,
} from '@tanstack/ai-sandbox'

export { parseVerdict }
export type { Verdict, HarnessName, ProviderName }

/** GitHub issue URL → repo + issue number. Throws on anything that isn't an issue URL. */
export function parseIssueUrl(url: string): { repo: string; issueNumber: number } {
  const match = url
    .trim()
    .match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i)
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
  makeAdapter: () => AnyTextAdapter
  /** CLI install run once on first create (docker only); null = nothing to install. */
  installCommand: string | null
  /** Env vars the in-sandbox CLI needs; injected as secrets + validated up front. */
  requiredEnv: Array<string>
}

export const HARNESSES: Record<HarnessName, HarnessSpec> = {
  'claude-code': {
    label: 'Claude Code',
    makeAdapter: () => claudeCodeText('sonnet'),
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    requiredEnv: ['ANTHROPIC_API_KEY'],
  },
  codex: {
    label: 'Codex',
    makeAdapter: () => codexText('gpt-5.3-codex'),
    installCommand: 'npm install -g @openai/codex',
    requiredEnv: ['CODEX_API_KEY'],
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
    requiredEnv: ['VERCEL_TOKEN'],
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

/** Required env vars (harness + provider) that are not set in process.env. */
export function missingEnv(
  harness: HarnessName,
  provider: ProviderName,
): Array<string> {
  return [
    ...HARNESSES[harness].requiredEnv,
    ...PROVIDERS[provider].requiredEnv,
  ].filter((key) => !process.env[key])
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
}): SandboxDefinition {
  const harness = HARNESSES[opts.harness]
  const provider = PROVIDERS[opts.provider]
  const secretEnv: Record<string, string> = {}
  for (const key of [...harness.requiredEnv, ...provider.requiredEnv]) {
    secretEnv[key] = process.env[key] ?? ''
  }
  return defineSandbox({
    id: `triage-${opts.harness}-${opts.provider}-${opts.threadId}`,
    provider: provider.make(),
    workspace: defineWorkspace({
      source: githubRepo({ repo: opts.repo }),
      setup: ({ serial }) => {
        // Install the CLI only on docker (a fresh container); local uses host PATH,
        // and vercel/daytona images are expected to provide it (or pre-bake).
        if (opts.provider === 'docker' && harness.installCommand) {
          serial(harness.installCommand)
        }
      },
      instructions:
        'Investigate read-only; do not modify source files unless explicitly asked.',
      secrets: createSecrets(secretEnv),
    }),
    lifecycle: { reuse: 'thread' },
  })
}
