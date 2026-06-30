/**
 * The sandbox agent — switchable across harness adapters AND sandbox providers,
 * chosen PER RUN from the UI (no env vars, no rebuilds). One "agent builds you an
 * app" demo for every provider: ask it to build a self-contained TanStack Start
 * app; it scaffolds it inside the sandbox, runs the dev server, and hands back a
 * live preview URL.
 *
 *   HARNESS  = claude-code | codex | opencode | grok (which coding agent runs)
 *   PROVIDER = docker | local | vercel | daytona     (where it runs)
 *
 * The same `chat()` + `withSandbox()` wiring drives every combination. The ONE
 * provider-dependent seam is the PREVIEW + host-tool story (`toolBridge`):
 *
 * - **Same-machine** providers (docker, local) can reach the host, so we BRIDGE
 *   host tools (`tanstackStartRecipe`, `exposePreview`) into the agent over MCP and
 *   let it mint the preview URL on demand once its dev server is up.
 * - **Hosted** providers (vercel, daytona) can't reach loopback by default, so the
 *   recipe is inlined and the host pre-mints the preview URL ({@link resolvePreviewUrl}).
 *   Set `NGROK_AUTHTOKEN` (or deploy with a public bridge URL) to tunnel the bridge
 *   out so remote sandboxes can call `tanstackStartRecipe` + `exposePreview` instead.
 *
 * The structure mirrors `ts-react-chat`'s `sandbox-triage.ts` (the read-only issue
 * triage demo); this is its build-and-preview sibling.
 */
import { toolDefinition } from '@tanstack/ai'
import { antigravityCliText } from '@tanstack/ai-antigravity-cli'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codexText } from '@tanstack/ai-codex'
import {
  GROK_CLI_INSTALL_COMMAND,
  grokBuildText,
} from '@tanstack/ai-grok-build'
import { opencodeText } from '@tanstack/ai-opencode'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'
import { ngrokConfigured } from '@tanstack/ai-sandbox/ngrok'
import { z } from 'zod'
import { isHarness, isProvider } from './sandbox-options'
import type {
  GrokBuildModel,
  GrokBuildProtocol,
  GrokTransport,
  HarnessName,
  ProviderName,
} from './sandbox-options'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { SandboxDefinition, SandboxProvider } from '@tanstack/ai-sandbox'

export { isHarness, isProvider }
export type { HarnessName, ProviderName }

/** The conventional sandbox workspace root. */
const WORKDIR = '/workspace'

/** Docker base image override (`node:22` ships node + npm + git). */
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? 'node:22'

/** Vercel microVM lifetime — generous so a scaffold + install + run fits. */
const VERCEL_TIMEOUT_MS = 1000 * 60 * 30

/**
 * The ONE dev-server port the agent's app must bind. On every provider the preview
 * is wired to exactly this port (published/declared at create, or resolved by the
 * provider), so the recipe + guidance below tell the agent to use it.
 */
export const PREVIEW_PORT = 5173

// ---------------------------------------------------------------------------
// Harness axis
// ---------------------------------------------------------------------------

interface HarnessSpec {
  makeAdapter: () => AnyTextAdapter
  /**
   * The COMPLETE shell command to install the CLI on first create (sandboxed
   * providers only); null = nothing to install. Each harness owns its own retry
   * strategy — npm-based ones use {@link npmGlobal} (EACCES → sudo fallback); grok
   * runs its own installer script.
   */
  installCommand: string | null
  /** Env vars the in-sandbox CLI needs; any that are set are injected as secrets. */
  requiredEnv: Array<string>
  /** Either/or auth check (overrides `requiredEnv`) → missing vars, or [] if ok. */
  envCheck?: () => Array<string>
  /** Custom secret mapping for a SANDBOXED run (e.g. codex → CODEX_API_KEY). */
  sandboxSecrets?: () => Record<string, string>
  /** Port the in-sandbox CLI listens on that the host must reach (opencode serve). */
  exposePort?: number
}

/**
 * A global npm install with a sudo fallback: some images (Daytona) run as a
 * non-root user with a root-owned global npm prefix → `-g` fails EACCES; retry
 * under passwordless sudo, preserving PATH so nvm's npm/node still resolve. Docker
 * runs as root, so the direct install succeeds and sudo never runs.
 */
