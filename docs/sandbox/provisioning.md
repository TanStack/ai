---
title: Provisioning (Advanced)
id: provisioning
order: 5
description: "Give the agent secrets, skills, MCP servers, plugins, and instructions via one portable workspace definition."
---

If you need secrets, skill repos, MCP servers, plugins, or standing instructions → declare them on [`defineWorkspace()`](./workspace). Each harness projects them into its native format at bootstrap.

```ts
import {
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
    gitSkill({ repo: 'owner/tanstack-skills' }),
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

1. Call `createSecrets({ … })` with env values.
2. Pass the returned object as `secrets` on the workspace.
3. Hand `SecretRef` tokens (`secrets.GH`) to fields that accept them.

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

Values inject into the sandbox env at create/resume only.

### Why values never leak

Strings live in a **non-enumerable, symbol-keyed registry**. Properties like `secrets.GH` are `SecretRef` tokens, not strings.

- `Object.keys` / spreads / `JSON.stringify` never expose values.
- Values are **never** written to snapshots, the sandbox store, or the event log.

Safe to hash, persist, and replay for resume bookkeeping.

### `bearer(ref)` for headers

```ts
import { bearer, createSecrets, mcpSkill } from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})

mcpSkill('my-mcp', {
  url: 'https://mcp.example.com',
  headers: {
    Authorization: bearer(secrets.SENTRY), // "Bearer <value>"
    'X-Token': secrets.GH, // raw token
  },
})
```

## Skills, plugins, MCP

| Builder | Provisions |
| --- | --- |
| `gitSkill` | Skill repo clone (optional auth + path). Prefer over `agentSkill` on Claude Code. |
| `mcpSkill` | Third-party MCP server (URL + headers). |
| `fileSkill` | File written into the workspace. |
| `agentSkill` | Named public skill placeholder — Claude Code warns and skips; use `gitSkill`. |

`gitSkill` clone path defaults to `.tanstack-skills/<repo-basename>`; override with absolute `into`:

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

| Harness | MCP config path |
| --- | --- |
| Claude Code | `.mcp.json` |
| Codex | `.codex/config.toml` |
| OpenCode | `opencode.json` |

Missing concepts (e.g. `plugins` on Codex) → **warn + skip**, never throw.

> Third-party MCP here ≠ host tools. Bridge your app's tools → [Tools](./tools).

## `instructions` → `AGENTS.md`

Written to workspace-root `AGENTS.md`. `CLAUDE.md` / `GEMINI.md` become symlinks (or copies if symlink fails).

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/repo' }),
  instructions: 'Always run `pnpm test` before proposing a change.',
})
```

> Standing guidance → `instructions`. What the agent may run → [Policy](./policy).
