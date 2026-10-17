import type { AnyHarness, HarnessHost, Principal } from '@tanstack/ai-harness'
import type { OpenAccess } from '@tanstack/ai-harness/server'

// The packages behind `--acp`, `--mcp`, `/mcp`, and `--dashboard` are
// optional. The specifier is a variable, so a build or a type check never
// needs them, and a version without harness support is the same as none.

/**
 * Import `specifier` and check that it has the functions in `names`.
 * Resolves to `undefined` when the package is not installed, or when it has
 * no such functions.
 */
export async function loadOptional<T>(
  specifier: string,
  ...names: Array<keyof T & string>
): Promise<T | undefined> {
  const loaded: unknown = await import(/* @vite-ignore */ specifier).catch(
    () => undefined,
  )
  return hasFunctions<T>(loaded, names) ? loaded : undefined
}

function hasFunctions<T>(
  value: unknown,
  names: ReadonlyArray<keyof T & string>,
): value is T {
  return (
    typeof value === 'object' &&
    value !== null &&
    names.every((name) => typeof Reflect.get(value, name) === 'function')
  )
}

/** A server that answers MCP requests, from `@tanstack/ai-mcp/harness`. */
export interface McpFetchServer {
  fetch: (request: Request) => Promise<Response>
}

/** `@tanstack/ai-mcp/harness` */
export interface McpHarnessModule {
  createHarnessMcpServer: <P extends Principal>(options: {
    host: HarnessHost<P>
    harness: AnyHarness
    /** For a host without access: who the calls run as. */
    openAccess?: OpenAccess<P>
    threadId?: string
    approvals?: 'ask' | 'auto'
    filePaths?: Array<string>
  }) => Promise<McpFetchServer>
}

/** `@tanstack/ai-mcp/server/stdio` */
export interface McpStdioModule {
  serveMCPStdio: (server: McpFetchServer) => { close: () => unknown }
}

/** `@tanstack/ai-acp/agent` */
export interface AcpAgentModule {
  serveAcp: <P extends Principal>(options: {
    host: HarnessHost<P>
    harness: AnyHarness
    /** The local user. Required on a host with access. */
    principal?: P
  }) => {
    closed: Promise<unknown>
    close: () => void
  }
}

/**
 * `@tanstack/ai-dashboard/connect`. It takes no principal: its sessions
 * open without one.
 */
export interface DashboardConnectModule {
  connectDashboard: <P extends Principal>(options: {
    host: HarnessHost<P>
    harness: AnyHarness
    url: string
    threads: Array<string>
    token?: string
    onPairingCode?: (code: string) => void
    onToken?: (token: string) => void
  }) => Promise<{ close: () => void }>
}
