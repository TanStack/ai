import { buildManifest } from '../manifest/manifest'
import { emitJson } from '../core/emit'

/**
 * `ts-ai introspect` — emit the machine-readable manifest of the entire CLI
 * surface so a harness can auto-generate tool/function definitions.
 */
export function runIntrospect(cliVersion: string): void {
  emitJson(buildManifest(cliVersion))
}
