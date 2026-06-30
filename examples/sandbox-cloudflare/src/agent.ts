/**
 * The sandbox agent — one `createCloudflareSandboxAgent()` call.
 *
 * The factory returns the run-coordinator Durable Object, the `@cloudflare/sandbox`
 * Sandbox DO, and a stateless Worker fetch handler. `src/server.ts` re-exports the
 * two DOs (so wrangler can bind them) and composes `agent.worker` with the TanStack
 * Start request handler so the whole thing — UI + agent + container — ships as one
 * Worker.
 *
 * This is the DEFAULT `do-drives` model: the coordinator DO runs `chat()` itself and
 * serves the MCP tool-bridge from its own `fetch` handler; the container only runs
 * the coding-agent CLI. The package also supports a `colocated` mode (the harness
 * loop runs inside the container) — see the README and `docs/sandbox/overview.md`
 * for the tradeoff; this example intentionally shows the simpler `do-drives` path.
 *
 * SWITCHABLE HARNESS: one app, three coding agents. The `HARNESS` var
 * (`claude-code` | `codex` | `grok`, default `claude-code`) picks which CLI
 * `chat()` drives — the run-log / WebSocket / tool-bridge topology is
 * adapter-agnostic, so only the adapter + the injected API key change. The
 * container image ships all three CLIs (see Dockerfile); selection is host-side.
 *
 * NOTE: Workers-runtime code — it compiles against the real Cloudflare + TanStack AI
 * types, but the end-to-end container run is only exercised on a real Cloudflare
 * deploy (see the README "Limitations").
 */
import {
  PREVIEW_GUIDANCE,
  createCloudflareSandboxAgent,
  exposePreviewTool,
  resolvePreviewHost,
} from '@tanstack/ai-sandbox-cloudflare/agent'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { namedCloudflareSandbox } from './sandbox-provider'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  SandboxAgentEnv,
  StartRunInput,
} from '@tanstack/ai-sandbox-cloudflare/agent'

/**
 * The Worker env this app binds. The base `SandboxAgentEnv` is harness-agnostic —
 * it binds NO API key — so we extend it with the `HARNESS` selector and the API
 * key each harness's in-sandbox CLI authenticates with. Keys are optional on the
 * type (you only need the one for your chosen harness); {@link selectHarness} /
 * {@link HARNESSES} fail with a clear error at run time if the selected harness's
 * key is missing.
 */
export interface AppEnv extends SandboxAgentEnv {
  /**
   * Which in-sandbox coding agent to run: `claude-code` (default) | `codex` |
   * `grok`. Set as a wrangler `var` (see wrangler.jsonc / .dev.vars). The
   * container image ships all three CLIs; this only picks which `chat()` drives.
   */
  HARNESS?: string
  /** Anthropic API key — the `claude-code` harness's in-sandbox CLI auth. */
  ANTHROPIC_API_KEY?: string
  /** OpenAI Codex key — the `codex` harness. Injected into the sandbox AS CODEX_API_KEY. */
  CODEX_API_KEY?: string
  /** Plain OpenAI key, used as the codex key when CODEX_API_KEY is unset. */
  OPENAI_API_KEY?: string
  /** xAI key — the `grok` harness. Injected as XAI_API_KEY. */
  XAI_API_KEY?: string
  /** Alternate name for the xAI key. */
  GROK_API_KEY?: string
}

export type HarnessName = 'claude-code' | 'codex' | 'grok'
export type GrokBuildModel = 'grok-build-0.1' | 'composer-2.5'
export type GrokBuildProtocol = 'acp' | 'streaming-json'
export type GrokTransport = 'auto' | 'stdio' | 'websocket'

export interface GrokHarnessOptions {
  model?: GrokBuildModel
  protocol?: GrokBuildProtocol
  transport?: GrokTransport
}

interface HarnessSpec {
  /** Build the harness/text adapter `chat()` runs in the coordinator DO. */
  adapter: (grokOptions?: GrokHarnessOptions) => AnyTextAdapter
  /**
   * The secret env injected into the sandbox container for the in-CLI auth.
   * Throws a clear error if the harness's required key isn't set, rather than
   * starting a keyless run that fails deep inside the CLI.
   */
  secrets: (env: AppEnv) => Record<string, string>
}

