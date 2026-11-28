import type {
  AuthInfo,
  ClientPolicy,
  Facades,
  FacadeContext,
  ToolBinding,
} from './types'

/** Dotted facade name → a JS identifier usable as an isolate binding name. */
export function safeName(dotted: string): string {
  return `facade_${dotted.replace(/[^A-Za-z0-9_$]/g, '_')}`
}

/**
 * Resolve which declared facades this caller may use (apply per-client
 * policy) and verify each exists. Throws on an unknown facade — a manifest
 * injecting something the server can't provide is a configuration error.
 */
export function resolveAllowed(
  declared: ReadonlyArray<string>,
  facades: Facades,
  authInfo: AuthInfo,
  policy?: ClientPolicy,
): ReadonlyArray<string> {
  for (const dotted of declared) {
    if (!facades[dotted]) {
      throw new Error(`Manifest injects unknown facade "${dotted}"`)
    }
  }
  if (!policy) return declared
  const declaredSet = new Set(declared)
  // Policy can only narrow, never widen past what the manifest declared.
  return policy(authInfo, declared).filter((n) => declaredSet.has(n))
}

/**
 * Wrap the allowed facades as isolate bindings. Each binding's `execute`
 * ticks the call counter and injects `FacadeContext` (authInfo, clientId).
 */
export function buildBindings(opts: {
  allowed: ReadonlyArray<string>
  facades: Facades
  authInfo: AuthInfo
  signal?: AbortSignal
  tick: () => void
}): Record<string, ToolBinding> {
  const { allowed, facades, authInfo, signal, tick } = opts
  const ctx: FacadeContext = { authInfo, clientId: authInfo.clientId, signal }

  const bindings: Record<string, ToolBinding> = {}
  const seen = new Set<string>()
  for (const dotted of allowed) {
    const key = safeName(dotted)
    if (seen.has(key)) {
      throw new Error(`Facade name collision after sanitizing: "${dotted}"`)
    }
    seen.add(key)
    const facade = facades[dotted]
    if (!facade) continue // resolveAllowed already verified existence
    bindings[key] = {
      name: key,
      description: facade.description ?? dotted,
      inputSchema: facade.inputSchema ?? {},
      execute: async (args) => {
        tick()
        return facade.execute(args, ctx)
      },
    }
  }
  return bindings
}

/**
 * Prelude evaluated before the snippet: rebuilds the `host.<ns>.<fn>` tree
 * from the flat bindings and binds `input`. Only allowed facades appear, so
 * a denied one is simply absent (a call to it throws in-isolate).
 */
export function buildPrelude(
  allowed: ReadonlyArray<string>,
  input: unknown,
): string {
  const lines = ['const host = {};']
  for (const dotted of allowed) {
    const parts = dotted.split('.')
    let path = 'host'
    for (let i = 0; i < parts.length - 1; i++) {
      path += `[${JSON.stringify(parts[i])}]`
      lines.push(`${path} = ${path} || {};`)
    }
    lines.push(
      `${path}[${JSON.stringify(parts[parts.length - 1])}] = ${safeName(dotted)};`,
    )
  }
  // Parse the input as JSON inside the isolate instead of inlining an object
  // literal: JSON.parse keeps a "__proto__" key as an own property, whereas an
  // object literal would run the prototype setter and drop it.
  lines.push(
    `const input = JSON.parse(${JSON.stringify(JSON.stringify(input ?? {}))});`,
  )
  return lines.join('\n')
}
