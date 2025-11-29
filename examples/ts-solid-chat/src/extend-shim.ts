// ESM shim for extend package (CJS/ESM interop issues)
// Implements deep object extend/merge functionality

type ExtendTarget = Record<string, unknown> | ((...args: unknown[]) => unknown)

function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  if (!obj || Object.prototype.toString.call(obj) !== '[object Object]') {
    return false
  }
  const proto = Object.getPrototypeOf(obj)
  return proto === null || proto === Object.prototype
}

function extend(deep: boolean, target: ExtendTarget, ...sources: unknown[]): ExtendTarget
function extend(target: ExtendTarget, ...sources: unknown[]): ExtendTarget
function extend(...args: unknown[]): ExtendTarget {
  let deep = false
  let i = 0

  // Check if first argument is a boolean (deep flag)
  if (typeof args[0] === 'boolean') {
    deep = args[0]
    i = 1
  }

  let target = args[i] as ExtendTarget
  i++

  // Handle case where target is null or not an object
  if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
    target = {}
  }

  for (; i < args.length; i++) {
    const source = args[i]
    if (source == null) continue

    for (const key in source as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue

      const srcVal = (target as Record<string, unknown>)[key]
      const copyVal = (source as Record<string, unknown>)[key]

      // Prevent infinite loop
      if (target === copyVal) continue

      // Recurse if deep and merging objects/arrays
      if (deep && copyVal && (isPlainObject(copyVal) || Array.isArray(copyVal))) {
        let clone: Record<string, unknown> | unknown[]
        if (Array.isArray(copyVal)) {
          clone = Array.isArray(srcVal) ? srcVal : []
        } else {
          clone = isPlainObject(srcVal) ? srcVal : {}
        }
        ;(target as Record<string, unknown>)[key] = extend(deep, clone as ExtendTarget, copyVal)
      } else if (copyVal !== undefined) {
        ;(target as Record<string, unknown>)[key] = copyVal
      }
    }
  }

  return target
}

export default extend
export { extend }
