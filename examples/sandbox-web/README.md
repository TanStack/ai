# Sandbox Web (TanStack AI)

A web chat where an AI coding agent builds and runs a real app **inside a
sandbox**, then hands back a live preview URL — switchable across **two
independent axes**, picked live in the UI, to show off the provider-agnostic
design:

```
HARNESS  = claude-code | codex | opencode | grok  # which coding agent runs
PROVIDER = docker | local | vercel | daytona      # where it runs
```

Defaults are `claude-code` on `docker`. The same UI, the same `chat()` +
`withSandbox()` wiring, and the same preview flow work for **every combination** —
only the `adapter:`/`provider:` selection in
[`src/sandbox-agent.ts`](./src/sandbox-agent.ts) changes, behind a small registry.
This is the build-and-preview sibling of `ts-react-chat`'s read-only issue-triage
demo (`/sandboxes`), and the Node counterpart of
[`sandbox-cloudflare`](../sandbox-cloudflare) (which drives the same idea at the
edge via a Durable Object).

> **One merged example.** This replaces the former `sandbox-local-web`,
> `sandbox-daytona-web`, and `sandbox-vercel-web` apps — same use case, now one app
> with provider + harness pickers.

## How it works

1. The browser's `useChat` POSTs `{ messages, data: { threadId, harness, provider } }`
   to `/api/run`.
2. The route validates the chosen combo's env, then runs
   `chat({ adapter, middleware: [withSandbox(sandbox)], … })` with the selected
   harness adapter and provider.
3. `withSandbox` resumes-or-creates the thread's sandbox; the harness adapter runs
   the coding-agent CLI inside it.
4. The agent scaffolds a self-contained TanStack Start app, runs its dev server on
   port **5173**, and the preview URL comes back to the UI.

The one provider-dependent seam is the **preview + host-tool story**:

- **Same-machine** providers (`docker`, `local`) can reach the host, so the
  `tanstackStartRecipe` + `exposePreview` host tools are bridged into the agent
  over MCP; the agent mints the preview URL on demand once its dev server is up
  (`http://localhost:<mapped-port>` on docker, `http://127.0.0.1:5173` on local).
- **Hosted** providers (`vercel`, `daytona`) can't reach loopback by default, so
  without a tunnel the recipe is inlined and the host pre-mints the **public**
  preview URL up front (Vercel `domain(port)` / Daytona `getPreviewLink(port)`).
  Set `NGROK_AUTHTOKEN` while developing locally to tunnel the bridge out (same
  pattern as `ts-react-chat` `/sandboxes`) so the agent can call `tanstackStartRecipe`
  - `exposePreview` over MCP instead.

Switching either picker starts a fresh thread (a new sandbox is needed for a
different harness/provider) and clears the chat.

## Prerequisites

Set the keys only for the combination you run (the server returns a clear error if
one is missing). See [`.env.example`](./.env.example).

| Axis     | Option                        | Needs                                                                            |
| -------- | ----------------------------- | -------------------------------------------------------------------------------- |
| Harness  | `claude-code`                 | `ANTHROPIC_API_KEY`                                                              |
| Harness  | `codex`                       | `CODEX_API_KEY` (or `OPENAI_API_KEY`)                                            |
| Harness  | `opencode`                    | `OPENAI_API_KEY`                                                                 |
| Harness  | `grok`                        | `XAI_API_KEY` (or `GROK_API_KEY`)                                                |
| Provider | `docker`                      | a running **Docker daemon**                                                      |
| Provider | `local`                       | the chosen CLI on your PATH — no isolation, no key (uses your host login)        |
| Provider | `vercel`                      | `VERCEL_TOKEN` (or `VERCEL_OIDC_TOKEN`) + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` |
| Provider | `daytona`                     | `DAYTONA_API_KEY`                                                                |
| Bridge   | `vercel`/`daytona` (optional) | `NGROK_AUTHTOKEN` — tunnels host tools to remote sandboxes during local dev      |

## Run

```bash
# from the repo root: build the workspace packages first
pnpm install
pnpm build

cd examples/sandbox-web
cp .env.example .env   # fill in the keys for the combo you want
pnpm dev               # http://localhost:3002
```

Then pick a harness + provider in the header and ask it to build something, e.g.
_"Build a polished kanban board with drag-and-drop and localStorage, then give me
the preview URL."_

> On `docker`, the first message per thread is slow: it pulls `node:22` (once) and
> installs the harness CLI in the fresh container. Pre-bake an image with the CLI
> and set `SANDBOX_IMAGE=<your-image>` to skip that.

## Adding more providers / harnesses

- **Another harness**: add an entry to the `HARNESSES` registry in
  `src/sandbox-agent.ts` (its adapter factory, install command, required env, and
  any extra port to expose) and to `HARNESS_OPTIONS` in `src/sandbox-options.ts`.
- **Another provider**: add an entry to `PROVIDERS` (its factory, required env, and
  the `toolBridge` flag — `true` if the in-sandbox agent can reach the host) plus
  `PROVIDER_OPTIONS`. Nothing else changes — the route, UI, and preview flow read
  from the registries.

## Limitations

- **`local` has no isolation.** The agent runs on your host with your CLI and PATH.
  Use it for the fast dev loop, not untrusted prompts.
- **Same-machine previews are localhost-only** (not shareable). The hosted
  providers (`vercel`, `daytona`) return public URLs.
- **One preview port (5173).** Only the port published/declared at create time is
  reachable, so the agent must run its dev server on 5173 (the recipe + guidance
  enforce this).
