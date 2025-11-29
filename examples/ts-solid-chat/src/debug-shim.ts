// No-op debug shim for ESM/CJS interop issues
// The debug module is used internally by markdown parsing but not needed in browser

function createDebug(_namespace: string) {
  const debug = () => {}
  debug.enabled = false
  debug.namespace = _namespace
  debug.destroy = () => true
  debug.extend = (namespace: string) => createDebug(`${_namespace}:${namespace}`)
  return debug
}

createDebug.enable = () => {}
createDebug.disable = () => ''
createDebug.enabled = () => false
createDebug.humanize = () => ''
createDebug.coerce = (val: unknown) => val
createDebug.names = [] as RegExp[]
createDebug.skips = [] as RegExp[]
createDebug.formatters = {}

export default createDebug
export { createDebug as debug }
