---
title: Sandboxed Tools
id: mcp-server-sandboxed-tools
order: 13
description: "Back an MCP tool with an untrusted snippet that runs in an isolate, so you can serve a tool whose code you did not write without giving it your whole process."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp server
  - sandbox
  - isolate
  - sandboxedTool
  - createMCPServer
  - code mode
---

`createMCPServer` runs each tool's `.server()` function in your process, with full access to your files, network, and secrets. That is right for tools you wrote. It is not right for a tool you installed, or one whose code you do not fully trust.

Back that tool with a snippet that runs in an isolate instead. The snippet reaches the host only through facades you declare, under limits you set, and only for a caller whose token carries the right scope. `sandboxedTool()` returns a normal server tool, so it drops into the same `tools` list next to your plain tools.

## Quick setup

1. Install the sandbox package and an isolate driver:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
vue: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
solid: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
svelte: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
preact: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
angular: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
vanilla: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs
octane: @tanstack/ai-mcp-sandbox @tanstack/ai-isolate-quickjs

<!-- ::end:tabs -->

The driver is swappable. `@tanstack/ai-isolate-quickjs` runs anywhere, including edge runtimes. See [Isolate Drivers](../code-mode/code-mode-isolates) for the others.

2. Define the facades. A facade is a host function the snippet may call. Secrets and backend URLs live here, in your process, and never enter the isolate:

```ts
// src/facades.ts
const ALLOWED = new Set(['https://api.example.com'])
// Cap the body read into the host process. The isolate limits bound the
// snippet's heap and result, not what the facade buffers, so an allowed
// endpoint that returns a huge body could exhaust host memory without this.
const MAX_BODY_BYTES = 256 * 1024

async function readCapped(response: Response, max: number): Promise<string> {
  const body = response.body
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > max) {
        await reader.cancel()
        throw new Error('response body too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return new TextDecoder().decode(
    chunks.reduce<Uint8Array>((acc, c) => {
      const next = new Uint8Array(acc.length + c.length)
      next.set(acc)
      next.set(c, acc.length)
      return next
    }, new Uint8Array(0)),
  )
}

export const facades = {
  'http.get': {
    description: 'GET an allowlisted URL',
    execute: async (args: unknown) => {
      if (typeof args !== 'object' || args === null || !('url' in args)) {
        throw new Error('url is required')
      }
      const url = new URL(String(args.url))
      if (!ALLOWED.has(url.origin)) throw new Error('origin not allowed')
      // redirect: 'error' stops an allowed origin from bouncing the request to
      // an internal address. Without it, fetch follows the redirect for you.
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
      })
      return readCapped(response, MAX_BODY_BYTES)
    },
  },
}
```

3. Write the snippet and its manifest, then wrap them. The snippet is plain JavaScript. It reads its input from `input` and calls facades on `host`:

```ts group=server-sandboxed-tools
// src/mcp-server.ts
import { createMCPServer, jwtVerifier } from '@tanstack/ai-mcp/server'
import { hashSnippet, sandboxedTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import type { Manifest } from '@tanstack/ai-mcp-sandbox'
import { facades } from './facades'

const driver = createQuickJSIsolateDriver()

const snippet = `
  const body = await host.http.get({ url: input.url })
  return { length: body.length }
`

const manifest = {
  name: 'page_size',
  version: '1.0.0',
  tier: 1,
  scope: 'web:read',
  inject: ['http.get'],
  limits: {
    wallClockMs: 5000,
    memoryMb: 64,
    maxInjectedCalls: 3,
    resultBytes: 16384,
  },
  truncatable: [],
  inputSchema: {
    type: 'object',
    properties: { url: { type: 'string' } },
    required: ['url'],
  },
  description: 'Fetch a URL and return its length',
  snippetHash: hashSnippet(snippet),
} satisfies Manifest

const pageSize = sandboxedTool({ manifest, snippet, facades, driver })

export const server = createMCPServer({
  name: 'web',
  version: '1.0.0',
  // A sandboxed tool needs a verified caller: the scope gate reads the token's
  // scopes (here, web:read). Without auth there is no caller and the tool
  // throws before the snippet runs. See MCP Server Auth for the full setup.
  auth: {
    verifier: jwtVerifier({
      jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
      issuer: 'https://auth.example.com/',
      audience: 'https://mcp.example.com/mcp',
    }),
  },
  tools: [pageSize], // mix freely with plain tools
})
```

The `scope` on the manifest (`web:read`) must be one of the token's scopes, or the caller gets a scope error and the snippet never runs. See [MCP Server Auth](./server-auth) for issuing and verifying those tokens. Serve it from a route the same way as any MCP server. See [Serve Tools over HTTP](./server).

## How a call runs

