/**
 * The sandbox agent — Claude Code running inside a **Vercel Sandbox** microVM.
 *
 * This is the [`sandbox-local-web`](../sandbox-local-web) example reshaped for a
 * HOSTED sandbox provider. The interesting difference is the **preview + host-tool
 * story**:
 *
 * - On Docker/local the sandbox can reach the host, so the example bridges host
 *   tools (`tanstackStartRecipe`, `exposePreview`) into the in-sandbox agent over
 *   MCP, and `exposePreview` mints a `localhost` URL.
 * - On a hosted provider the sandbox runs as a Vercel microVM and CANNOT reach
 *   your laptop's `localhost`, so there is **no host-tool bridge** here. Instead:
 *     1. The scaffolding recipe is plain text, so it's inlined into the system
 *        prompt (`RECIPE_GUIDANCE`) rather than bridged as a tool.
 *     2. The preview URL is **deterministic and host-resolvable** — Vercel's
 *        `sandbox.domain(port)` returns a public URL for any port declared at
 *        create time — so the host resolves it up front (see
 *        {@link resolvePreviewUrl}) and tells the agent to share it once the dev
 *        server is listening. No callback into the host required.
 *
 * The result: the same `chat()` + `withSandbox()` wiring and the same UI, with
 * `tools: []` (no bridge) and a pre-minted public preview URL.
 *
 * Prereqs: `ANTHROPIC_API_KEY` (the in-sandbox `claude` CLI uses an Anthropic
 * model) and Vercel credentials — `VERCEL_TOKEN` (or `VERCEL_OIDC_TOKEN`),
 * `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` (read from the env by the SDK).
 */
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { SandboxDefinition } from '@tanstack/ai-sandbox'

/**
 * The ONE dev-server port the agent's app must bind. It is declared in the
 * provider's `ports` at create time so `sandbox.domain(PREVIEW_PORT)` resolves a
 * public URL, so the agent MUST use exactly this port.
 */
export const PREVIEW_PORT = 5173

/** Sandbox lifetime before Vercel stops it — generous so a build + run fits. */
const SANDBOX_TIMEOUT_MS = 1000 * 60 * 30

/** The configured harness adapter, consumed by the `/api/run` route. */
export const adapter: AnyTextAdapter = claudeCodeText('sonnet')

// ---------------------------------------------------------------------------
// Scaffolding recipe + preview guidance (inlined into the system prompt)
// ---------------------------------------------------------------------------

/**
 * The canonical recipe for scaffolding a **self-contained** TanStack Start app —
 * one that runs with NO env vars, API keys, or external services, so its preview
 * URL works with zero setup. On Docker/local this is a bridged host tool; on a
 * hosted provider we inline it (it's just guidance the agent reads before
 * scaffolding).
 */
const RECIPE = {
  scaffold:
    'Scaffold with the TanStack CLI via npx (no global install needed — run it EXACTLY like this): `npx --yes @tanstack/cli create my-app --framework react --no-examples --intent -y`. The package is `@tanstack/cli` (it ships the `tanstack` bin); do NOT guess other package names. `--intent` writes TanStack Intent agent-skill mappings for coding agents. This creates a TanStack Start app and installs deps. (Add `--no-install` to skip install, or `--add-ons <id,…>` for integrations — but keep it env-free; do NOT add auth/database add-ons that need keys.)',
  app: 'Turn it into a SELF-CONTAINED interactive app — NO external APIs, NO env vars, NO keys. Pick something visual: a kanban board, a sortable dashboard over a bundled data.json, a markdown notepad, a drawing pad, or a small game (e.g. Game of Life). Keep all state client-side (persist to localStorage). Make it look polished.',
  run: `FIRST, so the public preview URL reaches the dev server, add \`server: { host: true, allowedHosts: true }\` to the app's \`vite.config.ts\` (bind all interfaces + accept any host). THEN start the dev server bound to all interfaces on PORT ${PREVIEW_PORT} — it MUST be ${PREVIEW_PORT}, because that is the port wired to the public preview URL: \`pnpm dev --host 0.0.0.0 --port ${PREVIEW_PORT}\` (or \`npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}\`). The app runs with ZERO configuration — no API keys or env needed.`,
} as const

