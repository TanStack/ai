import type { MCPServerOptions } from './create-server'

// Keeps the options of each server for `directMCPClient`.
// This module imports nothing at runtime, so the client entry point can read
// the options without loading the server SDK.
const serverOptionsByServer = new WeakMap<object, MCPServerOptions>()

/** Internal. Records the options that `server` was created with. */
export function rememberServerOptions(
  server: object,
  options: MCPServerOptions,
) {
  serverOptionsByServer.set(server, options)
}

/** Internal. Returns the options that `server` was created with. */
export function optionsOfServer(server: object) {
  return serverOptionsByServer.get(server)
}
