---
title: Sign in with a ChatGPT or SuperGrok plan
id: harness-plan-sign-in
order: 11
description: "Let the users of your CLI or desktop harness run Codex and Grok Build with their own ChatGPT or SuperGrok plan. /connect signs in through the vendor CLI, so users need no API key."
keywords:
  - tanstack ai
  - harness
  - codex
  - grok build
  - chatgpt plan
  - supergrok
  - codexPlanLogin
  - grokBuildPlanLogin
---

Add `login: codexPlanLogin()` to the Codex provider in `providerKeys`. Then `/connect:codex` signs the user in with their own ChatGPT plan, and the Codex adapter runs with that login and no API key. Grok Build works the same way with `grokBuildPlanLogin()` and a SuperGrok plan.

Use this for a harness that runs on the computer of the user: a CLI or a desktop app. The login belongs to the machine, so it is not for a hosted app with many users.

## 1. Add the plan login on the server

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build
vue: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build
solid: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build
svelte: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build
preact: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build
angular: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build
octane: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build
vanilla: @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai @tanstack/ai-sandbox @tanstack/ai-sandbox-local-process @tanstack/ai-codex @tanstack/ai-grok-build

<!-- ::end:tabs -->

Give each provider a `login`, and give each adapter `authMode: 'host'`:

```ts group=harness-plan-sign-in
import { defineHarness } from '@tanstack/ai-harness'
import { providerKeys } from '@tanstack/ai-harness/plugins'
import { codexPlanLogin, codexText } from '@tanstack/ai-codex'
import { codexByok } from '@tanstack/ai-codex/byok'
import { grokBuildPlanLogin, grokBuildText } from '@tanstack/ai-grok-build'
import { grokBuildByok } from '@tanstack/ai-grok-build/byok'
import { openaiText } from '@tanstack/ai-openai'
import { defineSandbox, defineWorkspace, localSource } from '@tanstack/ai-sandbox'
import { codingAgents } from '@tanstack/ai-sandbox/harness'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const repo = '/path/to/your/repo'

export const lead = defineHarness({
  name: 'acme/lead',
  adapter: openaiText('gpt-6.1-sol'),
  expose: {
    commands: ['connect:codex', 'disconnect:codex', 'connect:grok-build', 'disconnect:grok-build', 'keys'],
  },
  plugins: () => [
    providerKeys({
      providers: [
        { ...codexByok, login: codexPlanLogin() },
        { ...grokBuildByok, login: grokBuildPlanLogin() },
      ],
    }),
    codingAgents({
      sandbox: defineSandbox({
        id: 'repo',
        provider: localProcessSandbox({ dir: repo }),
        workspace: defineWorkspace({ source: localSource(repo) }),
      }),
      agents: {
        codex: {
          adapter: codexText('gpt-6.1-sol', { authMode: 'host' }),
          description: 'Quick fixes and tests',
        },
        grok: {
          adapter: grokBuildText('grok-4.7-build-fast', { authMode: 'host' }),
          description: 'Larger changes and refactors',
        },
      },
    }),
  ],
})
```

- `login` turns `/connect:codex` and `/connect:grok-build` into a plan sign-in. These commands ask for no key.
- `authMode: 'host'` makes the adapter use the CLI login of the machine. The default is `'api-key'`.
- A plan login can use only the models of the plan. For example, a ChatGPT plan rejects `gpt-5.3-codex`. Run `grok models` to see the Grok models of a plan. In Codex, run `/model`.
- `expose.commands` lets a client UI run the commands. A CLI from `runCli` does not need it.
- The `codex` and `grok` CLIs must be on the `PATH` of the machine.
- The lead model needs its own key. See [Connect model providers](./provider-keys).

For more about `codingAgents`, see [Delegate to coding agents](./coding-agents).

## 2. Connect a plan

1. The user runs `/connect:codex`.
2. The harness runs `codex login --device-auth` on the machine. For Grok Build, it runs `grok login --device-auth`.
3. The session sends a `harness.auth_required` event with the sign-in page (`url`) and the code (`userCode`).
4. The user opens the page, signs in, and types the code.
5. The CLI exits, and the command returns `Signed in to Codex with your ChatGPT plan.`

If the user cancels the command, the harness stops the CLI.

## 3. Show the page and the code on the client

