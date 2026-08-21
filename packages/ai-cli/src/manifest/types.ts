/**
 * Declarative command manifest types.
 *
 * The manifest is the single source of truth for the CLI surface. The commander
 * program, the `introspect --json` document, and the `ts-ai mcp` tool list are
 * all generated from it, so they can never drift apart.
 */

/** A core `@tanstack/ai` activity a generation command maps onto. */
export type Activity =
  | 'chat'
  | 'image'
  | 'video'
  | 'audio'
  | 'speech'
  | 'transcription'
  | 'summarize'

export type FlagType = 'string' | 'number' | 'boolean' | 'string[]' | 'json'

/** A single command-line flag. */
export interface FlagSpec {
  /** Canonical camelCase identifier; also the key on the parsed options bag. */
  name: string
  /** The exact CLI flag spelling (kebab-cased), populated in the introspect doc. */
  flag?: string
  /** Single-char alias without dash, e.g. `o` for `-o`. */
  short?: string
  type: FlagType
  description: string
  /** Default value, surfaced in `introspect` and `--help`. */
  default?: string | number | boolean
  /** Repeatable flag (collected into an array). Implies `string[]`. */
  repeatable?: boolean
  /** Hidden from `--help` (still parsed). */
  hidden?: boolean
}

/**
 * A command in the manifest. `activity` is present for the seven generation
 * commands and absent for meta commands (`introspect`, `mcp`, `update`).
 */
export interface CommandSpec {
  name: string
  /** Hidden command aliases, e.g. `tts` -> `speech`. */
  aliases?: Array<string>
  description: string
  activity?: Activity
  /** Whether the command consumes a positional prompt / input text. */
  acceptsPrompt: boolean
  /** Whether the activity writes a binary artifact (image/video/audio/speech). */
  producesArtifact: boolean
  /** Marked experimental in core (currently `video`). */
  experimental?: boolean
  /** Command-specific flags (common flags are added globally). */
  flags: Array<FlagSpec>
}

/** The serialized `introspect` document. */
export interface CliManifest {
  /** CLI binary name. */
  bin: string
  /** Manifest schema version (independent of package version). */
  manifestVersion: string
  /** Package version this binary was built from. */
  cliVersion: string
  /** Providers bundled for zero-install use. */
  bundledProviders: Array<string>
  /** Common flags accepted by every command. */
  commonFlags: Array<FlagSpec>
  commands: Array<CommandSpec>
  exitCodes: Record<string, number>
}
