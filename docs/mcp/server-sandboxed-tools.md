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
      return response.text()
    },
  },
}
```

3. Write the snippet and its manifest, then wrap them. The snippet is plain JavaScript. It reads its input from `input` and calls facades on `host`:

```ts group=server-sandboxed-tools
// src/mcp-server.ts
import { createMCPServer } from '@tanstack/ai-mcp/server'
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
  tools: [pageSize], // mix freely with plain tools
})
```

Serve it from a route the same way as any MCP server. See [Serve Tools over HTTP](./server).

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

Signing uses Ed25519. Pass the public key and require a valid signature:

```ts group=server-sandboxed-tools
import { generateManifestKeyPair, signManifest } from '@tanstack/ai-mcp-sandbox'

const { publicKey, privateKey } = generateManifestKeyPair()
const signature = signManifest(manifest, privateKey)

sandboxedTool({
  manifest: { ...manifest, signature },
  snippet,
  facades,
  driver,
  publicKey,
  requireSignature: true,
})
```

## Import an existing snippet

Turn a plain [Code Mode](../code-mode/code-mode) snippet into a starting manifest with the CLI:

```sh
npx --package=@tanstack/ai-mcp-sandbox tanstack-ai-sandbox-import ./my-snippet.js
```

It writes a deny-by-default manifest: no facades, the tightest limits, and an `unreviewed` flag. `sandboxedTool()` refuses to serve it until you fill in the scope, facades, and limits, then remove the flag. This keeps an unreviewed tool from running by accident.

## Lasting writes

A sandboxed tool is a good fit for reads and safe actions. Approval never happens inside the isolate.

For a write that must not run twice, use a two-phase proposal. The first call returns a `proposalId`, and a second call with that id performs the write. `createApprovalStore()` gives you the store: single-use ids, a short expiry, and no surviving proposals after a restart. This works with any MCP host, since it does not rely on a host-side approval prompt.