/** The recipe, inlined as system-prompt guidance (no host-tool bridge needed). */
export const RECIPE_GUIDANCE: string = [
  'RECIPE — build a self-contained TanStack Start app in this sandbox that runs with no env or API keys:',
  `1. Scaffold: ${RECIPE.scaffold}`,
  `2. Build: ${RECIPE.app}`,
  `3. Run: ${RECIPE.run}`,
].join('\n')

/**
 * System-prompt guidance for the preview. Because the sandbox is a hosted Vercel
 * microVM (it can't reach your machine), the host has ALREADY minted the public
 * preview URL for {@link PREVIEW_PORT}; the agent just binds the dev server wide on
 * that port and shares the URL — no callback into the host.
 */
export function previewGuidance(previewUrl: string | undefined): string {
  if (!previewUrl) {
    return [
      `PREVIEW: start the app's dev server bound to 0.0.0.0 on port ${PREVIEW_PORT}`,
      '(bind all interfaces + allow all hosts in the dev-server config first — for',
      'Vite: `server: { host: true, allowedHosts: true }`). The host exposes that',
      'port as a public preview URL; share it with the user once the server is up.',
    ].join('\n')
  }
  return [
    `PREVIEW: this sandbox's port ${PREVIEW_PORT} is already wired to the public URL`,
    `${previewUrl} . Start the app's dev server bound to 0.0.0.0 on port ${PREVIEW_PORT}`,
    '(bind all interfaces + allow all hosts first — for Vite:',
    '`server: { host: true, allowedHosts: true }`). Once it is listening, share this',
    `exact preview URL with the user as a markdown link: [Open preview](${previewUrl}).`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// The sandbox definition
// ---------------------------------------------------------------------------

/**
 * One Vercel Sandbox per thread (so a follow-up message resumes the same
 * workspace). `persistent: true` lets the run resume the microVM by name. The
 * preview port is declared in `ports` so `domain(PREVIEW_PORT)` resolves a public
 * URL. On first create we install the `claude` CLI into the fresh microVM.
 * `ANTHROPIC_API_KEY` is injected as a secret for the in-sandbox CLI.
 */
export const sandbox: SandboxDefinition = defineSandbox({
  id: 'sandbox-agent-claude-code-vercel',
  provider: vercelSandbox({
    runtime: 'node24',
    timeout: SANDBOX_TIMEOUT_MS,
    ports: [PREVIEW_PORT],
    persistent: true,
    // token / teamId / projectId are read from VERCEL_TOKEN / VERCEL_OIDC_TOKEN /
    // VERCEL_TEAM_ID / VERCEL_PROJECT_ID by the SDK when omitted here.
  }),
  workspace: defineWorkspace({
    // No source to clone — the agent scaffolds a fresh app.
    source: { type: 'none' },
    setup: ({ serial }) => {
      // Install the Claude Code CLI into the fresh microVM (once per thread),
      // skipping the work if the runtime image already ships it.
      serial(
        'command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code',
      )
    },
    // Injected at create, never written to snapshots/logs. The demo app needs no
    // keys; this is only for the in-sandbox CLI itself.
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread' },
})

/**
 * Resolve the public preview URL for {@link PREVIEW_PORT} up front. Minting it is a
 * HOST-side call (`handle.ports.connect` → Vercel `sandbox.domain`), and on a
 * hosted provider the in-sandbox agent can't call back to do it — so the host
 * resolves it and feeds it into the system prompt. We resume the thread's sandbox
 * (idempotent with the `withSandbox` create) and return the URL.
 */
export async function resolvePreviewUrl(
  definition: SandboxDefinition,
  threadId: string,
): Promise<string> {
  const handle = await definition.ensure({ threadId, runId: 'resolve-preview' })
  const channel = await handle.ports.connect(PREVIEW_PORT)
  return channel.url
}
