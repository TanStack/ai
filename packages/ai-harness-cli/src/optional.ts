import type { AnyHarness, HarnessHost, Principal } from '@tanstack/ai-harness'
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
  let loaded: unknown
  try {
    loaded = await import(/* @vite-ignore */ specifier)
  } catch (error) {
    if (isMissing(error, specifier)) return undefined
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not load ${specifier}: ${reason}`, { cause: error })
  }
  return hasFunctions<T>(loaded, names) ? loaded : undefined
}

/** The package of a bare specifier: `@scope/name` or `name`. */
function packageName(specifier: string) {
  const parts = specifier.split('/')
  const count = specifier.startsWith('@') ? 2 : 1
  return parts.slice(0, count).join('/')
}

/**
 * True when `error` says that `specifier` is not installed, or that its
 * package does not export it. The error must name `specifier` or its
 * package, so a missing package that the module itself imports is not this.
 */
function isMissing(error: unknown, specifier: string) {
  if (!(error instanceof Error) || !('code' in error)) return false
  const name = packageName(specifier)
  // A Windows path in the message uses backslashes.
  const message = error.message.replaceAll('\\', '/')
  switch (error.code) {
    case 'ERR_MODULE_NOT_FOUND':
    case 'MODULE_NOT_FOUND':
      return message.includes(`'${specifier}'`) || message.includes(`'${name}'`)
    case 'ERR_PACKAGE_PATH_NOT_EXPORTED':
      return (
        message.includes(`'.${specifier.slice(name.length)}'`) &&
        message.includes(`/${name}/package.json`)
      )
    default:
      return false
  }
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