function npmGlobal(spec: string): string {
  return `npm install -g ${spec}`
}

const HARNESSES: Record<HarnessName, HarnessSpec> = {
  'antigravity-cli': {
    makeAdapter: () => antigravityCliText('auto'),
    installCommand:
      'curl -fsSL https://antigravity.google/cli/install.sh | bash && ln -sf $HOME/.antigravity/bin/agy /usr/local/bin/agy',
    requiredEnv: ['GEMINI_API_KEY'],
  },
  'claude-code': {
    makeAdapter: () => claudeCodeText('sonnet'),
    // `--include=optional`: the CLI's native binary ships as a platform-specific
    // OPTIONAL dep; a plain `-g` install can skip it, leaving a broken `claude`.
    installCommand: npmGlobal('@anthropic-ai/claude-code --include=optional'),
    requiredEnv: ['ANTHROPIC_API_KEY'],
  },
  codex: {
    // `danger-full-access`: codex already runs inside an isolated sandbox (or a
    // trusted host), so its inner OS sandbox is redundant — and unsupported on
    // some images (Daytona) / Windows. The outer sandbox is the real boundary.
    makeAdapter: () =>
      codexText('gpt-5.5', { sandboxMode: 'danger-full-access' }),
    installCommand: npmGlobal('@openai/codex --include=optional'),
    // `codex exec` authenticates headlessly via CODEX_API_KEY (a bare
    // OPENAI_API_KEY hits its OAuth WebSocket path → 401). Accept either; inject
    // the value AS CODEX_API_KEY into the sandbox.
    requiredEnv: ['CODEX_API_KEY'],
    envCheck: () =>
      process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY
        ? []
        : ['CODEX_API_KEY (or OPENAI_API_KEY)'],
    sandboxSecrets: (): Record<string, string> => {
      const key = process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY
      return key ? { CODEX_API_KEY: key } : {}
    },
  },
  opencode: {
    makeAdapter: () =>
      opencodeText('openai/gpt-5.1-codex', {
        directory: WORKDIR,
        // Isolated sandbox → let the harness edit + run without prompting.
        permissionMode: 'bypassPermissions',
      }),
    installCommand: npmGlobal('opencode-ai'),
    requiredEnv: ['OPENAI_API_KEY'],
    // `opencode serve` listens here; the host SDK reaches it over HTTP, so
    // sandboxed providers must publish/expose it. Matches the adapter default.
    exposePort: 4096,
  },
  grok: {
    makeAdapter: () => grokBuildText('composer-2.5'),
    // `grok agent serve` listens here for WebSocket ACP when stdin isn't wired.
    exposePort: 2419,
    // Grok Build ships its own installer (not npm) — see https://x.ai/cli.
    installCommand: GROK_CLI_INSTALL_COMMAND,
    // The `grok` CLI authenticates headlessly via XAI_API_KEY (GROK_API_KEY alias).
    requiredEnv: ['XAI_API_KEY'],
    envCheck: () =>
      process.env.XAI_API_KEY || process.env.GROK_API_KEY
        ? []
        : ['XAI_API_KEY (or GROK_API_KEY)'],
    sandboxSecrets: (): Record<string, string> => {
      const key = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY
      return key ? { XAI_API_KEY: key } : {}
    },
  },
}

// ---------------------------------------------------------------------------
// Provider axis
// ---------------------------------------------------------------------------

interface ProviderSpec {
  /** `ports` are host-reachable ports to publish/declare (preview + harness). */
  make: (ports: Array<number>) => SandboxProvider
  requiredEnv: Array<string>
  envCheck?: () => Array<string>
  /**
   * Can the in-sandbox agent reach the host's localhost tool bridge? Same-machine
   * providers can (so we bridge tools + mint the preview on demand); hosted cloud
   * sandboxes can't (so we inline the recipe + pre-mint the preview URL).
   */
  toolBridge: boolean
}