Each time a host calls the tool, the wrapper:

1. Reads the caller's token from `ctx.context.authInfo` and checks that its scopes include the manifest `scope`. A caller without it gets a scope error, and the snippet never runs. This needs [MCP Server Auth](./server-auth); without it, there is no caller to check.
2. Builds the capability set: only the facades named in `inject`. A snippet that calls anything else fails inside the isolate.
3. Runs the snippet on the driver under the manifest `limits`. The isolate has no files, no network, and no secrets of its own.
4. Shapes the result, then returns it to the host.

The snippet source must match `snippetHash`, so a changed snippet with an unchanged manifest is refused at startup.

## Limits

`limits` is the budget for one run. The wrapper stops a run that goes past any of them:

- `wallClockMs`: total time for the run.
- `memoryMb`: isolate heap.
- `maxInjectedCalls`: how many facade calls the run may make.
- `resultBytes`: size of the returned result. Over this, the wrapper truncates the paths you list in `truncatable`, then errors if it is still too large.

To cap every tool on the server, pass `serverCaps`. Each run uses the tighter of the two:

```ts group=server-sandboxed-tools
sandboxedTool({
  manifest,
  snippet,
  facades,
  driver,
  serverCaps: { wallClockMs: 3000 },
})
```

## Per-caller policy

Limit which facades a caller may use with `policy`. It returns the subset of declared facades allowed for that caller. Value-level rules (which targets, which rows) belong inside the facade, which reads the caller from its `FacadeContext`:

```ts group=server-sandboxed-tools
sandboxedTool({
  manifest,
  snippet,
  facades,
  driver,
  policy: (authInfo, declared) =>
    authInfo.scopes.includes('web:write') ? declared : [],
})
```

## Sign the manifest

The manifest is the security contract. For first-party tools in your repo, the snippet hash is enough. When the manifest comes from somewhere you do not control, sign it so a tampered one is rejected.

Signing uses Ed25519. It happens in two separate places. Keep them apart: if the server both signs and verifies, a manifest tampered with before signing gets a fresh, valid signature, and verification can no longer catch the change.

Step one is offline, on a trusted machine. A reviewer checks the manifest, signs it with a private key the server never sees, and keeps that private key protected:

```ts
// sign-manifest.ts — run once, offline, on a trusted machine. The private key
// stays here and never ships to the server.
import { signManifest } from '@tanstack/ai-mcp-sandbox'
import type { Manifest } from '@tanstack/ai-mcp-sandbox'

// The manifest a reviewer has read and approved by hand.
declare const reviewedManifest: Manifest
// privateKey comes from your secret store or an earlier generateManifestKeyPair().
declare const privateKey: string

const signature = signManifest(reviewedManifest, privateKey)
// Attach `signature` to the manifest you ship, and publish only the matching
// public key to the server.
```

Step two is on the server. It loads only the public key and the already-signed manifest, and requires a valid signature. It never holds the private key:

```ts group=server-sandboxed-tools
// The manifest arrives already signed; publicKey is the one matching key the
// server trusts. The server cannot sign, only verify.
declare const signedManifest: Manifest
declare const publicKey: string

sandboxedTool({
  manifest: signedManifest,
  snippet,
  facades,
  driver,
  publicKey,
  requireSignature: true,
})
```

`generateManifestKeyPair()` makes the key pair once, during setup, not on every serve.

## Import an existing snippet

Turn a plain [Code Mode](../code-mode/code-mode) snippet into a starting manifest with the CLI:

```sh
npx --package=@tanstack/ai-mcp-sandbox tanstack-ai-sandbox-import ./my-snippet.js
```

It writes a deny-by-default manifest: a placeholder scope, no facades, the tightest limits, and an `unreviewed` flag. `sandboxedTool()` refuses to serve any manifest that still carries the flag. The flag is the only gate it checks. It does not inspect the scope, facades, or limits, so you must review those yourself and set real values before you remove the flag. This keeps an unreviewed tool from running by accident.

## Lasting writes

A sandboxed tool is a good fit for reads and safe actions. Approval never happens inside the isolate.

Use a two-phase proposal to put a human decision in front of a write. The first call returns a `proposalId`, and a second call with that id performs the write. `createApprovalStore()` gives you the store: single-use ids, a short expiry, and no surviving proposals after a restart. This works with any MCP host, since it does not rely on a host-side approval prompt.

A proposal id stops one id from being replayed: consume it once and a second consume of the same id fails. It is not write deduplication. Each `propose()` call mints a new id, so the same action proposed twice yields two ids, and consuming both runs the write twice. For a write that must never run twice, carry a durable idempotency key into the write itself (a unique order id, a row your database rejects on a second insert) so the underlying store refuses the duplicate.
