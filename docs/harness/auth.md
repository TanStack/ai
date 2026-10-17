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
import type { HarnessRunContext } from '@tanstack/ai-harness'

const github = oauthConnector({
  id: 'github',
  label: 'GitHub',
  // The harness runs on the user's machine (a CLI), so open a browser here.
  login: 'loopback',
  oauth: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    deviceUrl: 'https://github.com/login/device/code',
    clientId: 'your-github-oauth-app-client-id',
    scopes: ['repo'],
  },
  tools: (token) => [
    toolDefinition({ name: 'list_issues', description: 'List my open issues' }).server<HarnessRunContext>(
      async (_args, ctx) => {
        const response = await fetch('https://api.github.com/issues', {
          headers: { authorization: `Bearer ${await token({ run: ctx.context.run })}` },
        })
        return response.json()
      },
    ),
  ],
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [github],
})
```

`token({ run })` returns a fresh access token of the user of that run. It refreshes an expired token when the service gave a refresh token. Pass the `run` of the tool call, `ctx.context.run`, so each user gets their own token. See [Act as the user of a run](./plugins#act-as-the-user-of-a-run).

## 2. Sign in

- The user runs `/connect github`.
- With `login: 'loopback'`, the CLI opens the browser. The harness listens on `127.0.0.1` on a random port for one callback, with PKCE and a random `state`.
- With `oauth.issuer` set, the sign-in refuses a code that the service sends with another `iss` (RFC 9207).
- The token goes into the credential store. `/disconnect github` deletes it.
- A cancel of the command, or a close of the session, stops a sign-in that waits. The listener on `127.0.0.1` closes at once.

`login` is required. Use `login: 'device'` for a harness on a server, and for SSH sessions, containers, and CI. The user then gets a code to enter on the service's page. Device login needs `oauth.deviceUrl`.

If a tool runs before sign-in, it stops with a `harness.auth_required` event. The CLI shows which service to connect. In your own app, `session.onAuthRequired` tells you which service to show:

```ts group=harness-auth-prompt
import type { HarnessSession } from '@tanstack/ai-harness'

export function showSignIns(session: HarnessSession) {
  // Call the returned function to stop the calls.
  return session.onAuthRequired(({ connector, url, userCode }) => {
    console.log(`Sign in to ${connector}: ${url ?? `run /connect ${connector}`}`)
    if (userCode) console.log(`Enter this code on that page: ${userCode}`)
  })
}
```

## Wait for the sign-in

A turn from a background agent or an email runs while nobody watches it. That turn can need a sign-in. Without a sign-in, the tool fails, and the work of that turn stops. Pass `wait: true` to `token`. Then the turn waits for the sign-in and continues after it.

```ts group=harness-auth-wait
import { toolDefinition } from '@tanstack/ai'
import { defineHarness, oauthConnector } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import type { HarnessRunContext } from '@tanstack/ai-harness'

const github = oauthConnector({
  id: 'github',
  label: 'GitHub',
  // The server cannot open a browser for the user, so show a code.
  login: 'device',
  oauth: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    deviceUrl: 'https://github.com/login/device/code',
    clientId: 'your-github-oauth-app-client-id',
    scopes: ['repo'],
  },
  tools: (token) => [
    toolDefinition({ name: 'list_issues', description: 'List my open issues' }).server<HarnessRunContext>(
      async (_args, ctx) => {
        const response = await fetch('https://api.github.com/issues', {
          headers: { authorization: `Bearer ${await token({ run: ctx.context.run, wait: true })}` },
        })
        return response.json()
      },
    ),
  ],
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [github],
  // A web app starts the sign-in with this command.
  expose: { commands: ['connect:github'] },
})
```

In a tool of your own plugin, use `ctx.context.run.credentials.require('github', { wait: true })`.

When the credential is missing, the turn stops with an interrupt:

- The interrupt has `reason: 'auth_required'`. Its `metadata['tanstack:interruptPayload'].request.connector` is `'github'`.
- The sign-in belongs to the sender of the stopped turn. When that person saves the credential, the same turn continues as that person, and the tool runs again. The save can be `/connect github`, the `connect:github` command, or `run.credentials.set` in a command of your own.
- A credential that another person saves never continues the turn.
- To stop the wait, resolve the interrupt with `status: 'cancelled'`. Then the tool fails, the same as without `wait`.
- On a [durable host](./durable-sessions), the wait continues after a restart.
- `wait` is for a tool of the running chat turn. Do not pass it in a command, a background agent, or a hook. The credentials of a command never wait.
- Provider keys (`run.keys.require`) do not wait.

In a web app, the wait shows in `state.signIns` of the session view, also after a reload. When the user presses your connect button, run the connector command. Each sign-in then has the `url` and the `userCode` to show. A client can run only the commands in `expose.commands`, so the harness above exposes `connect:github` (see [Choose what clients can change](./connect#choose-what-clients-can-change)):

```ts group=harness-auth-wait-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import { createSessionView } from '@tanstack/ai-harness/view'

const view = createSessionView(
  createHarnessClient({ url: '/api/harness', threadId: 'user-1-thread' }),
)

view.on('signIn', (signIn) => {
  console.log(`Connect ${signIn.connector} to continue the turn.`)
})