const PROVIDERS: Record<ProviderName, ProviderSpec> = {
  docker: {
    make: (ports) =>
      dockerSandbox({ image: SANDBOX_IMAGE, publishPorts: ports }),
    requiredEnv: [],
    toolBridge: true,
  },
  local: {
    // Runs on the host — no isolation, no port publishing (the dev server is
    // reachable at 127.0.0.1 directly). The chosen CLI must be on your PATH.
    make: () => localProcessSandbox(),
    requiredEnv: [],
    toolBridge: true,
  },
  vercel: {
    make: (ports) =>
      vercelSandbox({
        runtime: 'node24',
        timeout: VERCEL_TIMEOUT_MS,
        ports,
        persistent: true,
      }),
    // Either a self-contained OIDC token (`vercel env pull` → VERCEL_OIDC_TOKEN),
    // OR token + team + project (off-Vercel, no OIDC).
    requiredEnv: ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'],
    envCheck: () =>
      process.env.VERCEL_OIDC_TOKEN
        ? []
        : ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'].filter(
            (key) => !process.env[key],
          ),
    toolBridge: false,
  },
  daytona: {
    // Daytona auto-exposes ports via preview URLs, so it ignores `ports`.
    make: () => daytonaSandbox(),
    requiredEnv: ['DAYTONA_API_KEY'],
    toolBridge: false,
  },
}

/**
 * Whether the in-sandbox agent can reach the default bridge (localhost /
 * `host.docker.internal`) without a tunnel.
 */
export function usesToolBridge(provider: ProviderName): boolean {
  return PROVIDERS[provider].toolBridge
}

/**
 * Whether host tools can be bridged for this provider on this run. Same-machine
 * providers reach the bridge directly; remote providers need `NGROK_AUTHTOKEN`
 * (local dev) or a deployed orchestrator public URL.
 */
export function isBridgeReachable(provider: ProviderName): boolean {
  return usesToolBridge(provider) || ngrokConfigured()
}

/** Route the bridge through ngrok for remote providers when configured. */
export function needsNgrokBridge(provider: ProviderName): boolean {
  return !usesToolBridge(provider) && ngrokConfigured()
}

/**
 * System-prompt guidance for local-process: the real workspace is a host temp dir,
 * not `/workspace`. Grok/Claude tools resolve paths literally on the host.
 */
export function localWorkspaceGuidance(workspacePath: string): string {
  return [
    `WORKSPACE: your working directory is ${workspacePath}.`,
    'Do NOT use /workspace — that path does not exist on this machine.',
    'Run commands, scaffold projects, and read/write files only under this directory (or subdirs).',
  ].join('\n')
}

export interface GrokHarnessOptions {
  model?: GrokBuildModel
  protocol?: GrokBuildProtocol
  transport?: GrokTransport
}

/** The harness adapter `chat()` runs for the chosen harness. */
export function buildAdapter(
  harness: HarnessName,
  grokOptions?: GrokHarnessOptions,
): AnyTextAdapter {
  if (harness === 'grok') {
    return grokBuildText(grokOptions?.model ?? 'composer-2.5', {
      protocol: grokOptions?.protocol ?? 'acp',
      transport: grokOptions?.transport ?? 'auto',
    })
  }
  return HARNESSES[harness].makeAdapter()
}

/** Required env vars (harness + provider) that are not set in process.env. */
export function missingEnv(
  harness: HarnessName,
  provider: ProviderName,
): Array<string> {
  // local-process runs the agent on the host with the host's OWN auth (an env key
  // or a `claude login`/`codex login`), so no key is required for it. Sandboxed
  // providers must have a key injected.
  const harnessSpec = HARNESSES[harness]
  const harnessMissing =
    provider === 'local'
      ? []
      : harnessSpec.envCheck
        ? harnessSpec.envCheck()
        : harnessSpec.requiredEnv.filter((key) => !process.env[key])
  const providerSpec = PROVIDERS[provider]
  const providerMissing = providerSpec.envCheck
    ? providerSpec.envCheck()
    : providerSpec.requiredEnv.filter((key) => !process.env[key])
  return [...harnessMissing, ...providerMissing]
}

// ---------------------------------------------------------------------------
// Scaffolding recipe (shared) + the two preview strategies
// ---------------------------------------------------------------------------