const HARNESSES: Record<HarnessName, HarnessSpec> = {
  'claude-code': {
    adapter: () => claudeCodeText('sonnet'),
    secrets: (env) => {
      const key = env.ANTHROPIC_API_KEY
      if (!key) throw new Error('claude-code harness needs ANTHROPIC_API_KEY.')
      return { ANTHROPIC_API_KEY: key }
    },
  },
  codex: {
    // `danger-full-access` is REQUIRED on Cloudflare: codex's default
    // `workspace-write` mode wraps every shell command in its own OS sandbox
    // (bubblewrap), which needs to create a new user namespace — and the
    // Cloudflare container forbids that ("bwrap: No permissions to create a new
    // namespace"). The container is ALREADY the isolation boundary, so we disable
    // codex's redundant inner sandbox.
    adapter: () =>
      codexText('gpt-5.3-codex', { sandboxMode: 'danger-full-access' }),
    // `codex exec` authenticates headlessly via CODEX_API_KEY; a bare
    // OPENAI_API_KEY makes it try the OAuth WebSocket transport (→ 401), so we
    // accept either name and inject the value AS CODEX_API_KEY.
    secrets: (env) => {
      const key = env.CODEX_API_KEY ?? env.OPENAI_API_KEY
      if (!key) {
        throw new Error(
          'codex harness needs CODEX_API_KEY (or OPENAI_API_KEY).',
        )
      }
      return { CODEX_API_KEY: key }
    },
  },
  grok: {
    // No special sandboxMode needed for the xAI Grok Build CLI (unlike codex).
    adapter: (grokOptions?: GrokHarnessOptions) =>
      grokBuildText(grokOptions?.model ?? 'composer-2.5', {
        protocol: grokOptions?.protocol ?? 'acp',
        transport: grokOptions?.transport ?? 'auto',
      }),
    secrets: (env) => {
      const key = env.XAI_API_KEY ?? env.GROK_API_KEY
      if (!key) {
        throw new Error('grok harness needs XAI_API_KEY (or GROK_API_KEY).')
      }
      return { XAI_API_KEY: key }
    },
  },
}

function isHarnessName(value: unknown): value is HarnessName {
  return value === 'claude-code' || value === 'codex' || value === 'grok'
}

function isGrokProtocol(value: unknown): value is GrokBuildProtocol {
  return value === 'acp' || value === 'streaming-json'
}

function isGrokTransport(value: unknown): value is GrokTransport {
  return value === 'auto' || value === 'stdio' || value === 'websocket'
}

function isGrokModel(value: unknown): value is GrokBuildModel {
  return value === 'grok-build-0.1' || value === 'composer-2.5'
}

/** Per-run Grok options from UI metadata (`metadata.grokModel` / protocol / transport). */
function resolveGrokOptions(input: StartRunInput): GrokHarnessOptions {
  const metadata = input.metadata
  return {
    model:
      metadata && isGrokModel(metadata.grokModel)
        ? metadata.grokModel
        : 'composer-2.5',
    protocol:
      metadata && isGrokProtocol(metadata.grokProtocol)
        ? metadata.grokProtocol
        : 'acp',
    transport:
      metadata && isGrokTransport(metadata.grokTransport)
        ? metadata.grokTransport
        : 'auto',
  }
}

function buildAdapter(
  harness: HarnessName,
  input: StartRunInput,
): AnyTextAdapter {
  if (harness === 'grok') {
    return HARNESSES.grok.adapter(resolveGrokOptions(input))
  }
  return HARNESSES[harness].adapter()
}

/**
 * Resolve the active harness for a run. A per-run `metadata.harness` (chosen in
 * the UI and forwarded through the trigger) wins; otherwise the deploy default
 * `env.HARNESS`; otherwise `claude-code`. Throws on an unknown value.
 */
function resolveHarness(input: StartRunInput, env: AppEnv): HarnessName {
  const override = input.metadata?.harness
  if (override !== undefined) {
    if (!isHarnessName(override)) {
      throw new Error(
        `Unknown harness "${String(override)}". Use claude-code | codex | grok.`,
      )
    }
    return override
  }
  const fromEnv = env.HARNESS
  if (fromEnv === undefined || fromEnv === '') return 'claude-code'
  if (!isHarnessName(fromEnv)) {
    throw new Error(
      `Unknown HARNESS "${fromEnv}". Set it to claude-code | codex | grok.`,
    )
  }
  return fromEnv
}

/**
 * The demo host tool: the canonical recipe for scaffolding a **self-contained**
 * TanStack Start app — one that runs with NO env vars, API keys, or external
 * services, so its sandbox preview URL works for anyone with zero setup.
 *
 * It's a `chat()` server tool, so the factory bridges it to the in-sandbox agent
 * over the DO-served MCP endpoint — the agent (Claude Code) sees it as
 * `mcp__tanstack__tanstackStartRecipe`, calls it BEFORE scaffolding, the DO runs
 * it on the host, and the result streams back. Returning it from `tools` is what
 * exercises the `/_bridge` path.
 *
 * The recipe scaffolds via `npx --yes @tanstack/cli create … --intent` — no global
 * install needed in the container image (npm/npx ship on the base image) — which
 * both creates a real TanStack Start app and writes TanStack Intent skill mappings
 * into it for coding agents. The bridge still matters for the sandbox-specific bits
 * the generic skill can't know: build a NO-env app and bind/expose the dev server
 * for a preview URL.
 */
