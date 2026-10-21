/**
 * Build-at-write-time support (Draft 0.2 §7.3.3). The actual TSX→ESM compile
 * runs server-side in the host (esbuild in the reference host) and is injected
 * as an `ArtifactBuilder` so the published package stays browser-safe. What
 * lives here is the browser-safe, testable part: the import-allowlist preflight
 * that turns disallowed imports into model-facing build diagnostics *before*
 * any compiler runs.
 */

import { checkImports } from './registry'
import type { ArtifactBuilder, BuildResult, ModuleRegistry } from './types'

export type { ArtifactBuilder } from './types'

/**
 * Run the import allowlist gate (§7.3.3). Returns a failing `BuildResult` when
 * the source imports anything outside the registry (or a relative path), else
 * `null` to proceed to compilation. The returned `externals` on success are the
 * registry specifiers the shell's import map must resolve.
 */
export function preflightReactImports(
  source: string,
  registry: ModuleRegistry,
): { result: BuildResult | null; externals: Array<string> } {
  const check = checkImports(source, registry)
  if (!check.ok) {
    return {
      result: {
        ok: false,
        buildLog: check.diagnostics
          .map((d) => `import error: ${d.message}`)
          .join('\n'),
        diagnostics: check.diagnostics,
      },
      externals: check.externals,
    }
  }
  return { result: null, externals: check.externals }
}

/**
 * Wrap an injected low-level compiler (e.g. esbuild transform) with the
 * preflight gate and external-resolution bookkeeping, producing a spec-shaped
 * `ArtifactBuilder`. The `transform` only needs to turn TSX into ESM JS,
 * treating the given `externals` as external imports.
 */
export function makeReactBuilder(
  transform: (input: {
    source: string
    externals: Array<string>
  }) => Promise<
    { code: string } | { error: string; line?: number; column?: number }
  >,
): ArtifactBuilder {
  return {
    async build({ kind, source, registry }): Promise<BuildResult> {
      if (kind !== 'react-tsx') {
        // html-fragment is not compiled; the shell inlines the source (§7.1).
        return {
          ok: true,
          code: source,
          buildLog: 'html-fragment: no build step',
        }
      }
      const pre = preflightReactImports(source, registry)
      if (pre.result) return pre.result
      const out = await transform({ source, externals: pre.externals })
      if ('error' in out) {
        return {
          ok: false,
          buildLog: out.error,
          diagnostics: [
            { message: out.error, line: out.line, column: out.column },
          ],
        }
      }
      return {
        ok: true,
        code: out.code,
        buildLog: 'built ok',
        externals: pre.externals,
      }
    },
  }
}