const SCAFFOLD =
  'Scaffold with the TanStack CLI via npx (no global install needed — run it EXACTLY like this): `npx --yes @tanstack/cli create my-app --framework react --no-examples --intent -y`. The package is `@tanstack/cli` (it ships the `tanstack` bin); do NOT guess other package names. `--intent` writes TanStack Intent agent-skill mappings for coding agents. This creates a TanStack Start app and installs deps. (Add `--no-install` to skip install, or `--add-ons <id,…>` for integrations — but keep it env-free; do NOT add auth/database add-ons that need keys.)'

const APP =
  'Turn it into a SELF-CONTAINED interactive app — NO external APIs, NO env vars, NO keys. Pick something visual: a kanban board, a sortable dashboard over a bundled data.json, a markdown notepad, a drawing pad, or a small game (e.g. Game of Life). Keep all state client-side (persist to localStorage). Make it look polished.'

/** Run step for the BRIDGE strategy: bind wide, then call `exposePreview`. */
const RUN_BRIDGE = `FIRST, so the published host port reaches the dev server, add \`server: { host: true, allowedHosts: true }\` to the app's \`vite.config.ts\` (bind all interfaces + accept any host). THEN start the dev server bound to all interfaces on PORT ${PREVIEW_PORT} — it MUST be ${PREVIEW_PORT}, because that is the port wired to the preview: \`pnpm dev --host 0.0.0.0 --port ${PREVIEW_PORT}\` (or \`npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}\`). Once it is listening, call the \`exposePreview\` tool with \`{ "port": ${PREVIEW_PORT} }\` to get a preview URL and share it with the user. The app runs with ZERO configuration — no API keys or env needed.`

/** Run step for the PRE-MINT strategy: bind wide; the host already minted the URL. */
const RUN_PREMINT = `FIRST, so the public preview URL reaches the dev server, add \`server: { host: true, allowedHosts: true }\` to the app's \`vite.config.ts\` (bind all interfaces + accept any host). THEN start the dev server bound to all interfaces on PORT ${PREVIEW_PORT} — it MUST be ${PREVIEW_PORT}, because that is the port wired to the public preview URL: \`pnpm dev --host 0.0.0.0 --port ${PREVIEW_PORT}\` (or \`npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}\`). The app runs with ZERO configuration — no API keys or env needed.`

/**
 * The recipe as a bridged host tool (same-machine providers). The agent sees it
 * over MCP and calls it BEFORE scaffolding.
 */
export const tanstackStartRecipe = toolDefinition({
  name: 'tanstackStartRecipe',
  description:
    'The canonical recipe for building a self-contained TanStack Start app in this sandbox that runs with no env or API keys: scaffold via `npx --yes @tanstack/cli create … --intent`, what to build, and how to bind/expose the dev server for a preview URL. Call this BEFORE scaffolding.',
  inputSchema: z.object({
    section: z
      .enum(['scaffold', 'app', 'run', 'all'])
      .describe('Which part of the recipe you need (use "all" first).'),
  }),
}).server(({ section }) => {
  const recipe = { scaffold: SCAFFOLD, app: APP, run: RUN_BRIDGE }
  return section === 'all' ? recipe : { [section]: recipe[section] }
})

/** The recipe inlined as system-prompt text (hosted providers — no bridge). */
export const RECIPE_GUIDANCE: string = [
  'RECIPE — build a self-contained TanStack Start app in this sandbox that runs with no env or API keys:',
  `1. Scaffold: ${SCAFFOLD}`,
  `2. Build: ${APP}`,
  `3. Run: ${RUN_PREMINT}`,
].join('\n')

/**
 * System-prompt preview guidance for the BRIDGE strategy: bind wide on
 * {@link PREVIEW_PORT}, then call `exposePreview` for the URL.
 */
export const PREVIEW_GUIDANCE: string = [
  'PREVIEW SERVERS: to show the user a running web app, start its dev server bound',
  `to 0.0.0.0 on port ${PREVIEW_PORT} (this is the ONLY port exposed to the host, so`,
  `it must be ${PREVIEW_PORT}), then call the \`exposePreview\` tool with`,
  `\`{ "port": ${PREVIEW_PORT} }\`. It returns a preview URL the user can open.`,
  'Bind all interfaces and allow all hosts in the dev-server config before starting:',
  '• Vite — `server: { host: true, allowedHosts: true }` in vite.config.',
  "• webpack-dev-server — `allowedHosts: 'all'` (and `host: '0.0.0.0'`).",
  'Once it is listening, call `exposePreview`, then share the URL.',
].join('\n')

