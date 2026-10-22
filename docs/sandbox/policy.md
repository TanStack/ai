---
title: Policy
id: policy
order: 7
description: "Set allow, ask, and deny rules for the commands and capabilities the in-sandbox agent can use. Write them once, and each harness maps them to its own permissions."
---

A policy allows a command, asks for approval, or blocks it. Use it to stop `sudo`, a repo delete, or a call to an unknown host.

A policy holds those rules. `defineSandboxPolicy()` writes them once, and each harness adapter maps them to its own permission system.

## Add a policy

1. Write the rules.
2. Pass them as `policy` to `defineSandbox`.

```ts
import {
  defineSandbox,
  defineSandboxPolicy,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
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

export const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  policy,
})
```

Every run that uses this sandbox now follows the policy, including the bridged [tools](./tools). The policy does not check the [workspace](./workspace) `setup` commands. They come from your own config and run as written.

## Decisions

Each command or capability gets one of three decisions:

| Decision | What happens |
| --- | --- |
| `allow` | The agent runs it. |
| `ask` | The agent pauses. The harness sends an approval request, and the client answers it before the action continues. |
| `deny` | The action is blocked. The agent cannot run it. |

## Commands

`commands` has three lists of patterns: `allow`, `ask`, and `deny`. A pattern matches the command that the agent is about to run.

- `*` is a glob. `curl *` matches every `curl` command. `sudo *` matches everything run through `sudo`.
- A string with no `*`, such as `pnpm test`, matches only that command.

Put your named [workspace scripts](./workspace#scripts) (`pnpm test`, `pnpm build`) in `allow`. They give the policy stable names to match.

## Capabilities

`capabilities` uses the same decisions for broad abilities:

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  capabilities: {
    fileWrite: 'allow', // the agent can edit the working tree
    network: 'ask', // pause for approval before any outbound request
  },
})
```

This is the backstop. A network command that is not in your `commands` lists still needs approval under `network: 'ask'`.

If you omit a capability, it uses the policy `default`. Some providers also enforce `network: 'deny'` when they create the sandbox. See [Providers (Advanced)](./providers-advanced).

## Precedence: deny > ask > allow

When more than one rule matches, the strictest one wins:

1. If a matching rule says `deny`, the action is blocked.
2. Else, if a matching rule says `ask`, the action needs approval.
3. Else, if a rule says `allow`, the action runs.
4. If nothing matches, the `default` applies.

So you can allow a broad family and block one case:

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    // Every `curl` is allowed...
    allow: ['curl *'],
    // ...but `deny` wins, so this host is always blocked.
    deny: ['curl * internal.example.com*'],
  },
  default: 'deny',
})
```

## The default

`default` is the decision for anything that no rule matches. If you omit it, it is `'ask'`.

- `'allow'`: only what you `ask` about or `deny` is gated. Good for trusted dev loops.
- `'ask'`: unknown actions pause for approval. A safe middle.
- `'deny'`: the agent runs only what you `allow`. The strictest choice, for untrusted or production runs.

## How `ask` reaches the user

When the agent tries an `ask` action, the harness pauses it and sends an approval request into the run stream. Your client approves or rejects it. Until the client answers, the action waits.

Use `ask` for actions that are usually fine but sometimes dangerous, such as `pnpm install` with a new dependency, or an outbound `curl`. The human stays in the loop, and you do not have to list every safe command.

## Advanced

### How adapters map a policy

Each harness adapter translates the same policy into its own permissions:

- Grok Build: the permission flags of the `grok` CLI.
- Claude Code: its permission rules (allowed, ask, and denied tool and command rules).
- Codex: its approval and sandbox settings.
- Other harnesses: whatever native gate they have.

If a harness cannot express a rule, it skips that rule with a warning. The run does not fail.

A deny-only list with `default: 'allow'` stays permissive on Grok Build and Codex. Those harnesses keep auto-approve and do not enforce `commands.deny`. The outer sandbox is the isolation there. If you need a deny rule for each command, use Claude Code.

Some providers run as a non-root user, so package installs in `setup` need `sudo`. Do not deny `sudo *` on those providers. See [Providers (Advanced)](./providers-advanced) for the list, and [Workspace](./workspace) for how to write setup commands.

### Network policy on Docker Sandboxes

Most providers leave `capabilities.network` to the harness. `sbxSandbox()` also enforces it on the host HTTP and HTTPS proxy (`networkPolicy: true`).

`sbx policy` can allow or deny hosts. It has no `ask`. Deny wins over allow, so `network: 'deny'` becomes an allowlist, not a full deny.

| TanStack `capabilities.network` | What `sbxSandbox()` writes |
| --- | --- |
| No policy, and no `allowNetwork` or `denyNetwork` | If the policy list is empty, `sbxSandbox()` runs `sbx policy init deny-all`. A known adapter (`grok-build`, `claude-code`, `codex`) then allows its model API host and `localhost` for this sandbox. Unknown adapters stay on the machine preset. |
| No policy, and `allowNetwork` | Allow the model API host (for a known adapter), `localhost`, and `allowNetwork` for this sandbox. Then apply `denyNetwork`. |
| No policy, and `denyNetwork` only | Deny those hosts for this sandbox. Allow stays empty: no automatic hosts and no `localhost`. This adds deny rules on top of the machine preset. |
| `allow` | Allow `**`, then apply `denyNetwork`. |
| `deny` | Allow the model API host, `localhost`, and `allowNetwork`. Then apply `denyNetwork`. |
| `ask` (or the policy `default` when `network` is unset) | The same allowlist as `deny`. The harness still asks for tools and commands. |

Model hosts that are allowed automatically:

- `grok-build`: `api.x.ai`
- `claude-code`: `api.anthropic.com`
- `codex`: `api.openai.com`
- `opencode` or an unknown adapter: none

If the allowlist is empty under `deny` or `ask`, create throws. Pass `allowNetwork`, or use `grokBuildText`, `claudeCodeText`, or `codexText`.

The guest calls `host.docker.internal` for the tool bridge. The `sbx` proxy changes that host to `localhost` before the policy match. `sbxSandbox()` adds `localhost` when it writes a real allowlist. It does not add it for `denyNetwork` only.

```ts
import { sbxSandbox } from '@tanstack/ai-sandbox-docker'
import { defineSandbox, defineSandboxPolicy } from '@tanstack/ai-sandbox'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: sbxSandbox({
    allowNetwork: ['*.npmjs.org', 'registry.npmjs.org'],
  }),
  policy: defineSandboxPolicy({
    capabilities: { network: 'deny' },
    commands: { allow: ['pnpm test'], deny: ['sudo *'] },
  }),
})
```

Command rules and `fileWrite` stay with the harness, because `sbx` does not see command lines.
