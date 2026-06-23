# ts-code-mode-web

TanStack AI Code Mode web example using React and TanStack Start.

## Setup

### Prerequisites

- Node.js >=18
- pnpm@10.17.0
- Xcode Command Line Tools (macOS)

### Installation

```bash
pnpm install
```

### Rebuilding `isolated-vm` (native module)

`@tanstack/ai-isolate-node` depends on [`isolated-vm`](https://github.com/laverdet/isolated-vm), a native Node.js addon that must be compiled from source when a prebuilt binary is not available for your Node.js version.

**When is this needed?**

The `isolated-vm` package ships prebuilt binaries for select Node.js ABI versions. If you are running a newer Node.js version whose ABI is not yet included (e.g. Node.js 25.x / ABI 141), you will see an error like:

```
Error: No native build was found for platform=darwin arch=arm64 runtime=node abi=141 ...
    loaded from: .../isolated-vm
```

**How to fix it**

1. Ensure Xcode Command Line Tools are installed (macOS):

   ```bash
   xcode-select --install
   ```

2. Run `node-gyp` via `npx` inside the `isolated-vm` package directory (from the monorepo root):

   ```bash
   ISOLATED_VM_DIR="node_modules/.pnpm/isolated-vm@6.1.0/node_modules/isolated-vm"
   cd "$ISOLATED_VM_DIR" && npx node-gyp rebuild
   ```

   Or as a one-liner from the monorepo root (`/Users/jherr/tanstack/ai/code-mode`):

   ```bash
   cd node_modules/.pnpm/isolated-vm@6.1.0/node_modules/isolated-vm && npx node-gyp rebuild
   ```

3. A successful build ends with `gyp info ok` and produces `build/Release/isolated_vm.node`.

**Notes**

- Linker warnings about macOS version mismatches (`building for macOS-11.0, but linking with dylib ... built for newer version`) are harmless and can be ignored.
- The compiled `.node` file lives in the pnpm content-addressable store and will need to be rebuilt after `pnpm install --force` or after upgrading Node.js to a different ABI version.
- Python 3 is required by `node-gyp`. It is detected automatically from `$PATH`.

### Node.js 25 + `isolated-vm` runtime crash (SIGSEGV)

Even after successfully compiling from source, `isolated-vm@6.1.0` crashes the server process (exit code 139, SIGSEGV) when run under **Node.js 25.x**. This is a V8 API incompatibility — Node 25 ships V8 14.1 whose internal C++ API has changed in ways that break `isolated-vm`'s isolate creation code at runtime.

**Symptom:** The server dies silently with no JavaScript error or log output when the first code mode request is made.

**Fix applied:** All server routes in this example have been switched from the `node` isolate driver to the `quickjs` driver (`@tanstack/ai-isolate-quickjs`), which is a pure-JS sandbox with no native addon dependency and works on any Node.js version.

**When `isolated-vm` works again:** Once `isolated-vm` publishes a release compatible with Node 25 / V8 14.1, switch the driver back to `'node'` in `src/lib/create-isolate-driver.ts` (default) and in each API route file. The `node` driver provides stronger isolation (true V8 process boundary) and is preferred in production.

## Sandbox Agent page

The **Sandbox Agent** page (`/sandbox-agent`) is different from every other demo
here. The rest of this app is _code mode_ — the LLM writes JavaScript that runs
in an in-process isolate to call tools. The Sandbox Agent page instead drives a
full **Cloudflare sandbox coding agent**: a Claude Code harness running in a
`@cloudflare/sandbox` container (real filesystem, git, shell), coordinated by a
Durable Object on the edge.

That agent is a separate, deployed Worker — it cannot run inside the Vite dev
server. Use the reference worker at
[`examples/sandbox-cloudflare-agent`](../sandbox-cloudflare-agent), which is one
`createCloudflareSandboxAgent()` call.

### How the wiring works

The agent speaks a POST-then-WebSocket run protocol
(`POST /runs` → `202 { runId }`, then a resumable WebSocket tail at
`GET /runs/:runId/stream`). The browser's `useChat` only speaks "POST a body,
read back an SSE stream". The server route
[`src/routes/_sandbox-agent/api.sandbox-agent.ts`](src/routes/_sandbox-agent/api.sandbox-agent.ts)
bridges the two: it triggers the run, tails the WebSocket, and re-emits each
chat `StreamChunk` as SSE. So the React page
(`src/routes/_sandbox-agent/sandbox-agent.tsx`) is the same shape as the other
chat demos.

```
browser useChat ──SSE──▶ /api/sandbox-agent (proxy) ──POST /runs──▶ agent Worker
                                  │                                     │ (Coordinator DO
                                  └──────────── WebSocket tail ─────────┘  drives the run
                                                                            in a container)
```

### Run it

1. Start the agent worker (set its `ANTHROPIC_API_KEY` — see that example's
   README):

   ```bash
   pnpm --filter @tanstack/sandbox-cloudflare-agent-example dev   # wrangler dev → http://localhost:8787
   ```

2. Point this app at it and start the dev server:

   ```bash
   SANDBOX_AGENT_URL=http://localhost:8787 pnpm dev
   ```

   `SANDBOX_AGENT_URL` defaults to `http://localhost:8787`, so it can be omitted
   when the worker runs on the default `wrangler dev` port. Set it to your
   deployed `*.workers.dev` URL to talk to a deployed agent.

3. Open <http://localhost:3001/sandbox-agent>.

## Development

```bash
pnpm dev   # starts the Vite dev server on port 3001
```

## Build

```bash
pnpm build
```