/**
 * System-prompt preview guidance for the PRE-MINT strategy. The hosted sandbox
 * can't reach your machine, so the host has ALREADY minted the public URL for
 * {@link PREVIEW_PORT}; the agent just binds the dev server and shares it.
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
// The sandbox definition (harness × provider)
// ---------------------------------------------------------------------------

/** One sandbox per (harness, provider, thread): switching a picker → fresh sandbox. */
export function buildSandbox(opts: {
  harness: HarnessName
  provider: ProviderName
  threadId: string
}): SandboxDefinition {
  const harness = HARNESSES[opts.harness]
  // Publish/declare the preview port + any harness-specific port (opencode serve).
  const ports = [
    PREVIEW_PORT,
    ...(harness.exposePort !== undefined ? [harness.exposePort] : []),
  ]
  const provider = PROVIDERS[opts.provider].make(ports)

  // Inject auth secrets only for sandboxed providers — local-process inherits the
  // host's own env, so nothing to inject.
  const secretEnv: Record<string, string> = {}
  if (opts.provider !== 'local') {
    if (harness.sandboxSecrets) {
      Object.assign(secretEnv, harness.sandboxSecrets())
    } else {
      for (const key of harness.requiredEnv) {
        const value = process.env[key]
        if (value) secretEnv[key] = value
      }
    }
    for (const key of PROVIDERS[opts.provider].requiredEnv) {
      const value = process.env[key]
      if (value) secretEnv[key] = value
    }
  }

  return defineSandbox({
    id: `sandbox-web-${opts.harness}-${opts.provider}-${opts.threadId}`,
    provider,
    workspace: defineWorkspace({
      // No source to clone — the agent scaffolds a fresh app.
      source: { type: 'none' },
      setup: ({ serial }) => {
        // Install the harness CLI into the fresh sandbox for every provider EXCEPT
        // local-process (which uses the host's CLI on PATH). Each command is
        // self-contained (its own EACCES/sudo handling) — see HarnessSpec.
        if (opts.provider !== 'local' && harness.installCommand) {
          serial(harness.installCommand)
        }
      },
      secrets: createSecrets(secretEnv),
    }),
    lifecycle: { reuse: 'thread' },
  })
}

/**
 * The `exposePreview` server tool for one run (BRIDGE strategy). Minting a preview
 * URL is a HOST-side call (`handle.ports.connect`), so the in-sandbox agent calls
 * this bridged tool instead. Resumes the run's sandbox by `threadId` (a no-op
 * `ensure`, since `withSandbox` already created it) and resolves the host-port URL.
 */
export function makeExposePreviewTool(
  definition: SandboxDefinition,
  threadId: string,
) {
  return toolDefinition({
    name: 'exposePreview',
    description: `Expose a port a dev server is listening on inside the sandbox and return a preview URL to show the user. Call this AFTER the server is up and listening on port ${PREVIEW_PORT}.`,
    inputSchema: z.object({
      port: z
        .number()
        .int()
        .min(1024)
        .max(65535)
        .describe(
          `The port the dev server is listening on, e.g. ${PREVIEW_PORT}.`,
        ),
    }),
  }).server(async ({ port }) => {
    const handle = await definition.ensure({
      threadId,
      runId: 'expose-preview',
    })
    const channel = await handle.ports.connect(port)
    return { url: channel.url }
  })
}

/**
 * Resolve the public preview URL for {@link PREVIEW_PORT} up front (PRE-MINT
 * strategy). On a hosted provider the in-sandbox agent can't call back to mint it,
 * so the host resolves it and feeds it into the system prompt.
 */
export async function resolvePreviewUrl(
  definition: SandboxDefinition,
  threadId: string,
): Promise<string> {
  const handle = await definition.ensure({ threadId, runId: 'resolve-preview' })
  const channel = await handle.ports.connect(PREVIEW_PORT)
  return channel.url
}
