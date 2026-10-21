---
title: MCP Server Auth
id: mcp-server-auth
order: 13
description: "Accept the access tokens that your authorization server issues, so only a signed-in user can call your MCP tools."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp server
  - bearer token
  - createMCPServer
  - OAuthTokenVerifier
  - jwtVerifier
  - introspectionVerifier
  - oauthMetadataResponse
---

Your MCP server is on a public URL. Any client that can reach that URL can call your tools.

Pass `auth` to `createMCPServer`. The server then checks the access token on each request, and a missing or bad token gets 401.

## Quick setup

Most providers issue a JWT and publish their keys at a JWKS URL. Auth0, Clerk, WorkOS, Keycloak, Supabase, and the Better Auth MCP plugin all do.

1. Find the issuer URL and the JWKS URL of your provider.
2. In your provider, register the URL of your MCP server as the audience of the token.
3. Pass `jwtVerifier` to `auth`:

```ts
import { createMCPServer, jwtVerifier } from '@tanstack/ai-mcp/server'

const server = createMCPServer({
  name: 'notes',
  version: '1.0.0',
  auth: {
    verifier: jwtVerifier({
      jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
      issuer: 'https://auth.example.com/',
      audience: 'https://mcp.example.com/mcp',
    }),
  },
})

export default {
  async fetch(request: Request) {
    return server.fetch(request)
  },
}
```

4. Add your tools on the `tools` field.

Now a request with no token, or with a bad token, gets 401. A request with a valid token from your provider calls your tools.

## How it works

An MCP server is an OAuth resource server. It does not sign users in:

- Your authorization server signs the user in and issues the access token.
- The MCP client sends that token on each request.
- The MCP server checks the token with the `verifier`.

`jwtVerifier` checks the signature, `iss`, `aud`, `exp`, and `nbf`. It reads the keys from `jwksUrl` and caches them. A token that fails one check gets 401.

## Tell clients where to sign in

An MCP client finds your authorization server through two documents on your origin. Serve them with `oauthMetadataResponse` next to the MCP route. Pass `resourceMetadataUrl` to `auth`, so the 401 response names the first document.

```ts
import {
  createMCPServer,
  getOAuthProtectedResourceMetadataUrl,
  jwtVerifier,
  oauthMetadataResponse,
} from '@tanstack/ai-mcp/server'

const mcpUrl = new URL('https://mcp.example.com/mcp')
const metadata = {
  resourceServerUrl: mcpUrl,
  oauthMetadata: {
    issuer: 'https://auth.example.com/',
    authorization_endpoint: 'https://auth.example.com/oauth/authorize',
    token_endpoint: 'https://auth.example.com/oauth/token',
    response_types_supported: ['code'],
  },
}

const server = createMCPServer({
  name: 'notes',
  version: '1.0.0',
  auth: {
    verifier: jwtVerifier({
      jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
      issuer: 'https://auth.example.com/',
      audience: mcpUrl.href,
    }),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
  },
})

export default {
  async fetch(request: Request) {
    return oauthMetadataResponse(request, metadata) ?? server.fetch(request)
  },
}
```

The two documents:

- `/.well-known/oauth-protected-resource/mcp` is the RFC 9728 document. It names your authorization server.
- `/.well-known/oauth-authorization-server` is the RFC 8414 document. It is `oauthMetadata`, served as is.

Copy `oauthMetadata` from the discovery document of your provider.

## Read the caller in a tool

The verified token is on `ctx.context.authInfo`. Give `.server()` the type `MCPToolContext`.

```ts
import { toolDefinition } from '@tanstack/ai'
import type { MCPToolContext } from '@tanstack/ai-mcp/server'
import { z } from 'zod'

export const listNotes = toolDefinition({
  name: 'list_notes',
  description: 'List the notes of the signed-in user',
  inputSchema: z.object({}),
}).server<MCPToolContext>(async (_args, ctx) => {
  const userId = ctx.context.authInfo?.extra?.sub
  if (typeof userId !== 'string') {
    throw new Error('This tool needs a signed-in user.')
  }
  return { userId, notes: [] }
})
```

`authInfo` is `undefined` in two cases:

- The server has no `auth`.
- The client is `createMCPClient({ server })`.

## Require a scope

