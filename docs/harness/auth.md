---
title: Auth and connectors
id: harness-auth
order: 7
description: "Let users sign in to GitHub and other OAuth services from the harness. Tokens stay in your credential store and never reach the model."
keywords:
  - tanstack ai
  - harness
  - oauth
  - connectors
  - credentials
---

Your agent needs to open a pull request, so it needs the user's GitHub token. The user should sign in once, in the browser, and the model should never see the token. `oauthConnector` does that: it adds `/connect github`, stores the token, and hands it to your tools.

## 1. Add a connector

```ts group=harness-auth
import { toolDefinition } from '@tanstack/ai'
import { defineHarness, oauthConnector } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'

const github = oauthConnector({
  id: 'github',
  label: 'GitHub',
  oauth: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    deviceUrl: 'https://github.com/login/device/code',
    clientId: 'your-github-oauth-app-client-id',
    scopes: ['repo'],
  },
  tools: (token) => [
    toolDefinition({ name: 'list_issues', description: 'List my open issues' }).server(
      async () => {
        const response = await fetch('https://api.github.com/issues', {
          headers: { authorization: `Bearer ${await token()}` },
        })
        return response.json()
      },
    ),
  ],
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  plugins: () => [github],
})
```

`token()` returns a fresh access token. It refreshes an expired token when the service gave a refresh token.

## 2. Sign in

- The user runs `/connect github`.
- The CLI opens the browser. The harness listens on `127.0.0.1` on a random port for one callback, with PKCE and a random `state`.
- The token goes into the credential store. `/disconnect github` deletes it.

Set `login: 'device'` for SSH sessions, containers, and CI. The CLI then shows a code to enter on the service's page.

If a tool runs before sign-in, it stops with a `harness.auth_required` event. The CLI shows which service to connect.

## Wait for the sign-in

A turn from a background agent or an email runs while nobody watches it. That turn can need a sign-in. Without a sign-in, the tool fails, and the work of that turn stops. Pass `wait: true` to `token()`. Then the turn waits for the sign-in and continues after it.

```ts group=harness-auth-wait
import { toolDefinition } from '@tanstack/ai'
import { defineHarness, oauthConnector } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'

const github = oauthConnector({
  id: 'github',
  label: 'GitHub',
  oauth: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    deviceUrl: 'https://github.com/login/device/code',
    clientId: 'your-github-oauth-app-client-id',
    scopes: ['repo'],
  },
  tools: (token) => [
    toolDefinition({ name: 'list_issues', description: 'List my open issues' }).server(
      async () => {
        const response = await fetch('https://api.github.com/issues', {
          headers: { authorization: `Bearer ${await token({ wait: true })}` },
        })
        return response.json()
      },
    ),
  ],
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  plugins: () => [github],
})
```

In your own plugin, use `ctx.credentials.require('github', { wait: true })`.

When the credential is missing, the turn stops with an interrupt:

- The interrupt has `reason: 'auth_required'`. Its `metadata['tanstack:interruptPayload'].request.connector` is `'github'`.
- The sign-in belongs to the sender of the stopped turn. When that person saves the credential, the same turn continues as that person, and the tool runs again. The save can be `/connect github`, the `connect:github` command, or `ctx.credentials.set`.
- A credential that another person saves never continues the turn.
- To stop the wait, resolve the interrupt with `status: 'cancelled'`. Then the tool fails, the same as without `wait`.
- On a durable host, the wait continues after a restart.
- `wait` is for a tool of the running chat turn. Do not pass it in a command, a background agent, or a hook. The credentials of a command never wait.
- Provider keys (`ctx.keys.require`) do not wait.

In a web app, the wait shows in `state.signIns` of the session view, also after a reload. When the user presses your connect button, run the connector command:

```ts group=harness-auth-wait-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import { createSessionView } from '@tanstack/ai-harness/view'

const view = createSessionView(
  createHarnessClient({ url: '/api/harness', threadId: 'user-1-thread' }),
)

view.on('signIn', (signIn) => {
  console.log(`Connect ${signIn.connector} to continue the turn.`)
})

export const connectGithub = () => view.command('connect:github')
```

After the sign-in, the turn finishes its work with no new message.

## Keep credentials

The host reads credentials from `stores.credentials`, keyed by the sender of the running turn. Without it, credentials live in memory until the process stops. When several people write in one thread, see [Share a thread between people](./shared-threads).

```ts group=harness-auth
import { defineCredentialStore } from '@tanstack/ai-persistence'
import type { Credential } from '@tanstack/ai-persistence'

const saved = new Map<string, Credential>()
const keyOf = (userId: string | undefined, id: string) => `${userId ?? 'tenant'}:${id}`

export const credentials = defineCredentialStore({
  get: async (scope, id) => saved.get(keyOf(scope.userId, id)) ?? null,
  set: async (scope, id, credential) => {
    saved.set(keyOf(scope.userId, id), credential)
  },
  delete: async (scope, id) => {
    saved.delete(keyOf(scope.userId, id))
  },
  list: async (scope) =>
    [...saved.entries()]
      .filter(([key]) => key.startsWith(`${scope.userId ?? 'tenant'}:`))
      .map(([key, credential]) => ({ id: key.split(':')[1] ?? key, type: credential.type })),
})
```

- Encrypt tokens at rest in a real store.
- `list` returns ids and types only, never the secret values.
- A credential saved without a `userId` belongs to the whole tenant. A user who has no credential of their own uses it. See [Share one credential with the whole organization](./shared-threads#share-one-credential-with-the-whole-organization).

## Read credentials in your own plugin

`ctx.credentials.require('github')` returns the credential, or stops with `auth_required` when the user has not signed in. Plugins read only the credentials of the sender of the running turn. Outside a turn, they read the credentials of the person who opened the session.

## What you have now

- Browser and device-code sign-in for any OAuth service.
- Tools that get a fresh token without the model seeing it.
- Turns that wait for a sign-in and then finish their work.
