---
title: Connect model providers
id: harness-provider-keys
order: 7
description: "Let each user connect their own OpenAI, Anthropic, xAI, fal, or OpenRouter key inside your app with /connect. A harness that you ship needs no .env file."
keywords:
  - tanstack ai
  - harness
  - byok
  - api key
  - providerKeys
  - keyedAdapter
---

You ship your harness to users: a CLI that they install, a desktop app, or a hosted app with accounts. `openaiText('gpt-5.5')` reads `OPENAI_API_KEY` from the environment. Your users do not have your `.env` file, and they do not start your app from a terminal with a key set.

With `providerKeys`, each user runs `/connect openai` in your app and pastes their own key. The harness saves the key for that user and uses it for every turn.

## 1. Define keyed adapters

A keyed adapter waits for a key. `keyedAdapter` takes the provider and a function that makes the adapter from the key:

```ts group=harness-provider-keys
import { keyedAdapter } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'

const gpt = keyedAdapter(openaiByok, (key) => createOpenaiChat('gpt-5.5', key))
const claude = keyedAdapter(anthropicByok, (key) => createAnthropicChat('claude-sonnet-5', key))
```

- `openaiByok` describes the provider: the id `openai`, the label `OpenAI`, and the env var `OPENAI_API_KEY`.
- Each provider package exports one from its `/byok` subpath, for example `anthropicByok`, `grokByok`, `falByok`, and `openrouterByok`.
- `keyedAdapter` works for every adapter kind: text, image, speech, audio, and video.

Before each turn, the session calls your function with the key of the user of that session.

## 2. Add the providerKeys plugin

Give the harness a keyed adapter as its `adapter`. Then list in `providerKeys` every provider that users can connect:

```ts group=harness-provider-keys
import { defineHarness } from '@tanstack/ai-harness'
import { modelPicker, providerKeys } from '@tanstack/ai-harness/plugins'
import { falByok } from '@tanstack/ai-fal/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { openrouterSignIn } from '@tanstack/ai-openrouter/pkce'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: gpt,
  plugins: () => [
    providerKeys({
      providers: [
        { ...openaiByok, keyUrl: 'https://platform.openai.com/api-keys' },
        anthropicByok,
        grokByok,
        falByok,
        { ...openrouterByok, signIn: openrouterSignIn() },
      ],
    }),
    modelPicker({ choices: { gpt, claude }, default: 'gpt' }),
  ],
})
```

