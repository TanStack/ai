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
- **Deny-by-default egress helper** — one allowlisted `egress` capability a tool uses on purpose. It is not an enforced network boundary: a tool that calls global `fetch` still reaches the network. For enforced isolation, run the server behind a separate execution or network boundary.
- **Rate limits** — a per-client sliding window.
- **A redacted audit log** — append-only JSONL, args redacted to id-like fields. A field keeps its value only when its name ends in an id-like suffix (`id`, `name`, `title`, `kind`, `type`, `scope`, `origin`); every other field is replaced with `[redacted]`. This is name-based, not value-based: a secret passed in an id-like field such as `sessionId` is written in full. Keep secrets out of those fields.
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

A tool receives the `egress` capability on `ctx.context`. A tool must use it on
purpose; it then refuses any origin not on the allowlist. It is not an enforced
boundary: a tool that calls global `fetch` directly bypasses `egress` and its
allowlist. Write tools to reach the network only through `ctx.context.egress`,
and run the server behind a separate execution or network boundary when you need
enforced confinement.

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

The confirm step checks only that the confirming client id matches the client
that made the proposal. It is not an independent approver: the same client, with
the same token, can make both the proposal and the confirm. This two-phase flow
adds a deliberate second step and an audit trail; it does not by itself prove a
human reviewed the action. For real human-in-the-loop approval, route the
confirm through a different client or an out-of-band channel.

## Secure defaults

| Concern        | Default                                          | Footgun it prevents                                                            |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Egress helper  | deny-by-default allowlist                        | a tool exfiltrating data _when it uses `ctx.context.egress`_                   |
| Generic HTTP   | not injected into the context                    | SSRF through a "helpful" tool _that reaches the network only through `egress`_ |
| Tokens         | hash-only, constant-time                         | replay from a leaked store                                                     |
| Secrets        | never in the audit log or a notification         | prompt/response exfiltration                                                   |
| Approval state | in memory, fail-closed on restart                | a ghost approval after a crash                                                 |
| Exposure       | the _generated Tailscale command_ is tailnet-only unless you opt into a public funnel | accidental internet _through that command_                         |

The egress allowlist is a helper, not an enforced boundary. It stops
exfiltration and SSRF only for a tool that reaches the network through
`ctx.context.egress`; a tool that calls global `fetch` bypasses it. Enforced
network confinement needs a separate execution or network boundary around the
server.

The preflight refuses a public funnel while a token is unhashed, egress is open,
or the audit log or notifier is off. The funnel URL is not a secret: auth stands
on its own.

The exposure guarantee covers only the Tailscale command this package
generates. The package returns a `fetch` handler; it does not create, bind, or
restrict the HTTP listener. If you serve `server.fetch` yourself on a public
interface, it is reachable from the internet whether or not you set
`funnel.public`, and the public-funnel preflight does not run. For any public
deployment that does not go through the generated Tailscale funnel, restrict the
listener yourself and run `server.preflight` before you expose it.

## License

MIT
