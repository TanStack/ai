---
title: Provisioning (Advanced)
id: provisioning
order: 5
description: "Give the in-sandbox agent secrets, skill repos, MCP servers, plugins, and instructions. Declare them once, and each harness writes them in its own native format."
---

Your agent needs more than the repo. It needs API tokens, your team's skills, an MCP server or two, and house rules like "run the tests first". Each CLI (Claude Code, Codex, Grok Build, OpenCode) wants these in a different file, in a different format.

Provisioning lets you declare all of it once, on [`defineWorkspace()`](./workspace). At bootstrap, each harness adapter writes it in the format its CLI reads.

## Provision a workspace

1. Wrap your secrets with `createSecrets`. You get opaque refs, not strings.
2. List your skills, plugins, and instructions on `defineWorkspace`.
3. Pass the workspace to `defineSandbox`, and use the sandbox as usual.

```ts
import {
  bearer,
  createSecrets,
  defineSandbox,
  defineWorkspace,
  fileSkill,
  gitSkill,
  githubRepo,
  mcpSkill,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const secrets = createSecrets({
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

export const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/repo', ref: 'main' }),
    // This example uses Claude Code. Install the CLI for your harness.
    setup: [
      'npm install -g @anthropic-ai/claude-code --include=optional && claude --version',
    ],
    secrets,
    skills: [
      // A public skill repo.
      gitSkill({ repo: 'owner/tanstack-skills' }),
      // A private skill repo. The token is used only for the clone.
      gitSkill({ repo: 'owner/private-skills', secret: secrets.GH }),
      // A third-party MCP server, with a bearer token header.
      mcpSkill('sentry', {
        url: 'https://mcp.example.com',
        headers: { Authorization: bearer(secrets.SENTRY) },
      }),
      // Any file you want in the workspace.
      fileSkill({ path: '.agent-hints.md', content: '# Hints\nPrefer pnpm.' }),
    ],
    plugins: ['@anthropic/plugin-foo'],
    instructions: 'Always run `pnpm test` before proposing a change.',
  }),
})
```

Start a run with this sandbox and `claudeCodeText`. The agent can use the skills and the MCP server, and it reads your instructions from `AGENTS.md`.

## How it works

- **Secrets** stay as refs everywhere in your config. The real values are resolved only into the live sandbox env, at create, resume, and snapshot restore. They are never written to snapshots, the sandbox store, or the event log.
- **Skills, MCP servers, and plugins** are written by the harness adapter at bootstrap, each in its CLI's native place. See [Per-harness projection](#per-harness-projection).
- **Instructions** go to `AGENTS.md` at the workspace root. `CLAUDE.md` and `GEMINI.md` point to it.
- **A CLI that lacks a concept** warns and skips that entry. It does not throw. So one definition works with every harness, and each agent takes the parts it understands.

To limit what the agent is **allowed** to do (which commands run, which ask, which are denied), use [Policy](./policy), not instructions.

## Advanced

### Why secret values never leak

`createSecrets` keeps the real strings in a **non-enumerable, symbol-keyed registry** on the object it returns. Each property you read (`secrets.GH`) is a `SecretRef` token, not the string. So:

- `Object.keys(secrets)`, spreads, and `JSON.stringify(secrets)` never show the values.
- The workspace definition is safe to hash, store, and replay for resume, with no credential in it.

`secrets` is [declared on the workspace](./workspace). The harness adapters write secret-bearing MCP config again on every run, with fresh values. So a snapshot never serves a stale or rotated secret.

### Where a `SecretRef` goes

Pass a ref straight to any field that takes one. For `gitSkill`, pass `secret`. The token is resolved only when the repo is cloned.

In MCP headers, use a ref as is, or wrap it with `bearer(ref)` to get `Bearer <value>`:

```ts
import { bearer, createSecrets, mcpSkill } from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

export const sentry = mcpSkill('sentry', {
  url: 'https://mcp.example.com',
  headers: {
    Authorization: bearer(secrets.SENTRY), // "Bearer <value>"
    'X-Token': secrets.GH, // the raw token value
  },
})
```

### Skill builders

| Builder | What it provisions |
| --- | --- |
| `gitSkill` | A skill repo cloned into the workspace, with optional `secret` and clone path. |
| `mcpSkill` | A third-party MCP server, with `url` and `headers`. |
| `fileSkill` | Any file written into the workspace. |
| `agentSkill` | A public skill by bare name. Every bundled harness warns and skips it, so use `gitSkill` instead. |

These MCP servers are third-party services. To give the agent your **own app's** tools (a `chat()` server tool whose `execute()` runs on your host), use [Tools](./tools).

### `gitSkill` clone path

`into` sets where the repo is cloned. It is an absolute path inside the sandbox. The default is `.tanstack-skills/<repo-basename>` under the workspace root. Bootstrap creates the parent directory before the clone.

A path that starts with `/workspace` uses the portable workspace root, and the provider maps it to its real workdir. Keep `/workspace/...` unless you must pin a provider-specific path.

```ts
import {
  createSecrets,
  defineWorkspace,
  gitSkill,
  githubRepo,
} from '@tanstack/ai-sandbox'

const secrets = createSecrets({ GH: process.env.GH_TOKEN ?? '' })

export const workspace = defineWorkspace({
  source: githubRepo({ repo: 'owner/repo' }),
  secrets,
  skills: [
    gitSkill({
      repo: 'owner/private-skills',
      secret: secrets.GH,
      into: '/workspace/.skills/private',
    }),
  ],
})
```

### Per-harness projection

| Harness | MCP servers | `gitSkill` repos | `plugins` |
| --- | --- | --- | --- |
| Claude Code | `.mcp.json` | `.claude/skills/<name>` | `claude plugin install <name> --scope project` |
| Codex | `.codex/config.toml` | `.codex/skills/<name>` | Warns and skips. |
| Grok Build | `.grok/config.toml` | `.grok/skills/<name>` | Warns and skips. |
| OpenCode | `opencode.json` | Warns and skips (cloned, not linked). | Warns and skips. |

For a linked skill repo, the projector looks for folders that hold a `SKILL.md`:

- A nested pack (`skills/foo/SKILL.md`) is linked under the name `foo`.
- A flat clone with `SKILL.md` at its root uses the clone name.

Links are symlinks. If `ln -s` fails, the projector copies the folder. You never write the links yourself.

### `AGENTS.md` and its links

Bootstrap writes `instructions` to `AGENTS.md` at the workspace root. It then creates `CLAUDE.md` and `GEMINI.md` as symlinks to it. If the sandbox cannot make symlinks, they are copies. Either way, every supported CLI reads the instructions with no extra config.