- For each provider, `providerKeys` adds `/connect <id>` and `/disconnect <id>`. It also adds `/keys`.
- `modelPicker`, `compact`, and `goal` also take keyed adapters. After `/model claude`, the next turn uses the Anthropic key of the user.
- `signIn` is optional. OpenRouter has one. See [Sign in with OpenRouter](#sign-in-with-openrouter).
- `keyUrl` is optional. It is the page where the user makes a key. `/connect` opens it in the browser, then asks for the key.

## 3. Connect a provider

This is what your user does in the CLI:

1. Run `/connect openai`.
2. The page to make a key opens in the browser (from `keyUrl`). The harness asks you to paste the key. In a terminal, the CLI hides what you type.
3. Paste the key and press Enter.
4. The CLI prints `Connected to OpenAI (key ...abcd).`

`/disconnect openai` deletes the key. `/keys` shows where each key comes from:

```text
OpenAI: connected (key ...abcd)
Anthropic: from the ANTHROPIC_API_KEY env var
xAI Grok: missing. Run /connect grok.
fal.ai: missing. Run /connect fal.
OpenRouter: missing. Run /connect openrouter.
```

In [your own UI](./custom-ui), read the same list from `state.plugins['tanstack/provider-keys'].providers`. Each entry has an `id`, a `label`, and a `state`: `connected`, `env`, or `missing`. The key question has `secret: true`, so show a password field for it.

### Sign in with OpenRouter

OpenRouter has a browser sign-in, so users do not copy a key. `openrouterSignIn()` in the providers list turns it on:

1. Run `/connect openrouter`.
2. The CLI opens the OpenRouter sign-in page in the browser. Sign in and approve.
3. The browser shows `You are signed in to OpenRouter. You can close this tab.`
4. The CLI prints `Connected to OpenRouter (key ...wxyz).`

The sign-in uses PKCE. It listens on `127.0.0.1` on a random port for one callback, and it checks a random state. After 10 minutes it stops. To change the time, pass `openrouterSignIn({ timeoutMs })`.

The listener runs on the computer of the harness. So the sign-in works when the harness and the browser are on the same computer: a CLI or a desktop app. In a hosted app, remove `signIn`, and users paste their OpenRouter key.

OpenAI and Anthropic have no sign-in for other apps, so users paste a key.

## When a key is missing

If a turn needs a key that the user did not connect, the turn stops before the model call:

- Clients get a `harness.auth_required` event with the provider id.
- The CLI prints `Sign in to openai. Run /connect openai.`
- The turn fails with `Sign in to openai first. Run /connect openai.`

After `/connect openai`, send the message again.

## Where the keys are stored

`/connect` saves the key in the credential store of the host, as an `api_key` credential with the provider id. The store keeps it for the user of the session:

- CLI or desktop app: a file in the home folder of the user. The [CLI example](https://github.com/TanStack/ai/blob/main/examples/harness-cli/src/credentials.ts) has one. Give it to `runCli` in `persistence`.
- Hosted app: your database. The principal that `authorize` returns is the user, so each user has their own keys. Write the store with `defineCredentialStore`, as in [Auth and connectors](./auth#keep-credentials).
- No credential store: the keys stay in memory until the process stops.

Encrypt the keys at rest in a real store.

## Use an Anthropic token

Your keyed adapter factory receives the credential stored for that user. For an OAuth token, pass it as `authToken` and select OAuth:

```ts
import { keyedAdapter } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'

const tokenAdapter = keyedAdapter(anthropicByok, (token) =>
  anthropicText('claude-sonnet-5-5', {
    authToken: token,
    oauth: true,
  }),
)
```

Use that adapter in the same harness setup shown above. Its explicit token takes precedence over environment credentials. `providerKeys` stores the supplied credential. The adapter factory selects its authentication mode.

For a Bearer token that does not use OAuth, omit `oauth: true`. See [Bearer and OAuth tokens](../adapters/anthropic#bearer-and-oauth-tokens) for token detection and environment precedence.

## The env var still works

If the user has no saved key, the session reads the env var of the provider, for example `OPENAI_API_KEY`. A saved key wins over the env var. So you can develop with a `.env` file, and your users connect in the app.

## Use the key of the user in an agent

Your agent makes images with fal, so it needs the fal key of the user. Every agent gets `ctx.keys`. In a harness, `ctx.keys` reads the same keys as the turn:

```ts group=harness-provider-keys
import { defineAgent } from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'
import { z } from 'zod'

const flux = keyedAdapter(falByok, (key) => falImage('fal-ai/flux/dev', { apiKey: key }))

export const illustrator = defineAgent({
  name: 'illustrator',
  description: 'Draws an image from a prompt',
  inputSchema: z.object({ prompt: z.string() }),
  run: async (ctx) =>
    ctx.generateImage({
      adapter: await ctx.keys.adapter(flux),
      prompt: ctx.input.prompt,
    }),
})
```

Put the agent in `subagents.agents` of the harness, and the model calls it as a tool.

- `ctx.keys.adapter(adapter)`: makes a keyed adapter with the key of the user. A plain adapter comes back unchanged.
- `ctx.keys.get(provider)`: the key, or `null`.
- `ctx.keys.require(provider)`: the key. If it is missing, the run stops with `harness.auth_required`, the same as a turn.
- The children of the agent get the same keys.
- Plugins get the same keys as `ctx.keys` in `setup`.

Outside a harness, `ctx.keys` reads the env var. See [Keys inside agents](../advanced/byok#keys-inside-agents).

## Keep keys safe

- A key shows masked only: `...` and the last 4 characters.
- The plugin never puts a key in an event, the transcript, or a command result.
- The answer to the key question does not go into the inbox of the session.
- Do not log a key. For error messages, use `maskKey` from `@tanstack/ai/byok`.

## What you have now

- `/connect` for OpenAI, Anthropic, xAI, fal, and OpenRouter in the harness that you ship, with no `.env` file.
- One key for each user, in your credential store.
- The env var as a fallback while you develop.
- Agents and plugins that use the key of the user through `ctx.keys`.

Next: serve the harness to signed-in users with [Connect clients](./connect).
