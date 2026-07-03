---
title: Policy
id: policy
order: 7
description: "Set allow/ask/deny guardrails over the commands and capabilities the in-sandbox agent may run, ask about, or never run — one portable description each harness maps onto its native permissions."
---

A policy is your guardrail layer: it decides which commands and capabilities the
in-sandbox agent may run outright, must ask about first, or can never run.
`defineSandboxPolicy()` describes those rules once, portably, and each
[provider](./providers)'s harness adapter maps them onto its own native
permission system. You attach a policy to a sandbox via
[`defineSandbox({ policy })`](./providers), where it guards the commands the
[workspace](./workspace) setup and bridged [tools](./tools) run.

```ts
import { defineSandboxPolicy, defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
    ask: ['pnpm install', 'curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask',
})

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  policy,
})
```

## Decisions

Every command or capability resolves to one of three decisions:

| Decision | Meaning |
| --- | --- |
| `allow` | The agent runs it without interruption. |
| `ask`   | The agent pauses; the harness emits an approval request the client answers before the action proceeds. |
| `deny`  | The action is blocked outright — the agent cannot run it. |

## Commands

`commands` holds three lists of command patterns — `allow`, `ask`, and `deny`.
A pattern matches against the command the agent is about to run:

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
    ask: ['pnpm install', 'curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
})
```

### Glob patterns

Patterns support `*` globs, so you can gate a whole family of commands with one
entry. `curl *` matches any `curl` invocation; `sudo *` matches anything run
through `sudo`. An exact string like `pnpm test` matches only that command.
Prefer the named [workspace scripts](./workspace) (`pnpm test`, `pnpm build`)
in your `allow` list — they give the policy stable names to match rather than
freeform shell.

## Capabilities

`capabilities` applies the same `allow` / `ask` / `deny` decisions to
coarse-grained abilities rather than individual commands — for example
filesystem writes or outbound network access:

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  capabilities: {
    fileWrite: 'allow', // let the agent edit the working tree freely
    network: 'ask',     // pause for approval before any outbound request
  },
})
```

This is the broad backstop: even if a specific network command isn't in your
`commands` lists, `network: 'ask'` still forces an approval for anything that
reaches out.

## Precedence: deny > ask > allow

When more than one rule could match an action, the strictest wins. The order is
**`deny` > `ask` > `allow`**:

- If any matching rule says `deny`, the action is blocked — no other rule
  overrides it.
- Otherwise, if any matching rule says `ask`, the action requires approval.
- Otherwise, if a rule says `allow`, it runs.
- If nothing matches, the `default` decision applies.

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    // `curl` is allowed broadly…
    allow: ['curl *'],
    // …but `deny` wins, so this specific host is always blocked.
    deny: ['curl * internal.example.com*'],
  },
  default: 'deny',
})
```

This means you can paint with a broad `allow` and carve exceptions out with
narrower `ask` / `deny` patterns, confident the exceptions take priority.

## The default

`default` is the decision for anything none of your rules match. Set it to the
posture you want at the edges:

- `default: 'allow'` — permissive: only the things you explicitly `ask` about or
  `deny` are gated. Reasonable for trusted dev loops.
- `default: 'ask'` — cautious: unknown actions pause for approval. A good middle
  ground.
- `default: 'deny'` — locked down: the agent can only run what you explicitly
  `allow`. Strongest posture for untrusted or production runs.

When omitted, treat the default as `ask` so unforeseen actions surface rather
than silently running.

## How `ask` surfaces

An `ask` decision is not a guess the SDK makes — it's a question routed back to
you. When the agent attempts an `ask`-gated action, the harness pauses it and
emits an **approval request** into the run stream. Your client answers that
request (approve or reject), and the harness either lets the action proceed or
blocks it based on the answer. Until the client responds, the action is held.

This is why `ask` is the right choice for actions that are usually fine but
occasionally dangerous (`pnpm install` pulling a new dependency, an outbound
`curl`): the human stays in the loop without you having to enumerate every safe
command up front.

## How adapters map a policy

A policy is portable. Each harness adapter translates the same
`allow` / `ask` / `deny` description into its own native permission system:

- A Grok Build harness maps it onto the `grok` CLI's permission flags.
- A Claude Code harness maps it onto Claude Code's permission rules
  (allowed/ask/denied tool and command rules).
- A Codex harness maps it onto Codex's approval and sandbox settings.
- Other harnesses map it onto whatever native gate they expose.

Where a harness can't express a particular rule, it degrades rather than
failing the run — the unsupported rule is skipped (with a warning) instead of
throwing. Because the mapping is the adapter's job, you write the policy once
and it behaves consistently no matter which provider or harness runs the
sandbox.

## Wiring it on

A policy does nothing on its own — it takes effect when you attach it to a
sandbox. Pass it as `policy` on [`defineSandbox`](./providers); from there it
guards every run that uses that sandbox, including the [workspace](./workspace)
setup commands and any host [tools](./tools) bridged into the agent.

```ts
import { defineSandboxPolicy, defineSandbox, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
    ask: ['pnpm install', 'curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask',
})

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  policy,
})
```

## Next steps

- [Providers](./providers) — attach the policy via `defineSandbox`.
- [Workspace](./workspace) — the setup commands and scripts the policy guards.
- [Tools](./tools) — host tools bridged into the agent run under the same policy.
- [Lifecycle](./lifecycle) — how a guarded sandbox resumes and tears down.
