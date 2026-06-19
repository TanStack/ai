/**
 * Type-safe secret references for sandbox workspace definitions.
 *
 * Values are stored in a Map under a non-enumerable symbol key on the returned
 * object so that `Object.keys(secrets)` only yields the ref names, never the
 * registry or the underlying plaintext values.
 */

/** A reference to a named secret — carries only the name, never the value. */
export type SecretRef = { readonly __secretName: string }

/**
 * A map of named SecretRef properties. The underlying value registry is stored
 * under a non-enumerable symbol so iterating the object never exposes it.
 */
export type Secrets<K extends string = string> = { readonly [P in K]: SecretRef }

/** Internal symbol used to store the value registry on a Secrets object. */
const REGISTRY = Symbol('secrets.registry')

/** Create a typed secrets object from a plain record of name→value pairs. */
export function createSecrets<T extends Record<string, string>>(
  values: T,
): Secrets<keyof T & string> {
  const registry = new Map<string, string>(Object.entries(values))
  const obj = {} as Record<string, SecretRef>

  for (const name of Object.keys(values)) {
    obj[name] = Object.freeze({ __secretName: name })
  }

  Object.defineProperty(obj, REGISTRY, {
    value: registry,
    enumerable: false,
    configurable: false,
    writable: false,
  })

  return obj as Secrets<keyof T & string>
}

/** Marker type for a bearer-token value derived from a SecretRef. */
export type BearerRef = { readonly __bearerRef: SecretRef }

/** Create a bearer-token marker that resolves to `Bearer <value>` at runtime. */
export function bearer(ref: SecretRef): BearerRef {
  return Object.freeze({ __bearerRef: ref })
}

/** Return true when `x` is a SecretRef. */
export function isSecretRef(x: unknown): x is SecretRef {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as Record<string, unknown>)['__secretName'] === 'string'
  )
}

/** Resolve a SecretRef to its plaintext value using the secrets object. */
export function resolveSecret(secrets: Secrets, ref: SecretRef): string {
  const registry = (secrets as unknown as Record<symbol, Map<string, string>>)[REGISTRY]
  if (registry === undefined) {
    throw new Error('resolveSecret: secrets object has no registry')
  }
  const value = registry.get(ref.__secretName)
  if (value === undefined) {
    throw new Error(`resolveSecret: unknown secret "${ref.__secretName}"`)
  }
  return value
}

/** Resolve a BearerRef to a `Bearer <value>` string. */
export function resolveBearer(secrets: Secrets, ref: BearerRef): string {
  return `Bearer ${resolveSecret(secrets, ref.__bearerRef)}`
}
