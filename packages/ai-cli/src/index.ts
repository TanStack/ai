/**
 * Programmatic entry point for `@tanstack/ai-cli`.
 *
 * The executable lives in `src/cli` (built separately as the `ts-ai` bin). This
 * module exports the declarative manifest and supporting types so tooling can
 * introspect the CLI surface without spawning the binary.
 */
export { buildManifest, MANIFEST_VERSION, COMMANDS, COMMON_FLAGS, findCommand } from './manifest/manifest'
export type {
  Activity,
  CliManifest,
  CommandSpec,
  FlagSpec,
  FlagType,
} from './manifest/types'
export { ExitCode, CliError } from './core/exit-codes'
export type { ExitCodeValue, CliErrorCode } from './core/exit-codes'
export { resolveModelSlug, bundledProviders } from './core/providers'
export type { OutputMode } from './core/output'