export const connectGithub = () => view.command({ name: 'connect:github' })
```

After the sign-in, the turn finishes its work with no new message.

## Keep credentials

Pass a credential store to the host. The host reads credentials from it, keyed by the user of each run. Without one, credentials live in memory until the process stops. When several people write in one thread, see [Share a thread between people](./shared-threads).

```ts group=harness-auth
import { defineCredentialStore } from '@tanstack/ai/byok'
import type { Credential } from '@tanstack/ai/byok'

const saved = new Map<string, Credential>()
const keyOf = (userId: string | undefined, id: string) => `${userId ?? 'tenant'}:${id}`

export const credentials = defineCredentialStore({
  get: async ({ scope, id }) => saved.get(keyOf(scope.userId, id)) ?? null,
  set: async ({ scope, id, credential }) => {
    saved.set(keyOf(scope.userId, id), credential)
  },
  delete: async ({ scope, id }) => {
    saved.delete(keyOf(scope.userId, id))
  },
  list: async (scope) =>
    [...saved.entries()]
      .filter(([key]) => key.startsWith(`${scope.userId ?? 'tenant'}:`))
      .map(([key, credential]) => ({ id: key.split(':')[1] ?? key, type: credential.type })),
})
```

```ts group=harness-auth
import { createHarnessHost } from '@tanstack/ai-harness'

export const host = createHarnessHost({ credentials })
```

The store can be a table in your own database or a secrets manager. See the rules in [Write a store for production](../advanced/server-keys#write-a-store-for-production).

- Encrypt tokens at rest in a real store.
- `list` returns ids and types only, never the secret values.
- A credential saved without a `userId` belongs to the whole tenant. A user who has no credential of their own uses it. See [Share one credential with the whole organization](./shared-threads#share-one-credential-with-the-whole-organization).

## Read credentials in your own plugin

Your plugin reads the credentials of the user of each run:

- In a tool or a middleware hook, `ctx.context.run.credentials.require('github')` returns the credential. Before the user signs in, it stops with `auth_required`.
- In a command, use `run.credentials` of the command context.
- The `ctx.credentials` of a session plugin have no user, so each call throws.

See [Act as the user of a run](./plugins#act-as-the-user-of-a-run).

## Write your own sign-in command

`oauthConnector` covers most services. For a sign-in of your own, use the helpers from `@tanstack/ai-harness/oauth`. Pass the `signal` of the command, so a cancel stops the sign-in at once:

```ts group=harness-auth-own
import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { deviceLogin, isExpired, refreshCredential } from '@tanstack/ai-harness/oauth'
import type { OAuthConfig } from '@tanstack/ai-harness/oauth'

const gitlab: OAuthConfig = {
  authorizationUrl: 'https://gitlab.com/oauth/authorize',
  tokenUrl: 'https://gitlab.com/oauth/token',
  deviceUrl: 'https://gitlab.com/oauth/authorize_device',
  clientId: 'your-gitlab-app-client-id',
  scopes: ['read_api'],
}

export const gitlabLogin = definePlugin({
  name: 'acme/gitlab-login',
  setup: (ctx) => ({
    commands: {
      'connect:gitlab': defineCommand({
        description: 'Sign in to GitLab',
        run: async (_input, { credentials, signal }) => {
          const credential = await deviceLogin(gitlab, {
            onCode: ({ userCode, verificationUri }) =>
              ctx.session.authRequired({ connector: 'gitlab', url: verificationUri, userCode }),
            signal,
          })
          await credentials.set({ id: 'gitlab', credential })
          return 'Connected to GitLab.'
        },
      }),
    },
  }),
})
```

A tool refreshes an expired token with the `signal` of its run, so the refresh stops with the run:

```ts group=harness-auth-own
import { toolDefinition } from '@tanstack/ai'
import type { HarnessRunContext } from '@tanstack/ai-harness'

export const gitlabProjects = toolDefinition({
  name: 'gitlab_projects',
  description: 'List my GitLab projects',
}).server<HarnessRunContext>(async (_args, ctx) => {
  const { credentials, signal } = ctx.context.run
  let credential = await credentials.require('gitlab')
  if (isExpired(credential)) {
    credential = await refreshCredential(gitlab, credential, { signal })
    await credentials.set({ id: 'gitlab', credential })
  }
  const token = credential.type === 'api_key' ? credential.value : credential.accessToken
  const response = await fetch('https://gitlab.com/api/v4/projects?membership=true', {
    headers: { authorization: `Bearer ${token}` },
    signal,
  })
  return response.json()
})
```

- `deviceLogin`, `loopbackLogin`, `exchangeCode`, and `refreshCredential` take a `signal`. When it aborts, the call stops at once and rejects with the reason of the signal.
- The `signal` of a command aborts on a cancel of the command and on a close of the session.
- `loopbackLogin` takes `timeoutMs`. The default is 10 minutes. This timer does not keep the process alive.
- When another library runs the OAuth flow, `startLoopbackReceiver({ timeoutMs, signal })` only waits for the callback. `waitForCode(state)` gives the code and the `iss` of the callback.

## What you have now

- Browser and device-code sign-in for any OAuth service.
- Tools that get a fresh token without the model seeing it.
- Turns that wait for a sign-in and then finish their work.
- Sign-ins of your own that stop at once on a cancel.
