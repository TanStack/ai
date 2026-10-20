import type { AnyHarness, HarnessHost, HarnessUser } from '@tanstack/ai-harness'
import type { OpenAccess } from '@tanstack/ai-harness/server'

// The packages behind `--acp`, `--mcp`, and `/mcp` are optional. The
// specifier is a variable, so a build or a type check never needs them, and
// a version without harness support is the same as none.

/**
 * Import `specifier` and check that it has the functions in `names`.
 * Resolves to `undefined` when the package is not installed, when its
 * version does not export `specifier`, or when it has no such functions.
 * Any other error (a syntax error, or a failing import inside the module)
 * throws, with `specifier` in the message.
 */
export async function loadOptional<T>(
  specifier: string,
  ...names: Array<keyof T & string>
) {
  // Resolve first: a resolve error is about `specifier` itself, so its code
  // alone says "not installed". A missing package that the module imports
  // fails the import below, and throws.
  try {
    import.meta.resolve(specifier)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw loadError(specifier, error)
  }
  let loaded: unknown
  try {
    loaded = await import(/* @vite-ignore */ specifier)
  } catch (error) {
    throw loadError(specifier, error)
  }
  return hasFunctions<T>(loaded, names) ? loaded : undefined
}

/** True when a resolve error says that the package or its export is not there. */
function isMissing(error: unknown) {
  if (!(error instanceof Error) || !('code' in error)) return false
  return (
    error.code === 'ERR_MODULE_NOT_FOUND' ||
    error.code === 'MODULE_NOT_FOUND' ||
    error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  )
}

function loadError(specifier: string, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error)
  return new Error(`Could not load ${specifier}: ${reason}`, { cause: error })
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
  createHarnessMcpServer: <U extends HarnessUser>(options: {
    host: HarnessHost<U>
    harness: AnyHarness
    /** For a host without access: who the calls run as. */
    openAccess?: OpenAccess<U>
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
  serveAcp: <U extends HarnessUser>(options: {
    host: HarnessHost<U>
    harness: AnyHarness
    /** The local user. Required on a host with access. */
    user?: U
  }) => {
    closed: Promise<unknown>
    close: () => void
  }
}
