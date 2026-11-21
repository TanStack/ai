<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-mcp-sandbox

Per-tool sandboxing for `@tanstack/ai-mcp`. Serve a tool whose body is an
**untrusted snippet** running inside a Code Mode isolate, capability-scoped per
caller by a signed manifest.

## Why

`createMCPServer` authenticates the caller and then trusts the tool code. That
is right for first-party tools. It is not enough when the tool code is something
the operator did not write (installed/third-party tools, an "app store" for a
pod). This package adds the missing execution layer: a tool backed by a snippet
that runs in an isolate and touches the host only through narrow, typed
**facades** — so a tool you do not fully trust can be served safely.

Sandboxing is a property of an **individual tool**. A `createMCPServer` tool
list can freely mix plain in-process tools and sandboxed, snippet-backed tools.

## How it works

`sandboxedTool()` returns a plain `ServerTool`, so it drops straight into
`createMCPServer({ tools: [...] })`. Per call it:

1. Reads `ctx.context.authInfo` and checks the manifest's required **scope**
   against the caller's token (the server's `requiredScopes` is too coarse).
2. Builds the **capability set** — the manifest's declared facades, narrowed by
   an optional per-client policy.
3. Runs the snippet on any Code Mode `IsolateDriver` with only those facade
   bindings, under `min(manifest.limits, serverCaps)` (wall clock, memory,
   injected-call count, result size).
4. Shapes the result (author-declared truncation + size cap) and emits an audit
   record.

It is driver-agnostic — pass `@tanstack/ai-isolate-quickjs` (portable),
`@tanstack/ai-isolate-node` (V8), or any other `IsolateDriver`.

## Example

```ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import { sandboxedTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

const driver = createQuickJSIsolateDriver()

// Host-side facade: secrets and backend URLs live here, never in the isolate.
const ALLOWED = new Set(['https://api.example.com'])
const facades = {
  'http.get': {
    description: 'GET an allowlisted URL',
    execute: async (args: unknown) => {
      if (typeof args !== 'object' || args === null || !('url' in args)) {
        throw new Error('url is required')
      }
      const url = new URL(String(args.url))
      if (!ALLOWED.has(url.origin)) throw new Error('origin not allowed')
      return (await fetch(url, { redirect: 'error' })).text()
    },
  },
}

// Snippet is already-transpiled JS. Its SHA-256 must equal manifest.snippetHash.
const snippet = `
  const body = await host.http.get({ url: input.url })
  return { length: body.length }
`

const fetchLength = sandboxedTool({
  manifest: {
    name: 'fetch_length',
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
    inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
    description: 'Fetch a URL and return its length',
    snippetHash: '<sha256 of snippet>',
  },
  snippet,
  facades,
  driver,
})

export const server = createMCPServer({
  name: 'demo',
  version: '1.0.0',
  tools: [fetchLength], // mix freely with plain tools
})
```

## Manifest signing (optional)

The manifest is the security contract. `signature` (Ed25519 over the canonical
manifest) is **optional** in the format — ceremony for first-party tools in a
repo. Make it mandatory by policy when a registry is writable by anyone but the
operator: pass `publicKey` + `requireSignature: true` to `sandboxedTool()`.

## Importer

`importSnippet()` (and the `tanstack-ai-sandbox-import` CLI) turn a plain Code
Mode snippet into a **deny-by-default, unreviewed** manifest (no injections,
tightest limits, Tier 1). The tool is refused at build time until a human fills
the security fields. Authoring-time only — never a runtime path.

## Approval

Approval never happens inside the isolate. For lasting (Tier-3) writes served to
a foreign MCP host, use `createApprovalStore()` for a host-agnostic two-phase
proposal (`propose → proposalId → confirm`, 5-minute expiry, hash-bound,
fail-closed).