A CLI from `runCli` shows them for you:

```text
Sign in to codex. Open https://auth.example.com/device and enter the code ABCD-1234.
```

For your own UI, first serve the harness. Mount the handler on `/api/harness`:

```ts group=harness-plan-sign-in
import { createHarnessHost, membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'

// A long random secret. The UI sends the same one.
const token = process.env.HARNESS_TOKEN

const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    // With no token set, nobody gets in.
    getUser: ({ request }) =>
      token && request.headers.get('authorization') === `Bearer ${token}`
        ? { id: 'me' }
        : null,
    rules: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: lead })
```

The plan login belongs to the machine, so let only the user of the machine in. Set `HARNESS_TOKEN` on the server, and give the UI the same value. See [Access and tenants](./access).

Then listen for `signIn` on the session view, and run the exposed command:

```ts group=harness-plan-sign-in-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import { createSessionView } from '@tanstack/ai-harness/view'

const view = createSessionView(
  createHarnessClient({
    url: '/api/harness',
    threadId: 'ada-chat',
    headers: { authorization: 'Bearer my-token' },
  }),
)

view.on('signIn', ({ connector, url, userCode }) => {
  if (!url) return
  console.log(`Sign in to ${connector}: open ${url}`)
  if (userCode) console.log(`Enter this code on that page: ${userCode}`)
})

export const connectCodex = () => view.runCommand({ name: 'connect:codex' })
```

The client gets only the page and the code. The tokens stay in the login file of the CLI on the machine. The harness keeps no copy of them.

## Check the sign-in

`/keys` shows the plan:

```text
Codex: signed in with your ChatGPT plan
Grok Build: missing. Run /connect grok-build.
```

For each provider, `/keys` uses the first of these that it finds:

1. A saved API key.
2. The plan sign-in.
3. The env var, for example `CODEX_API_KEY`.
4. Nothing: `missing`.

In your own UI, the plan sign-in has `state: 'plan'` in `session.snapshot().plugins['tanstack/provider-keys'].providers`.

## Where the login lives

The CLI keeps the login in its own file:

- Codex: `$CODEX_HOME/auth.json`, or `~/.codex/auth.json` when `CODEX_HOME` is not set.
- Grok Build: `~/.grok/auth.json`.

The machine has one login for each CLI, and the terminal of the user shares it. So:

- If the user already ran `codex login` in a terminal, `/keys` already shows the plan.
- `/disconnect:codex` runs `codex logout`. This also signs the user out of Codex in their terminal. It also deletes a saved Codex key.

### Codex logins in the OS keyring

Codex can keep its login in the OS keyring, with `cli_auth_credentials_store = "keyring"` or `"auto"` in `~/.codex/config.toml`. Then there is no `auth.json`, and the harness cannot see the login:

- `/keys` does not show the plan, also after a good `/connect:codex`.
- A local-process run still works, because `codex` reads the keyring itself.
- A Docker or cloud sandbox run fails with `No Codex login on this machine. Run /connect:codex.`

To fix it, keep the login in a file. Set this in `~/.codex/config.toml`, then run `/connect:codex` again:

```toml
cli_auth_credentials_store = "file"
```

## Run in Docker or a cloud sandbox

The sample above uses a local-process sandbox, so the CLI reads the login file of the machine. Docker and cloud sandboxes also work: the adapter copies the login file into the sandbox for each run, and deletes it after the run. See [Use the host login in Docker or a cloud sandbox](../sandbox/auth#use-the-host-login-in-docker-or-a-cloud-sandbox).

## Vendor terms

Each vendor has its own terms for a plan login. Read them before you ship:

- OpenAI: [Sign in to Codex](https://learn.chatgpt.com/docs/auth) and the [Terms of Use](https://openai.com/policies/terms-of-use/).
- xAI: the [Terms of Service](https://x.ai/legal/terms-of-service).

Claude plans have no sign-in here. Anthropic does not let third-party apps offer Claude.ai login. See [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance). Claude Code users sign in with an Anthropic API key.

## What you have now

- `/connect:codex` and `/connect:grok-build` sign users in with their own ChatGPT or SuperGrok plan, with no API key.
- Your UI shows the sign-in page and the code. The tokens never go to the browser.
- `/keys` shows `signed in with your ChatGPT plan`, and `/disconnect` signs out.
