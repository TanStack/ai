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

# @tanstack/ai-secure-mcp

A security envelope around [`createMCPServer`](https://www.npmjs.com/package/@tanstack/ai-mcp)
for a self-hoster who wants to expose a TanStack AI MCP server to the internet.

It wraps your server with:

- **Hashed-token auth** — bearer tokens stored as SHA-256 hashes, constant-time compare.
- **Scopes and a target allowlist** — a token holds scopes; a scope can be narrowed to named resources.
- **Deny-by-default egress** — one allowlisted `egress` capability, no generic `fetch`.
- **Rate limits** — a per-client sliding window.
- **A redacted audit log** — append-only JSONL, args redacted to id-like fields, no secrets.
- **A tripwire notifier** — push a signal to your phone when someone pokes at the server.
- **Two-phase approval** — a tool can return a proposal; a separate confirm runs the action.
- **Go-live preflight** — refuses a public funnel while a secure default is off.

## Installation

```bash
pnpm add @tanstack/ai-secure-mcp
```

## Quick start

```typescript
import {
  createSecureMcpServer,
  hashToken,
  ntfyNotifier,
} from '@tanstack/ai-secure-mcp'
import type { AnyServerTool } from '@tanstack/ai'

declare const hueTools: Array<AnyServerTool>

const server = createSecureMcpServer({
  name: 'home',
  version: '1.0.0',
  tools: hueTools,
  clients: [
    {
      id: 'alice',
      // Store the hash, never the raw token.
      tokenHash: hashToken('the-raw-token-alice-holds'),
      scopes: ['read', 'control'],
    },
  ],
  egress: ['https://api.hue.local'], // deny-by-default allowlist
  policy: {
    scopes: { setLights: 'control' }, // setLights needs the control scope
    approve: ['buyMovie'], // buyMovie needs two-phase approval
  },
  audit: { path: './audit.jsonl', retentionDays: 90 },
  notify: ntfyNotifier({ topic: 'my-home-mcp' }),
  funnel: { port: 8787 },
})

// Serve it from your HTTP handler.
export default server.fetch
```

`server.preflight` holds the secure-default problems. `server.tailscale` holds
the command to expose the server when you pass `funnel`.

## Reaching the network from a tool

A tool receives the `egress` capability on `ctx.context`. It is the only way to
the network, and it refuses any origin not on the allowlist.

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { SecureRequestContext } from '@tanstack/ai-secure-mcp'

const getLights = toolDefinition({
  name: 'getLights',
  description: 'List the lights on the Hue bridge',
  inputSchema: z.object({}),
}).server<SecureRequestContext>(async (_args, ctx) => {
  const res = await ctx.context.egress('https://api.hue.local/lights')
  return { status: res.status }
})
```

## Two-phase approval

A tool in `policy.approve` does not act on the first call. It returns an
envelope:

```json
{ "status": "approval_required", "proposalId": "…", "summary": "Run buyMovie" }
```

A separate, authenticated call to the `approve_proposal` tool with that
`proposalId` runs the action. Proposals are in memory, single-use, and expire,
so a crash cannot leave a ghost approval.

## Secure defaults

| Concern | Default | Footgun it prevents |
| --- | --- | --- |
| Egress | deny-by-default allowlist | a tool exfiltrating data |
| Generic HTTP | not injectable | SSRF through a "helpful" tool |
| Tokens | hash-only, constant-time | replay from a leaked store |
| Secrets | never in the audit log or a notification | prompt/response exfiltration |
| Approval state | in memory, fail-closed on restart | a ghost approval after a crash |
| Exposure | tailnet-only unless you opt into a public funnel | accidental internet |

The preflight refuses a public funnel while a token is unhashed, egress is open,
or the audit log or notifier is off. The funnel URL is not a secret: auth stands
on its own.

## License

MIT
