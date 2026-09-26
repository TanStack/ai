---
title: MCP Server Auth
id: mcp-server-auth
order: 13
description: "Accept the access tokens your authorization server issues, so only a signed-in user can call your MCP tools."
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

Your MCP server is on a public URL. As a result, any client that can reach that URL can call your tools.

An MCP server is an OAuth resource server. It does not sign users in. Your authorization server does that, and it issues the access token. The MCP server checks that token on each request.

Pass `auth` to `createMCPServer`. Then a missing or bad token returns 401.

## Verify a JWT

Most providers issue a JWT and publish their keys at a JWKS URL. Auth0, Clerk, WorkOS, Keycloak, Supabase, and the Better Auth MCP plugin all do.

1. Find the issuer URL and the JWKS URL of your provider.
2. Register your MCP server URL as the audience of the token.
3. Serve MCP with this handler.

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

Add your tools on the `tools` field.

`jwtVerifier` checks the signature, `iss`, `aud`, `exp`, and `nbf`. It reads the keys from `jwksUrl` and caches them. A token that fails one check returns 401.

## Verify an opaque token

If your provider issues opaque tokens, pass `introspectionVerifier`. It posts the token to the RFC 7662 introspection endpoint with the client credentials of your MCP server.

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

A token that is not `active` returns 401. If the endpoint is down, the caller gets 500.

## Write your own verifier

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

## Require a scope

Pass `requiredScopes`. A token without one of those scopes returns 403 with `insufficient_scope`.

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

`authInfo` is `undefined` when the server has no `auth`, and for `createMCPClient({ server })`.

## Sessions and tasks per caller

A spec 2025 session belongs to the caller that opened it. A task belongs to the caller that started it. The caller is the `clientId` of the token plus its `sub` claim. A request from another caller gets "not found".

## Cookie sessions

An MCP client like Claude Desktop or Cursor does not send your app cookies. It needs an OAuth authorization server. If your app signs users in with a cookie session only, add an authorization server in front of it. The Better Auth MCP plugin, Keycloak, and the hosted providers above all give you one.

A request with no token, or with a bad token, returns 401. The response names your metadata document. A request with a token from your provider calls the server, and the tool reads the user from `ctx.context.authInfo`.
