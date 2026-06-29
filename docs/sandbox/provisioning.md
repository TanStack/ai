---
title: Provisioning
id: provisioning
description: "Give the in-sandbox agent secrets, skill repos, MCP servers, plugins, and instructions with one portable definition that each harness projects into its own native format."
---

Provisioning is how you hand the in-sandbox agent everything beyond the working
tree: typed secrets, skill repos, MCP servers, plugins, and a universal
instruction file. You declare it all on [`defineWorkspace()`](./workspace), and
each harness adapter projects it into its own native format at bootstrap — so
the same definition works whether the agent is Claude Code, Codex, or OpenCode.

```ts
import {
  agentSkill,
  bearer,
  createSecrets,
  defineWorkspace,
  fileSkill,
  gitSkill,
  githubRepo,
  mcpSkill,
} from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

defineWorkspace({
  source: githubRepo({ repo: 'owner/repo', ref: 'main' }),
  secrets,
  skills: [
    agentSkill('tanstack'),
    gitSkill({ repo: 'owner/private-skills', secret: secrets.GH }),
    mcpSkill('my-mcp', {
      url: 'https://mcp.example.com',
      headers: { Authorization: bearer(secrets.SENTRY) },
    }),
    fileSkill({ path: '.agent-hints.md', content: '# Hints\nPrefer pnpm.' }),
  ],
  plugins: ['@anthropic/plugin-foo'],
  instructions: 'Always run `pnpm test` before proposing a change.',
})
```

## Type-safe secrets

`createSecrets` turns plain environment values into opaque `SecretRef` tokens.
You pass the refs around your config; the underlying strings stay out of every
serializable surface.

```ts
import { createSecrets, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

defineWorkspace({
  source: githubRepo({ repo: 'owner/repo', ref: 'main' }),
  secrets,
})
```

`secrets` is [declared on the workspace](./workspace), and the values are
injected into the sandbox env at create/resume time.

### Why the values never leak

The real strings are held in a **non-enumerable, symbol-keyed registry** on the
object `createSecrets` returns. Each property you access (`secrets.GH`) is a
`SecretRef` token, not the string. Because the registry is symbol-keyed and
non-enumerable:

- `Object.keys(secrets)`, spreads, and `JSON.stringify(secrets)` never expose
  the values.
- The values are **never written to snapshots, the sandbox store, or the event
  log** — only resolved at the moment the sandbox env is built.

This is what makes the workspace definition safe to hash, persist, and replay
for resume bookkeeping without ever persisting a credential.

### Passing a secret where a `SecretRef` is accepted

Hand a ref directly to any field that takes one. The clearest example is
`gitSkill` auth — pass `secret: secrets.GH` and the token is resolved only when
the repo is cloned:

```ts
import { createSecrets, defineWorkspace, gitSkill, githubRepo } from '@tanstack/ai-sandbox'

const secrets = createSecrets({ GH: process.env.GH_TOKEN ?? '' })

defineWorkspace({
  source: githubRepo({ repo: 'owner/repo' }),
  secrets,
  skills: [gitSkill({ repo: 'owner/private-skills', secret: secrets.GH })],
})
```

### `bearer(ref)` for header values

In MCP header values you can use a ref directly, or wrap it with `bearer(ref)`
to produce a `Bearer <value>` string at resolution time:

```ts
import { bearer, createSecrets, mcpSkill } from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

mcpSkill('my-mcp', {
  url: 'https://mcp.example.com',
  headers: {
    Authorization: bearer(secrets.SENTRY), // resolves to "Bearer <value>"
    'X-Token': secrets.GH, // resolves to the raw token value
  },
})
```

## Skills, plugins, and MCP servers

`skills` is an array of skill values that provision capabilities into the
agent's environment. There are four builders, each describing a different kind
of capability:

| Builder      | What it provisions                                                                 |
| ------------ | ---------------------------------------------------------------------------------- |
| `agentSkill` | A public agent skill loaded by name (Claude Code).                                 |
| `gitSkill`   | A skill repo cloned into the workspace, with optional auth and clone path.         |
| `mcpSkill`   | A third-party MCP server, with URL and headers.                                    |
| `fileSkill`  | An arbitrary file written into the workspace.                                      |

```ts
import {
  agentSkill,
  bearer,
  createSecrets,
  defineWorkspace,
  fileSkill,
  gitSkill,
  githubRepo,
  mcpSkill,
} from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

defineWorkspace({
  source: githubRepo({ repo: 'owner/repo' }),
  secrets,
  skills: [
    // Load a public agent skill by name.
    agentSkill('tanstack'),
    // Clone a private skill repo; `secret` is resolved from the secrets registry.
    gitSkill({ repo: 'owner/private-skills', secret: secrets.GH }),
    // Wire an MCP server with a resolved bearer token in the Authorization header.
    mcpSkill('my-mcp', {
      url: 'https://mcp.example.com',
      headers: { Authorization: bearer(secrets.SENTRY) },
    }),
    // Write an arbitrary file into the workspace.
    fileSkill({ path: '.agent-hints.md', content: '# Hints\nPrefer pnpm.' }),
  ],
  plugins: ['@anthropic/plugin-foo'],
})
```

### `gitSkill` clone path

`gitSkill` takes an optional `into` field — an **absolute path inside the
sandbox** — controlling where the repo is cloned. It defaults to
`.tanstack-skills/<repo-basename>`:

```ts
import { createSecrets, defineWorkspace, gitSkill, githubRepo } from '@tanstack/ai-sandbox'

const secrets = createSecrets({ GH: process.env.GH_TOKEN ?? '' })

defineWorkspace({
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

At bootstrap each harness projector maps these values into its CLI's native
format:

| Harness     | MCP servers projected to |
| ----------- | ------------------------ |
| Claude Code | `.mcp.json`              |
| Codex       | `.codex/config.toml`     |
| OpenCode    | `opencode.json`          |

A concept a given CLI lacks — for example, `plugins` on Codex — **emits a
warning and is silently skipped** rather than throwing. That keeps one portable
definition usable across harnesses: you declare everything once, and each agent
takes the parts it understands.

> These MCP servers are third-party services you point the agent at. Bridging
> your **own app's host tools** into the agent (a `chat()` server tool whose
> `execute()` runs back on the host) is a different mechanism — see
> [Tools](./tools).

## `AGENTS.md` and per-harness symlinks

`instructions` is a string written to `AGENTS.md` at the workspace root during
bootstrap. Harness-specific counterparts — `CLAUDE.md`, `GEMINI.md` — are
created as **symlinks** to it; if the sandbox process layer cannot symlink, they
are written as copies instead. Either way the instruction content is read
natively by every supported CLI without extra config.

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/repo' }),
  instructions: 'Always run `pnpm test` before proposing a change.',
})
```

> Use `instructions` for guidance you want the agent to always follow. To
> constrain what it is *allowed* to do — which commands and capabilities are
> allowed, asked about, or denied — reach for [Policy](./policy) instead.