const RECIPE = {
  scaffold:
    'Scaffold with the TanStack CLI via npx (no global install needed — run it EXACTLY like this): `npx --yes @tanstack/cli create my-app --framework react --no-examples --intent -y`. The package is `@tanstack/cli` (it ships the `tanstack` bin); do NOT guess other package names. `--intent` writes TanStack Intent agent-skill mappings for coding agents. This creates a TanStack Start app and installs deps. (Add `--no-install` to skip install, or `--add-ons <id,…>` for integrations — but keep it env-free; do NOT add auth/database add-ons that need keys.)',
  app: 'Turn it into a SELF-CONTAINED interactive app — NO external APIs, NO env vars, NO keys. Pick something visual: a kanban board, a sortable dashboard over a bundled data.json, a markdown notepad, a drawing pad, or a small game (e.g. Game of Life). Keep all state client-side (persist to localStorage). Make it look polished.',
  run: 'FIRST, so the preview\'s quick-tunnel hostname is accepted, add `server: { host: true, allowedHosts: true }` to the app\'s `vite.config.ts` (Vite rejects unknown hosts by default). THEN start the dev server bound to all interfaces on PORT 5173 — NOT 3000 (reserved by the sandbox control plane): `pnpm dev --host 0.0.0.0 --port 5173` (or `npm run dev -- --host 0.0.0.0 --port 5173`). Once it is listening, call the `exposePreview` tool with `{ "port": 5173 }` to get a public preview URL (a Cloudflare quick tunnel) and share it with the user. The app runs with ZERO configuration — no API keys or env needed.',
} as const

const tanstackStartRecipe = toolDefinition({
  name: 'tanstackStartRecipe',
  description:
    'The canonical recipe for building a self-contained TanStack Start app in this sandbox that runs with no env or API keys: scaffold via `npx --yes @tanstack/cli create … --intent`, what to build, and how to bind/expose the dev server for a preview URL. Call this BEFORE scaffolding.',
  inputSchema: z.object({
    section: z
      .enum(['scaffold', 'app', 'run', 'all'])
      .describe('Which part of the recipe you need (use "all" first).'),
  }),
}).server(({ section }) =>
  section === 'all' ? RECIPE : { [section]: RECIPE[section] },
)

/**
 * The configured agent. `src/server.ts` wires `agent.Coordinator` / `agent.Sandbox`
 * to the `RUN_COORDINATOR` + `Sandbox` bindings in `wrangler.jsonc`, and routes the
 * agent's HTTP surface (`/runs`, `/_bridge`, `/tool-exec`) to `agent.worker`.
 */
export const agent = createCloudflareSandboxAgent<AppEnv>({
  // The adapter is resolved per run: the UI's `metadata.harness` picks the coding
  // agent `chat()` drives, falling back to the `HARNESS` deploy default.
  adapter: (input, env) =>
    buildAdapter(resolveHarness(input, env), input),
  // App-agnostic transport guidance, prepended to every run's system prompt: how to
  // start a dev server whose quick-tunnel preview works (bind wide, allow all hosts
  // so the tunnel hostname is accepted). Package-owned because it's the transport's
  // concern. See `PREVIEW_GUIDANCE`.
  systemPrompts: [PREVIEW_GUIDANCE],
  // `tanstackStartRecipe` (demo-specific scaffold guidance) + the package's
  // `exposePreview` (mint a preview URL for the running app) — both bridged to the
  // in-sandbox agent over `/_bridge`. `exposePreviewTool` closes over the run's
  // `threadId` + `env`, so it is built per run here.
  tools: (input, env) => [tanstackStartRecipe, exposePreviewTool(input, env)],
  // Custom sandbox so we control (a) the env injected into the container and (b) the
  // container's NAME. We pin the container to the run's `threadId` via
  // `namedCloudflareSandbox` so `exposePreview` can address the same container to
  // expose a port. The injected secret is the selected harness's API key only (the
  // demo app the agent builds needs none); the value comes from the Worker `env`:
  // set it in `.dev.vars` (local) or `wrangler secret put` (prod). Secrets are
  // injected at create/resume, never written to snapshots.
  sandbox: (input, env) =>
    defineSandbox({
      id: 'cf-edge-agent',
      // Named by `threadId` so `exposePreview`'s quick tunnel targets this exact
      // container (and survives DO eviction for `reuse: 'thread'`).
      provider: namedCloudflareSandbox(
        env.Sandbox,
        input.threadId,
        resolvePreviewHost(env, input),
      ),
      workspace: defineWorkspace({
        // No source to clone — the container image already ships the harness CLIs.
        source: { type: 'none' },
        secrets: createSecrets(
          HARNESSES[resolveHarness(input, env)].secrets(env),
        ),
      }),
      // One sandbox per thread, so a follow-up message resumes the same workspace.
      lifecycle: { reuse: 'thread' },
    }),
})
