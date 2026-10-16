/**
 * Open Generative UI Specification (Draft 0.2) — The Frame Tier (Tier F).
 *
 * Browser-safe, host-agnostic core: artifact store, module registry, serving
 * shell + CSP + bridge client, the host-side bridge protocol, the import
 * allowlist / build interface, the agent-facing artifact tools, and fixtures.
 * The server-only compiler (esbuild) is injected by the host as an
 * `ArtifactBuilder`, so nothing here pulls a Node-only dependency.
 */

export * from './types'
export * from './registry'
export * from './store'
export * from './shell'
export * from './bridge'
export * from './build'
export * from './tools'
export * from './fixtures'