Pass `requiredScopes`. A token without one of those scopes gets 403 with `insufficient_scope`.

```ts
import { createMCPServer, jwtVerifier } from '@tanstack/ai-mcp/server'

const server = createMCPServer({
  name: 'notes',
  version: '1.0.0',
  auth: {
    verifier: jwtVerifier({
      jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
      issuer: 'https://auth.example.com/',
      audience: 'https://mcp.example.com/mcp',
    }),
    requiredScopes: ['notes:read'],
  },
})
```

## Advanced

### Verify an opaque token

If your provider issues opaque tokens, pass `introspectionVerifier`. It posts the token to the RFC 7662 introspection endpoint, with the client credentials of your MCP server.

```ts
import { createMCPServer, introspectionVerifier } from '@tanstack/ai-mcp/server'

const server = createMCPServer({
  name: 'notes',
  version: '1.0.0',
  auth: {
    verifier: introspectionVerifier({
      introspectionUrl: 'https://auth.example.com/oauth/introspect',
      clientId: process.env.OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.OAUTH_CLIENT_SECRET ?? '',
    }),
  },
})
```

A token that is not `active` gets 401. If the endpoint is down, the caller gets 500.

### Write your own verifier

`verifier` is the `OAuthTokenVerifier` type from the MCP SDK. It has one method, `verifyAccessToken`. Return an `AuthInfo`, or throw `OAuthError` with `OAuthErrorCode.InvalidToken`.

```ts
import { OAuthError, OAuthErrorCode, createMCPServer } from '@tanstack/ai-mcp/server'
import type { OAuthTokenVerifier } from '@tanstack/ai-mcp/server'
import { findSession } from './sessions'

const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token) {
    const session = await findSession(token)
    if (session === undefined) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token')
    }
    return {
      token,
      clientId: session.appId,
      scopes: session.scopes,
      expiresAt: session.expiresAt,
      extra: { sub: session.userId },
    }
  },
}

const server = createMCPServer({
  name: 'notes',
  version: '1.0.0',
  auth: { verifier },
})
```

`expiresAt` is required. The SDK rejects an `AuthInfo` without it.

### Use the auth you already have

Your app already checks the caller in a middleware. That middleware puts the user and a database handle on the request. You do not want to check the token a second time in `createMCPServer`.

Pass the verified token and your values to `server.handle`. The server skips its `auth` gate for that request. Every tool call, resource read, and resource list of that request reads your values on `ctx.context`.

```ts
import { server } from './mcp-server'
import { verifyCaller } from './auth'

export async function handleMcp(request: Request) {
  const caller = await verifyCaller(request)
  if (caller instanceof Response) return caller
  return server.handle(request, {
    authInfo: caller.authInfo,
    context: { db: caller.db },
  })
}
```

`server.fetch(request)` stays a plain Fetch handler. `server.handle` is the same handler with options.

In a tool, name the values that you expect with `MCPToolContext`:

```ts
import { toolDefinition } from '@tanstack/ai'
import type { MCPToolContext } from '@tanstack/ai-mcp/server'
import { z } from 'zod'
import type { Db } from './db'

export const listNotes = toolDefinition({
  name: 'list_notes',
  description: 'List the notes of the signed-in user',
  inputSchema: z.object({}),
}).server<MCPToolContext<{ db: Db }>>(async (_args, ctx) => {
  return ctx.context.db.notes.list()
})
```

- `authInfo` is the SDK `AuthInfo`. A tool or a resource reads it as `ctx.context.authInfo`.
- `context` sits next to `authInfo`, `requestInput`, and `sample` on `ctx.context`. If one of your values has one of those three names, the built-in value wins.
- `createMCPClient({ server })` passes no `context`.

### Sessions and tasks per caller

When the server has `auth`, each spec 2025 session and each task belongs to one caller:

- The caller is the `clientId` of the token plus its `sub` claim.
- A session belongs to the caller that opened it.
- A task belongs to the caller that started it.
- A request from another caller gets "not found".

### Cookie sessions

An MCP client like Claude Desktop or Cursor does not send your app cookies. It needs an OAuth authorization server. If your app signs users in with a cookie session only, add an authorization server in front of it. The Better Auth MCP plugin, Keycloak, and the hosted providers above all give you one.
